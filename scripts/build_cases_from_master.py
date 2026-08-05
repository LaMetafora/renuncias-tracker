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

INCLUDE_RECOMMENDATIONS = {
    "add_to_core_counter",
    "confirmed_from_raw_3",
    "appointment_not_effective",
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


def office_level(raw: str | None) -> str:
    text = strip_accents((raw or "").lower())
    if "ministro" in text:
        return "minister"
    if "subsecretario" in text:
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


def exit_type(raw: str | None) -> str:
    text = strip_accents((raw or "").lower())
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


def source_for(row: dict[str, Any]) -> dict[str, str | None]:
    url = clean_text(row.get("url_renunciaskast"))
    outlet = clean_text(row.get("medio_renunciaskast")) or clean_text(row.get("medio_factiva"))
    title = clean_text(row.get("titular_factiva"))
    return {"outlet": outlet or "Fuente", "url": url, "title": title}


def build() -> dict[str, Any]:
    wb = load_workbook(WORKBOOK, read_only=True, data_only=True, keep_vba=True)
    ws = wb["Master"]
    rows = list(ws.iter_rows(values_only=True))
    headers = list(rows[0])
    index = {h: i for i, h in enumerate(headers) if h}
    cases: list[dict[str, Any]] = []

    for raw_row in rows[1:]:
        row = {h: raw_row[i] if i < len(raw_row) else None for h, i in index.items()}
        recommendation = clean_text(row.get("recomendacion_conteo"))
        if recommendation not in INCLUDE_RECOMMENDATIONS:
            continue
        name = clean_text(row.get("nombre_master"))
        if not name:
            continue

        date_value = iso_date(row.get("fecha_salida_master") or row.get("fecha_factiva") or row.get("fecha_renunciaskast"))
        summary = clean_text(row.get("razon_renunciaskast")) or clean_text(row.get("resumen_factiva")) or clean_text(row.get("titular_factiva"))
        raw_cargo = clean_text(row.get("cargo"))
        case = {
            "case_id": clean_text(row.get("master_id")),
            "person_name": name,
            "office_level": office_level(raw_cargo or clean_text(row.get("cargo_master"))),
            "office_title": clean_text(row.get("cargo_master")) or raw_cargo,
            "ministry": clean_text(row.get("ministerio_master")),
            "territory_type": "national" if clean_text(row.get("region_master")) == "Nacional" else "regional",
            "region": clean_text(row.get("region_master")) or "Nacional",
            "exit_date": date_value,
            "exit_type": exit_type(clean_text(row.get("tipo_salida_factiva"))),
            "reason_category": reason_category(row, summary),
            "reason_summary": summary or "Sin motivo publico detallado.",
            "has_judicial_or_formal_complaint": reason_category(row, summary) == "judicial_or_formal_complaint",
            "verification_status": "verified" if clean_text(row.get("chequeo_manual")) == "☑" else "needs_review",
            "count_recommendation": recommendation,
            "source": source_for(row),
        }
        cases.append(case)

    cases.sort(key=lambda item: item.get("exit_date") or "1900-01-01", reverse=True)
    office_counts = Counter(item["office_level"] for item in cases)
    return {
        "metadata": {
            "title": "Renuncias Tracker",
            "updated_at": "2026-08-01",
            "source_note": "Base generada desde la pestaña Master de contador de renuncias, 1 de agosto.xlsm.",
            "case_count": len(cases),
            "office_counts": dict(office_counts),
        },
        "cases": cases,
    }


if __name__ == "__main__":
    payload = build()
    OUTPUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {OUTPUT} with {payload['metadata']['case_count']} cases")
