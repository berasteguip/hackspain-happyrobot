#!/usr/bin/env python3
"""Valida un fichero de escenario contra docs/06-producto/03-contrato-de-datos.md.

Uso:
    python backend/data/validate.py backend/data/scenarios/sierra-culebra.json
    python backend/data/validate.py backend/data/scenarios/mini.json

Sale con código 0 y sin salida si todo es correcto. Si algo falla, imprime
UN error por línea con el tipo de registro, su id y el campo que falló, y
termina con código 1. Pensado para poder correrse sobre cualquier fichero de
escenario, no solo los que genera backend/data/generate.py.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

PHONE_RE = re.compile(r"^\+3460099\d{4}$")

ID_PREFIXES = {
    "houses": ("h-", "id"),
    "people": ("p-", "id"),
    "safe_zones": ("x-", "id"),
    "sectors": ("s-", "id"),
    "patrols": ("pt-", "id"),
}

HOUSE_STATUSES = {
    "pending", "calling", "answered", "no_answer", "cleared_by_patrol",
    "empty", "occupants_refuse",
}
PERSON_STATUSES = {
    "unknown", "no_answer", "unreachable", "contacted", "moving", "safe",
    "refusing", "at_risk",
}
SAFE_ZONE_STATUSES = {"open", "filling", "threatened", "closed"}
MOBILITY_VALUES = {"car", "walking", "reduced", "immobile"}
POSITION_SOURCES = {None, "declared", "gps", "inferred"}


class Errors:
    def __init__(self):
        self.items = []

    def add(self, record_type: str, record_id, field: str, message: str):
        self.items.append(f"[{record_type} id={record_id}] campo `{field}`: {message}")

    def ok(self) -> bool:
        return len(self.items) == 0


def load_scenario(path: Path) -> dict:
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def check_unique_ids(scenario: dict, errors: Errors):
    seen_by_prefix = {}
    for key, (prefix, id_field) in ID_PREFIXES.items():
        records = scenario.get(key, [])
        seen = set()
        for rec in records:
            rid = rec.get(id_field)
            if rid is None:
                errors.add(key, "?", id_field, "falta el id")
                continue
            if not isinstance(rid, str) or not rid.startswith(prefix):
                errors.add(key, rid, id_field, f"debe empezar por el prefijo `{prefix}`")
            if rid in seen:
                errors.add(key, rid, id_field, "id duplicado dentro de su propia lista")
            seen.add(rid)
        seen_by_prefix[key] = seen
    return seen_by_prefix


def check_phones(scenario: dict, errors: Errors):
    seen = {}

    def check_one(record_type, rid, phone, field="phone"):
        if phone is None:
            return
        if not PHONE_RE.match(phone):
            errors.add(record_type, rid, field, f"'{phone}' no está en el rango sintético +3460099xxxx")
            return
        if phone in seen:
            other_type, other_id = seen[phone]
            errors.add(
                record_type, rid, field,
                f"teléfono '{phone}' duplicado (ya usado por {other_type} id={other_id})",
            )
        else:
            seen[phone] = (record_type, rid)

    for h in scenario.get("houses", []):
        check_one("houses", h.get("id"), h.get("phone"))
    for p in scenario.get("people", []):
        check_one("people", p.get("id"), p.get("phone"))
    for pt in scenario.get("patrols", []):
        check_one("patrols", pt.get("id"), pt.get("channel"), field="channel")


def check_bbox(scenario: dict, errors: Errors):
    bbox = scenario.get("map", {}).get("bbox")
    if not bbox:
        errors.add("map", "-", "bbox", "falta bbox")
        return

    def in_bbox(lat, lon):
        return (
            bbox["lat_min"] <= lat <= bbox["lat_max"]
            and bbox["lon_min"] <= lon <= bbox["lon_max"]
        )

    for key in ("houses", "people", "safe_zones", "patrols"):
        for rec in scenario.get(key, []):
            lat, lon = rec.get("lat"), rec.get("lon")
            if lat is None or lon is None:
                continue
            if not in_bbox(lat, lon):
                errors.add(key, rec.get("id"), "lat/lon", f"({lat},{lon}) fuera del bbox del mapa")


def check_geojson_geometry(geometry, record_type, rid, field, errors: Errors):
    if geometry is None:
        return
    gtype = geometry.get("type")
    coords = geometry.get("coordinates")
    if gtype not in ("Polygon", "LineString"):
        errors.add(record_type, rid, field, f"tipo de geometría '{gtype}' no soportado")
        return
    if coords is None:
        errors.add(record_type, rid, field, "geometría sin coordinates")
        return

    def check_lon_lat_pair(pair, ctx):
        if not (isinstance(pair, list) and len(pair) == 2):
            errors.add(record_type, rid, field, f"{ctx}: par de coordenadas mal formado {pair}")
            return
        lon, lat = pair
        if not (-180.0 <= lon <= 180.0):
            errors.add(
                record_type, rid, field,
                f"{ctx}: lon={lon} fuera de rango — ¿orden invertido? GeoJSON es [lon, lat]",
            )
        if not (-90.0 <= lat <= 90.0):
            errors.add(
                record_type, rid, field,
                f"{ctx}: lat={lat} fuera de rango — ¿orden invertido? GeoJSON es [lon, lat]",
            )

    if gtype == "LineString":
        for i, pair in enumerate(coords):
            check_lon_lat_pair(pair, f"punto {i}")
    elif gtype == "Polygon":
        for ring_idx, ring in enumerate(coords):
            if len(ring) < 4:
                errors.add(
                    record_type, rid, field,
                    f"anillo {ring_idx} tiene {len(ring)} puntos, un polígono cerrado necesita >=4",
                )
                continue
            if ring[0] != ring[-1]:
                errors.add(record_type, rid, field, f"anillo {ring_idx} no está cerrado (primer punto != último)")
            for i, pair in enumerate(ring):
                check_lon_lat_pair(pair, f"anillo {ring_idx} punto {i}")


def check_geometries(scenario: dict, errors: Errors):
    for s in scenario.get("sectors", []):
        check_geojson_geometry(s.get("polygon"), "sectors", s.get("id"), "polygon", errors)
    for rc in scenario.get("road_closures", []):
        check_geojson_geometry(rc.get("geometry"), "road_closures", rc.get("id"), "geometry", errors)
    for i, r in enumerate(scenario.get("roads", [])):
        check_geojson_geometry(r.get("geometry"), "roads", r.get("name", i), "geometry", errors)
    fire = scenario.get("fire")
    if fire:
        check_geojson_geometry(fire.get("perimeter"), "fire", "perimeter", "perimeter", errors)


def polygon_bbox(polygon):
    lons = [pt[0] for ring in polygon["coordinates"] for pt in ring]
    lats = [pt[1] for ring in polygon["coordinates"] for pt in ring]
    return min(lons), max(lons), min(lats), max(lats)


def bboxes_overlap(b1, b2):
    lon_min1, lon_max1, lat_min1, lat_max1 = b1
    lon_min2, lon_max2, lat_min2, lat_max2 = b2
    return not (
        lon_max1 <= lon_min2 or lon_max2 <= lon_min1
        or lat_max1 <= lat_min2 or lat_max2 <= lat_min1
    )


def check_sectors_no_overlap(scenario: dict, errors: Errors):
    sectors = scenario.get("sectors", [])
    boxes = []
    for s in sectors:
        if not s.get("polygon"):
            continue
        boxes.append((s.get("id"), polygon_bbox(s["polygon"])))
    for i in range(len(boxes)):
        for j in range(i + 1, len(boxes)):
            id1, box1 = boxes[i]
            id2, box2 = boxes[j]
            if bboxes_overlap(box1, box2):
                errors.add(
                    "sectors", id1, "polygon",
                    f"se solapa (por bbox) con el sector {id2}",
                )


def check_references(scenario: dict, errors: Errors, house_ids: set):
    for p in scenario.get("people", []):
        house_id = p.get("house_id")
        if house_id not in house_ids:
            errors.add("people", p.get("id"), "house_id", f"referencia a casa inexistente '{house_id}'")

    for h in scenario.get("houses", []):
        neighbor_ids = h.get("_sim", {}).get("neighbor_ids", [])
        for nid in neighbor_ids:
            if nid not in house_ids:
                errors.add("houses", h.get("id"), "_sim.neighbor_ids", f"vecino inexistente '{nid}'")
            if nid == h.get("id"):
                errors.add("houses", h.get("id"), "_sim.neighbor_ids", "una casa no puede ser vecina de sí misma")

    sector_ids = {s.get("id") for s in scenario.get("sectors", [])}
    for h in scenario.get("houses", []):
        if h.get("sector_id") is not None and h.get("sector_id") not in sector_ids:
            errors.add("houses", h.get("id"), "sector_id", f"sector inexistente '{h.get('sector_id')}'")
    for p in scenario.get("people", []):
        if p.get("sector_id") is not None and p.get("sector_id") not in sector_ids:
            errors.add("people", p.get("id"), "sector_id", f"sector inexistente '{p.get('sector_id')}'")

    patrol_ids = {pt.get("id") for pt in scenario.get("patrols", [])}
    for h in scenario.get("houses", []):
        if h.get("assigned_patrol_id") is not None and h.get("assigned_patrol_id") not in patrol_ids:
            errors.add(
                "houses", h.get("id"), "assigned_patrol_id",
                f"patrulla inexistente '{h.get('assigned_patrol_id')}'",
            )


def check_enums(scenario: dict, errors: Errors):
    for h in scenario.get("houses", []):
        if h.get("status") not in HOUSE_STATUSES:
            errors.add("houses", h.get("id"), "status", f"valor no permitido '{h.get('status')}'")
    for p in scenario.get("people", []):
        if p.get("status") not in PERSON_STATUSES:
            errors.add("people", p.get("id"), "status", f"valor no permitido '{p.get('status')}'")
        if p.get("mobility") not in MOBILITY_VALUES:
            errors.add("people", p.get("id"), "mobility", f"valor no permitido '{p.get('mobility')}'")
        if p.get("position_source") not in POSITION_SOURCES:
            errors.add("people", p.get("id"), "position_source", f"valor no permitido '{p.get('position_source')}'")
    for sz in scenario.get("safe_zones", []):
        if sz.get("status") not in SAFE_ZONE_STATUSES:
            errors.add("safe_zones", sz.get("id"), "status", f"valor no permitido '{sz.get('status')}'")


def check_nulls_not_zero(scenario: dict, errors: Errors):
    # Regla del contrato: un campo no calculado es null, nunca 0. Solo se
    # puede afirmar mal uso cuando el valor es un 0 sospechoso en campos que
    # normalmente empiezan en null (heurística, no exhaustiva).
    for p in scenario.get("people", []):
        if p.get("status") == "unknown" and p.get("priority_score") == 0:
            errors.add(
                "people", p.get("id"), "priority_score",
                "es 0 con status 'unknown'; si no se ha calculado debe ser null, no 0",
            )


def run_validation(path: Path) -> Errors:
    scenario = load_scenario(path)
    errors = Errors()

    seen_by_prefix = check_unique_ids(scenario, errors)
    check_phones(scenario, errors)
    check_bbox(scenario, errors)
    check_geometries(scenario, errors)
    check_sectors_no_overlap(scenario, errors)
    check_enums(scenario, errors)
    check_nulls_not_zero(scenario, errors)

    house_ids = seen_by_prefix.get("houses", set())
    check_references(scenario, errors, house_ids)

    return errors


def main(argv=None):
    argv = sys.argv[1:] if argv is None else argv
    if len(argv) != 1:
        print("Uso: python backend/data/validate.py <ruta-al-escenario.json>", file=sys.stderr)
        return 2

    path = Path(argv[0])
    if not path.exists():
        print(f"No existe el fichero: {path}", file=sys.stderr)
        return 2

    errors = run_validation(path)
    if errors.ok():
        print(f"OK: {path} pasa la validación del contrato de datos.")
        return 0

    print(f"FALLÓ la validación de {path} ({len(errors.items)} error(es)):", file=sys.stderr)
    for line in errors.items:
        print(f"  - {line}", file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main())
