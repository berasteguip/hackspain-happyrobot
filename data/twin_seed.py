#!/usr/bin/env python3
"""Genera el SQL de semilla del padrón de Twin a partir del escenario sintético.

Uso:
    python data/twin_seed.py                       # -> data/twin/seed.sql
    python data/twin_seed.py --scenario data/scenarios/sierra-culebra.json

Determinista: mismo escenario -> mismo fichero, byte a byte. No inventa nada que
no esté en el escenario o en el bloque GEO de abajo (que sale de
docs/03-dominio-crisis/05-geografia-sierra-culebra.md, con fuente).

El esquema al que alimenta está en data/twin/schema.sql; el porqué de cada tabla,
en docs/06-producto/12-tablas-basicas-twin.md.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# ============================================================================
# GEOGRAFÍA VERIFICADA — docs/03-dominio-crisis/05-geografia-sierra-culebra.md §1 y §4
# El escenario solo conoce `village`, una cadena que mezcla dos niveles
# distintos: Losacio y Ferreruela son municipios, Sesnández es pedanía de
# Ferreruela. Este bloque es el único sitio donde se deshace esa mezcla.
# `ine_code` va a None a propósito: no hay fuente verificada en el repo y
# AGENTS.md §3.2 prohíbe inventarlo.
# ============================================================================
MUNICIPALITIES = [
    # id, nombre, ine_code, provincia, comunidad, comarca, población, año, lat, lon
    ("m-losacio", "Losacio", None, "Zamora", "Castilla y León",
     "Tierra de Alba", 90, 2025, 41.71088, -6.03987),
    ("m-ferreruela-de-tabara", "Ferreruela de Tábara", None, "Zamora", "Castilla y León",
     "Tierra de Tábara", 409, 2025, 41.76583, -6.07194),
    ("m-tabara", "Tábara", None, "Zamora", "Castilla y León",
     "Tierra de Tábara", 743, 2025, 41.82611, -5.95889),
]

# village del escenario -> (locality_id, municipality_id, kind, población, año, lat, lon)
LOCALITIES = {
    "Losacio": ("n-losacio", "m-losacio", "capital", 90, 2025, 41.71088, -6.03987),
    "Ferreruela de Tábara": ("n-ferreruela-de-tabara", "m-ferreruela-de-tabara", "capital",
                             409, 2025, 41.76583, -6.07194),
    "Sesnández de Tábara": ("n-sesnandez-de-tabara", "m-ferreruela-de-tabara", "pedania",
                            136, 2024, 41.80778, -6.07667),
}
# Núcleo sin casas nuestras, pero sí en el padrón: es el destino que más se
# nombra por teléfono ("¿cabe alguien ya en Tábara?") y sin fila no hay
# locality_id al que colgar esa pregunta en el log de llamadas.
EXTRA_LOCALITIES = [
    ("n-tabara", "m-tabara", "Tábara", "capital", 743, 2025, 41.82611, -5.95889),
]

# Motivo por defecto cuando la persona no puede salir sola y la casa no dice por qué.
MOBILITY_REASON = {
    "reduced": "movilidad reducida",
    "immobile": "encamado, necesita ambulancia",
}


def q(value) -> str:
    """Literal SQL. None -> NULL; el resto, escapado."""
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (int, float)):
        return repr(value)
    return "'" + str(value).replace("'", "''") + "'"


def split_address(address: str) -> tuple[str, str | None, bool]:
    """'Calle Mayor 2, Losacio' -> ('Calle Mayor', '2', False).

    'Diseminado, Losacio (camino rural)' -> ('Diseminado', None, True): no hay
    número porque no existe, que no es lo mismo que el número 0.
    """
    head = address.split(",", 1)[0].strip()
    if head.lower().startswith("diseminado"):
        return "Diseminado", None, True
    match = re.match(r"^(.*?)\s+(\d+[A-Za-z]?)$", head)
    if match:
        return match.group(1).strip(), match.group(2), False
    return head, None, False


def rows(table: str, columns: list[str], values: list[list[str]]) -> str:
    if not values:
        return ""
    cols = ", ".join(columns)
    body = ",\n  ".join("(" + ", ".join(v) + ")" for v in values)
    return f"insert into {table} ({cols}) values\n  {body};\n"


def build(scenario: dict) -> tuple[str, dict]:
    out: list[str] = []
    stats: dict[str, int] = {}
    incident = scenario["meta"]["name"]

    # El fichero sale sin comentarios a propósito: es SQL para pegar en un nodo, y el porqué
    # de cada tabla vive en docs/06-producto/12-tablas-basicas-twin.md.
    out.append("delete from support_need;")
    out.append("delete from person;")
    out.append("delete from house;")
    out.append("delete from sector;")
    out.append("delete from locality;")
    out.append("delete from municipality;\n")

    out.append(rows(
        "municipality",
        ["id", "name", "ine_code", "province", "region", "comarca",
         "population", "population_year", "lat", "lon"],
        [[q(x) for x in m] for m in MUNICIPALITIES],
    ))
    stats["municipality"] = len(MUNICIPALITIES)

    locality_rows = []
    for village, (lid, mid, kind, pop, year, lat, lon) in LOCALITIES.items():
        locality_rows.append([q(lid), q(mid), q(village), q(kind), q(pop), q(year), q(lat), q(lon)])
    for lid, mid, name, kind, pop, year, lat, lon in EXTRA_LOCALITIES:
        locality_rows.append([q(lid), q(mid), q(name), q(kind), q(pop), q(year), q(lat), q(lon)])
    out.append(rows(
        "locality",
        ["id", "municipality_id", "name", "kind", "population", "population_year", "lat", "lon"],
        locality_rows,
    ))
    stats["locality"] = len(locality_rows)

    out.append(rows(
        "sector",
        ["id", "incident", "name", "polygon"],
        [[q(s["id"]), q(incident), q(s["name"]), q(json.dumps(s["polygon"])) + "::jsonb"]
         for s in scenario["sectors"]],
    ))
    stats["sector"] = len(scenario["sectors"])

    house_rows = []
    phantom_landlines = 0
    for h in scenario["houses"]:
        sim = h.get("_sim", {})
        street, number, dispersed_by_address = split_address(h["address"])
        has_landline = bool(sim.get("has_landline"))
        if not has_landline and h.get("phone"):
            # El escenario da teléfono a las 120 casas pero solo 23 tienen fijo.
            # Un número que no existe es peor que ninguno: la patrulla lo llamaría.
            phantom_landlines += 1
        house_rows.append([
            q(h["id"]),
            q(LOCALITIES[h["village"]][0]),
            q(h.get("sector_id")),
            q(street),
            q(number),
            q(h["address"]),
            q(h["lat"]),
            q(h["lon"]),
            q(h["phone"] if has_landline else None),
            q(h.get("residents_expected")),
            q(bool(sim.get("is_second_residence"))),
            q(bool(sim.get("dispersed")) or dispersed_by_address),
            q("padron"),
        ])
    out.append(rows(
        "house",
        ["id", "locality_id", "sector_id", "street", "number", "address",
         "lat", "lon", "landline", "residents_expected", "second_home", "dispersed", "source"],
        house_rows,
    ))
    stats["house"] = len(house_rows)
    stats["phantom_landlines_descartados"] = phantom_landlines

    person_rows = []
    uncensored = 0
    for p in scenario["people"]:
        sim = p.get("_sim", {})
        # `uncensored` del escenario = gente que está en la casa pero no en el
        # censo (el nieto en agosto, el cuidador). El padrón no la tiene; la
        # conocemos porque alguien la nombró en una llamada. Se marca, no se
        # disimula: es la diferencia entre `residents_expected` y quien hay.
        from_call = bool(sim.get("uncensored"))
        uncensored += from_call
        person_rows.append([
            q(p["id"]),
            q(p["house_id"]),
            q(p["name"]),
            q(p["phone"]),
            q(p.get("household_size") or 1),
            q(p.get("mobility") == "car"),
            q(bool(p.get("has_smartphone"))),
            q(sim.get("age")),
            q("call" if from_call else "padron"),
        ])
    out.append(rows(
        "person",
        ["id", "house_id", "name", "phone", "household_size",
         "has_vehicle", "has_smartphone", "age", "source"],
        person_rows,
    ))
    stats["person"] = len(person_rows)
    stats["personas_fuera_del_padron (source='call')"] = uncensored

    # support_need: la necesidad es de la persona, no del edificio. El escenario
    # la parte en dos (Person.mobility y House.vulnerability_reason); aquí se
    # vuelve a juntar en quien la tiene. Si la casa marca vulnerabilidad y hay
    # varios residentes, se le cuelga a quien tenga movilidad afectada; si no
    # hay ninguno, al primero — y eso queda dicho, no escondido.
    houses_by_id = {h["id"]: h for h in scenario["houses"]}
    people_by_house: dict[str, list[dict]] = {}
    for p in scenario["people"]:
        people_by_house.setdefault(p["house_id"], []).append(p)

    need_rows = []
    unassigned_house_reasons = 0
    ambiguous = 0
    for house_id, residents in people_by_house.items():
        house = houses_by_id[house_id]
        house_reason = house.get("vulnerability_reason") if house.get("vulnerable") else None
        impaired = [p for p in residents if p.get("mobility") in MOBILITY_REASON]
        carrier = impaired[0] if impaired else residents[0]
        if house_reason and len(residents) > 1 and not impaired:
            ambiguous += 1
        for p in residents:
            mobility = p.get("mobility") if p.get("mobility") in MOBILITY_REASON else None
            reason = None
            if p["id"] == carrier["id"] and house_reason:
                reason = house_reason
            elif mobility:
                reason = MOBILITY_REASON[mobility]
            if mobility is None and reason is None:
                continue
            need_rows.append([q(p["id"]), q(mobility), q(reason or MOBILITY_REASON[mobility])])
    for house in scenario["houses"]:
        if house.get("vulnerable") and not people_by_house.get(house["id"]):
            unassigned_house_reasons += 1
    out.append(rows("support_need", ["person_id", "mobility", "reason"], need_rows))
    stats["support_need"] = len(need_rows)
    stats["vulnerabilidad_sin_residente_conocido"] = unassigned_house_reasons
    stats["vulnerabilidad_de_casa_ambigua"] = ambiguous

    return "\n".join(out), stats


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--scenario", default=str(ROOT / "data/scenarios/sierra-culebra.json"))
    parser.add_argument("--out", default=str(ROOT / "data/twin/seed.sql"))
    args = parser.parse_args()

    scenario = json.loads(Path(args.scenario).read_text(encoding="utf-8"))
    sql, stats = build(scenario)
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(sql, encoding="utf-8")

    shown = out.relative_to(ROOT) if out.is_relative_to(ROOT) else out
    print(f"{shown} ({len(sql.splitlines())} líneas)")
    for key, value in stats.items():
        print(f"  {key:42} {value}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
