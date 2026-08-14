from __future__ import annotations

import json
import math
import unicodedata
import urllib.request
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "data" / "geo-source" / "Regional.geojson"
SOURCE_URL = "https://raw.githubusercontent.com/fcortes/Chile-GeoJSON/master/Regional.geojson"
OUTPUT = ROOT / "assets" / "geo" / "chile-regions-paths.json"

MAINLAND_BOUNDS = {
    "min_lon": -76.5,
    "max_lon": -66.0,
    "min_lat": -56.5,
    "max_lat": -17.0,
}

VIEW_WIDTH = 280
VIEW_HEIGHT = 620
PADDING = 10
MIN_RING_POINTS = 4
MIN_RING_AREA = 0.005
SIMPLIFY_TOLERANCE = 0.04

REGION_NAME_MAP = {
    "region de arica y parinacota": "Arica y Parinacota",
    "region de tarapaca": "Tarapacá",
    "region de antofagasta": "Antofagasta",
    "region de atacama": "Atacama",
    "region de coquimbo": "Coquimbo",
    "region de valparaiso": "Valparaíso",
    "region metropolitana de santiago": "Región Metropolitana",
    "region del libertador bernardo o higgins": "O'Higgins",
    "region del maule": "Maule",
    "region de nuble": "Ñuble",
    "region del bio bio": "Biobío",
    "region de la araucania": "La Araucanía",
    "region de los rios": "Los Ríos",
    "region de los lagos": "Los Lagos",
    "region de aysen del gral ibanez del campo": "Aysén",
    "region de magallanes y antartica chilena": "Magallanes",
}


def strip_accents(value: str) -> str:
    return "".join(
        ch for ch in unicodedata.normalize("NFKD", value) if not unicodedata.combining(ch)
    )


def norm(value: str) -> str:
    text = strip_accents(value.lower())
    text = "".join(ch if ch.isalnum() else " " for ch in text)
    return " ".join(text.split())


def is_mainland(coord: list[float]) -> bool:
    lon, lat = coord
    return (
        MAINLAND_BOUNDS["min_lon"] <= lon <= MAINLAND_BOUNDS["max_lon"]
        and MAINLAND_BOUNDS["min_lat"] <= lat <= MAINLAND_BOUNDS["max_lat"]
    )


def geometry_polygons(geometry: dict[str, Any]) -> list[list[list[list[float]]]]:
    if geometry["type"] == "Polygon":
        return [geometry["coordinates"]]
    if geometry["type"] == "MultiPolygon":
        return geometry["coordinates"]
    raise ValueError(f"Unsupported geometry type: {geometry['type']}")


def perpendicular_distance(point: list[float], start: list[float], end: list[float]) -> float:
    x, y = point
    x1, y1 = start
    x2, y2 = end
    if x1 == x2 and y1 == y2:
        return math.hypot(x - x1, y - y1)
    numerator = abs((y2 - y1) * x - (x2 - x1) * y + x2 * y1 - y2 * x1)
    denominator = math.hypot(y2 - y1, x2 - x1)
    return numerator / denominator


def simplify_open(points: list[list[float]], tolerance: float) -> list[list[float]]:
    if len(points) <= 2:
        return points
    max_distance = 0.0
    index = 0
    for i in range(1, len(points) - 1):
        distance = perpendicular_distance(points[i], points[0], points[-1])
        if distance > max_distance:
            max_distance = distance
            index = i
    if max_distance > tolerance:
        left = simplify_open(points[: index + 1], tolerance)
        right = simplify_open(points[index:], tolerance)
        return left[:-1] + right
    return [points[0], points[-1]]


def simplify_ring(ring: list[list[float]], tolerance: float) -> list[list[float]]:
    if len(ring) <= MIN_RING_POINTS:
        return ring
    closed = ring[0] == ring[-1]
    points = ring[:-1] if closed else ring
    simplified = simplify_open(points, tolerance)
    if len(simplified) < MIN_RING_POINTS:
        simplified = points[:MIN_RING_POINTS]
    simplified.append(simplified[0])
    return simplified


def ring_area(ring: list[list[float]]) -> float:
    area = 0.0
    for current, next_coord in zip(ring, ring[1:]):
        area += current[0] * next_coord[1] - next_coord[0] * current[1]
    return abs(area) / 2


