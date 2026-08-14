from __future__ import annotations

import json
import re
import unicodedata
from collections import Counter
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any

from openpyxl import load_workbook


ROOT = Path(__file__).resolve().parents[1]
WORKBOOK = ROOT / "data" / "contador de renuncias, 1 de agosto.xlsm"
OUTPUT = ROOT / "data" / "cases.json"
SOURCE_OVERRIDES = ROOT / "data" / "source_overrides.json"

INCLUDE_RECOMMENDATIONS = {
    "add_to_core_counter",
    "confirmed_from_raw_3",
    "appointment_not_effective",
}

EXCLUDE_RECOMMENDATIONS = {
    "do_not_count_pending_only",
    "pending_or_unconfirmed",
    "pending_or_paused",
}

VALID_CHILE_MINISTRIES = {
    "Ministerio del Interior",
    "Ministerio de Relaciones Exteriores",
    "Ministerio de Defensa Nacional",
    "Ministerio de Hacienda",
    "Ministerio Secretaría General de la Presidencia",
    "Ministerio Secretaría General de Gobierno",
    "Ministerio de Economía, Fomento y Turismo",
    "Ministerio de Desarrollo Social y Familia",
    "Ministerio de Educación",
    "Ministerio de Justicia y Derechos Humanos",
    "Ministerio del Trabajo y Previsión Social",
    "Ministerio de Obras Públicas",
    "Ministerio de Salud",
    "Ministerio de Vivienda y Urbanismo",
    "Ministerio de Agricultura",
    "Ministerio de Minería",
    "Ministerio de Transportes y Telecomunicaciones",
    "Ministerio de Bienes Nacionales",
    "Ministerio de Energía",
    "Ministerio del Medio Ambiente",
    "Ministerio del Deporte",
    "Ministerio de la Mujer y la Equidad de Género",
    "Ministerio de las Culturas, las Artes y el Patrimonio",
    "Ministerio de Ciencia, Tecnología, Conocimiento e Innovación",
    "Ministerio de Seguridad Pública",
}

MINISTRY_ALIASES = {
    "agricultura": "Ministerio de Agricultura",
    "bienes nacionales": "Ministerio de Bienes Nacionales",
    "ciencia": "Ministerio de Ciencia, Tecnología, Conocimiento e Innovación",
    "ciencia tecnologia conocimiento e innovacion": "Ministerio de Ciencia, Tecnología, Conocimiento e Innovación",
    "culturas": "Ministerio de las Culturas, las Artes y el Patrimonio",
    "culturas artes y patrimonio": "Ministerio de las Culturas, las Artes y el Patrimonio",
    "culturas las artes y el patrimonio": "Ministerio de las Culturas, las Artes y el Patrimonio",
    "desarrollo social y familia": "Ministerio de Desarrollo Social y Familia",
    "desarrollo social y familia mujer y equidad de genero": "Ministerio de Desarrollo Social y Familia",
    "economia": "Ministerio de Economía, Fomento y Turismo",
    "economia fomento y turismo": "Ministerio de Economía, Fomento y Turismo",
    "economia y mineria": "Ministerio de Economía, Fomento y Turismo",
    "educacion": "Ministerio de Educación",
    "energia": "Ministerio de Energía",
    "hacienda": "Ministerio de Hacienda",
    "interior": "Ministerio del Interior",
    "justicia y derechos humanos": "Ministerio de Justicia y Derechos Humanos",
    "medio ambiente": "Ministerio del Medio Ambiente",
    "mineria": "Ministerio de Minería",
    "mujer y equidad de genero": "Ministerio de la Mujer y la Equidad de Género",
    "obras publicas": "Ministerio de Obras Públicas",
    "salud": "Ministerio de Salud",
    "secretaria general de gobierno": "Ministerio Secretaría General de Gobierno",
    "seguridad": "Ministerio de Seguridad Pública",
    "seguridad publica": "Ministerio de Seguridad Pública",
    "trabajo": "Ministerio del Trabajo y Previsión Social",
    "trabajo y prevision social": "Ministerio del Trabajo y Previsión Social",
    "transportes y telecomunicaciones": "Ministerio de Transportes y Telecomunicaciones",
    "vivienda y urbanismo": "Ministerio de Vivienda y Urbanismo",
}


def strip_accents(value: str) -> str:
    return "".join(
        ch for ch in unicodedata.normalize("NFKD", value) if not unicodedata.combining(ch)
    )