def clean_polygons(geometry: dict[str, Any]) -> list[list[list[list[float]]]]:
    cleaned = []
    for polygon in geometry_polygons(geometry):
        rings = []
        for ring in polygon:
            mainland_points = [coord for coord in ring if is_mainland(coord)]
            if len(mainland_points) >= MIN_RING_POINTS:
                if mainland_points[0] != mainland_points[-1]:
                    mainland_points.append(mainland_points[0])
                if ring_area(mainland_points) >= MIN_RING_AREA:
                    rings.append(simplify_ring(mainland_points, SIMPLIFY_TOLERANCE))
        if rings:
            cleaned.append(rings)
    return cleaned


def project(coord: list[float], bbox: dict[str, float]) -> tuple[float, float]:
    lon, lat = coord
    scale_x = (VIEW_WIDTH - PADDING * 2) / (bbox["max_lon"] - bbox["min_lon"])
    scale_y = (VIEW_HEIGHT - PADDING * 2) / (bbox["max_lat"] - bbox["min_lat"])
    scale = min(scale_x, scale_y)
    map_width = (bbox["max_lon"] - bbox["min_lon"]) * scale
    x_offset = (VIEW_WIDTH - map_width) / 2
    x = x_offset + (lon - bbox["min_lon"]) * scale
    y = PADDING + (bbox["max_lat"] - lat) * scale
    return x, y


def path_for(polygons: list[list[list[list[float]]]], bbox: dict[str, float]) -> str:
    commands = []
    for polygon in polygons:
        for ring in polygon:
            projected = [project(coord, bbox) for coord in ring]
            if len(projected) < MIN_RING_POINTS:
                continue
            commands.append(f"M {projected[0][0]:.2f} {projected[0][1]:.2f}")
            commands.extend(f"L {x:.2f} {y:.2f}" for x, y in projected[1:])
            commands.append("Z")
    return " ".join(commands)


def main() -> None:
    if not SOURCE.exists():
        SOURCE.parent.mkdir(parents=True, exist_ok=True)
        request = urllib.request.Request(SOURCE_URL, headers={"User-Agent": "renuncias-tracker"})
        with urllib.request.urlopen(request, timeout=30) as response:
            SOURCE.write_bytes(response.read())

    payload = json.loads(SOURCE.read_text(encoding="utf-8"))
    processed = []
    all_coords = []

    for feature in payload["features"]:
        raw_name = feature["properties"].get("Region", "")
        region = REGION_NAME_MAP.get(norm(raw_name))
        if not region:
            continue
        polygons = clean_polygons(feature["geometry"])
        if not polygons:
            raise ValueError(f"No mainland geometry left for {raw_name}")
        for polygon in polygons:
            for ring in polygon:
                all_coords.extend(ring)
        processed.append({"region": region, "raw_name": raw_name, "polygons": polygons})

    bbox = {
        "min_lon": min(coord[0] for coord in all_coords),
        "max_lon": max(coord[0] for coord in all_coords),
        "min_lat": min(coord[1] for coord in all_coords),
        "max_lat": max(coord[1] for coord in all_coords),
    }

    features = [
        {
            "region": item["region"],
            "source_name": item["raw_name"],
            "path": path_for(item["polygons"], bbox),
        }
        for item in processed
    ]

    expected = set(REGION_NAME_MAP.values())
    actual = {feature["region"] for feature in features}
    missing = sorted(expected - actual)
    if missing:
        raise ValueError(f"Missing regions: {missing}")

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(
        json.dumps(
            {
                "source": "fcortes/Chile-GeoJSON Regional.geojson; referenced source: Biblioteca del Congreso Nacional Mapas Vectoriales",
                "source_url": "https://github.com/fcortes/Chile-GeoJSON",
                "viewBox": f"0 0 {VIEW_WIDTH} {VIEW_HEIGHT}",
                "features": features,
            },
            ensure_ascii=False,
            separators=(",", ":"),
        )
        + "\n",
        encoding="utf-8",
    )
    print(f"Wrote {OUTPUT} with {len(features)} regions")


if __name__ == "__main__":
    main()