def clean_text(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    if not text or text.lower() == "none":
        return None
    return re.sub(r"\s+", " ", text)


def load_source_overrides() -> dict[str, dict[str, str | None]]:
    if not SOURCE_OVERRIDES.exists():
        return {}
    return json.loads(SOURCE_OVERRIDES.read_text(encoding="utf-8"))


def iso_date(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date().isoformat()
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, (int, float)):
        # Excel's Windows date system starts at 1899-12-30.
        return (date(1899, 12, 30) + timedelta(days=int(value))).isoformat()
    text = clean_text(value)
    if not text:
        return None
    parsed = datetime.fromisoformat(text.replace(" 00:00:00", ""))
    return parsed.date().isoformat()


def numeric_counter(value: Any) -> int | None:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return int(value)
    text = clean_text(value)
    if not text:
        return None
    try:
        return int(float(text))
    except ValueError:
        return None


def office_level(raw: str | None) -> str:
    text = strip_accents((raw or "").lower())
    if re.search(r"\bministro\b|\bministra\b", text):
        return "minister"
    if re.search(r"\bsubsecretario\b|\bsubsecretaria\b", text):
        return "subsecretary"
    if "seremi" in text:
        return "seremi"
    if "director/a nacional" in text or "directora nacional" in text or "director nacional" in text:
        return "national_director"
    if "director/a regional" in text or "directora regional" in text or "director regional" in text:
        return "regional_director"
    if "subdirector" in text:
        return "deputy_director"
    if "jefe" in text or "jefa" in text:
        return "division_head"
    return "other"


def slugify(value: str | None) -> str:
    text = strip_accents((value or "otros cargos").lower())
    text = re.sub(r"[^a-z0-9]+", "_", text).strip("_")
    return text or "otros_cargos"


def normalize_lookup_key(value: str | None) -> str:
    text = strip_accents((value or "").lower())
    text = re.sub(r"[^a-z0-9]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def ministry_from_master(row: dict[str, Any]) -> str:
    raw = clean_text(row.get("ministerio_master"))
    key = normalize_lookup_key(raw)
    ministry = MINISTRY_ALIASES.get(key)
    if ministry not in VALID_CHILE_MINISTRIES:
        case_id = clean_text(row.get("master_id")) or "sin_id"
        raise ValueError(f"Ministerio master invalido en {case_id}: {raw!r}")
    return ministry


def region_group(value: str) -> str:
    normalized = strip_accents(value.lower())
    if normalized == "nacional":
        return "Gobierno central"
    if normalized in {"araucania", "la araucania"}:
        return "La Araucanía"
    if normalized in {"metropolitana", "region metropolitana"}:
        return "Región Metropolitana"
    return value


def exit_type(raw: str | None) -> str:
    text = strip_accents((raw or "").lower())
    if "movimiento" in text:
        return "internal_movement"
    if "nombramiento" in text and ("sin_efecto" in text or "sin efecto" in text):
        return "appointment_not_effective"
    if "solicitada" in text or "no_voluntaria" in text or "no voluntaria" in text:
        return "resignation_requested"
    if "remocion" in text or "desvinculacion" in text:
        return "removed"
    if "voluntaria" in text:
        return "voluntary_resignation"
    if "renuncia" in text or "aceptada" in text:
        return "resignation"
    return "unknown"


def reason_category(row: dict[str, Any], summary: str | None) -> str:
    combined = strip_accents(
        " ".join(
            clean_text(v) or ""
            for v in [
                row.get("tipo_salida_factiva"),
                row.get("razon_renunciaskast"),
                row.get("resumen_factiva"),
                row.get("titular_factiva"),
                summary,
            ]
        ).lower()
    )
    if any(term in combined for term in ["denuncia", "investigacion penal", "acoso", "connotacion sexual"]):
        return "judicial_or_formal_complaint"
    if any(term in combined for term in ["test de drogas", "examen de drogas"]):
        return "drug_test_or_compliance"
    if any(term in combined for term in ["nombramiento", "requisito", "titulo", "semestres", "sin efecto"]):
        return "requirements_or_appointment"
    if any(term in combined for term in ["falta de gestion", "cuestionad", "polemica", "posteos"]):
        return "public_management_questioning"
    if any(term in combined for term in ["tension", "choque", "conflicto"]):
        return "internal_conflict"
    if "motivos personales" in combined or "razones personales" in combined:
        return "personal_reasons"
    return "not_specified"


def source_for(row: dict[str, Any], overrides: dict[str, dict[str, str | None]]) -> dict[str, str | None]:
    override = overrides.get(clean_text(row.get("master_id")) or "")
    url = clean_text(row.get("url_renunciaskast"))
    outlet = clean_text(row.get("medio_renunciaskast")) or clean_text(row.get("medio_factiva"))
    title = clean_text(row.get("titular_factiva"))
    if override and not url:
        url = clean_text(override.get("url"))
        outlet = clean_text(override.get("outlet")) or outlet
        title = clean_text(override.get("title")) or title
    return {"outlet": outlet or "Fuente", "url": url, "title": title}


def build() -> dict[str, Any]:
    wb = load_workbook(WORKBOOK, read_only=True, data_only=True, keep_vba=True)
    source_overrides = load_source_overrides()
    ws = wb["Master"]
    rows = list(ws.iter_rows(values_only=True))
    headers = list(rows[0])
    index = {h: i for i, h in enumerate(headers) if h}
    cases: list[dict[str, Any]] = []

    for raw_row in rows[1:]:
        row = {h: raw_row[i] if i < len(raw_row) else None for h, i in index.items()}
        recommendation = clean_text(row.get("recomendacion_conteo"))
        seremi_counter = numeric_counter(row.get("Seremis Contador"))
        counted_by_master = seremi_counter is not None and recommendation not in EXCLUDE_RECOMMENDATIONS
        if recommendation not in INCLUDE_RECOMMENDATIONS and not counted_by_master:
            continue
        name = clean_text(row.get("nombre_master"))
        if not name:
            continue

        date_value = iso_date(row.get("fecha_salida_master") or row.get("fecha_factiva") or row.get("fecha_renunciaskast"))
        summary = clean_text(row.get("razon_renunciaskast")) or clean_text(row.get("resumen_factiva")) or clean_text(row.get("titular_factiva"))
        raw_cargo = clean_text(row.get("cargo_master")) or clean_text(row.get("cargo"))
        cargo_group = clean_text(row.get("cargo")) or raw_cargo or "Otros cargos"
        region = clean_text(row.get("region_master")) or "Nacional"
        ministry_master = ministry_from_master(row)
        case = {
            "case_id": clean_text(row.get("master_id")),
            "person_name": name,
            "office_level": "seremi" if seremi_counter is not None else office_level(cargo_group),
            "cargo_group": cargo_group,
            "cargo_group_key": slugify(cargo_group),
            "office_title": raw_cargo,
            "ministerio_master": ministry_master,
            "ministry": ministry_master,
            "territory_type": "national" if region == "Nacional" else "regional",
            "region": region,
            "region_group": region_group(region),
            "exit_date": date_value,
            "exit_type": exit_type(clean_text(row.get("tipo_salida_factiva"))),
            "reason_category": reason_category(row, summary),
            "reason_summary": summary or "Sin motivo publico detallado.",
            "has_judicial_or_formal_complaint": reason_category(row, summary) == "judicial_or_formal_complaint",
            "verification_status": "verified" if clean_text(row.get("chequeo_manual")) == "☑" else "needs_review",
            "count_recommendation": recommendation,
            "seremi_counter": seremi_counter,
            "source": source_for(row, source_overrides),
        }
        cases.append(case)

    cases.sort(key=lambda item: item.get("exit_date") or "1900-01-01", reverse=True)
    office_counts = Counter(item["office_level"] for item in cases)
    cargo_counts = Counter(item["cargo_group"] for item in cases)
    ministry_counts = Counter(item["ministerio_master"] for item in cases)
    region_counts = Counter(item["region_group"] for item in cases)
    return {
        "metadata": {
            "title": "Renuncias Tracker",
            "updated_at": "2026-08-01",
            "source_note": "Base generada desde la pestaña Master de contador de renuncias, 1 de agosto.xlsm.",
            "case_count": len(cases),
            "seremi_count": max(
                (item["seremi_counter"] or 0 for item in cases if item["office_level"] == "seremi"),
                default=0,
            ),
            "office_counts": dict(office_counts),
            "cargo_counts": dict(cargo_counts),
            "ministry_counts": dict(ministry_counts),
            "region_counts": dict(region_counts),
        },
        "cases": cases,
    }


if __name__ == "__main__":
    payload = build()
    OUTPUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {OUTPUT} with {payload['metadata']['case_count']} cases")
