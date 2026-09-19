"""Carga del escenario desde `data/scenarios/<nombre>.json`.

El fichero lo genera otro componente (`data/generate.py`), así que este módulo es **tolerante**:
si no existe, si le sobran campos o si trae un valor de enum que no conocemos, la API arranca de
todas formas con un escenario mínimo embebido y lo grita en el log. Una demo no se cae porque
falte un fichero.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

from models import (
    Fire,
    House,
    Patrol,
    Person,
    SafeZone,
    Sector,
    utcnow_iso,
)
from settings import settings

log = logging.getLogger("crisis.loader")

# Cada entrada: clave del JSON → (modelo, nombre del diccionario en el estado)
ENTITY_MAP: dict[str, tuple[type, str]] = {
    "houses": (House, "houses"),
    "people": (Person, "people"),
    "safe_zones": (SafeZone, "safe_zones"),
    "sectors": (Sector, "sectors"),
    "patrols": (Patrol, "patrols"),
}


def scenario_path(name: str) -> Path:
    return settings.scenarios_dir / f"{name}.json"


def load_scenario(state, name: str | None = None) -> dict:
    """Vacía el estado y lo rellena con el escenario. Devuelve un resumen para el log/`/reset`."""
    name = name or settings.scenario
    path = scenario_path(name)
    data: dict[str, Any] | None = None
    origen = str(path)

    if path.is_file():
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            log.error("escenario %s ilegible (%s); se usa el mínimo embebido", path, exc)
            data = None
    else:
        log.warning(
            "⚠️  NO EXISTE %s — arrancando con el escenario MÍNIMO EMBEBIDO (12 casas en la "
            "provincia de Zamora). Sirve para probar la API, NO para la demo: en cuanto "
            "data/generate.py escriba el fichero, `POST /reset` lo carga.",
            path,
        )

    if data is None:
        data = minimal_scenario()
        origen = "embebido (fallback)"

    with state.lock:
        state.reset_entities(scenario=name)
        state.scenario_meta = {
            "source": origen,
            "meta": data.get("meta", {}),
            "map": data.get("map", {}),
            "villages": data.get("villages", []),
            # `roads` no es una entidad del contrato (las carreteras cortadas llegan por
            # /events/road-closure); se guarda tal cual para que el mapa pueda pintarlas.
            "roads": data.get("roads", []),
        }

        resumen: dict[str, int] = {}
        for key, (model, coll_name) in ENTITY_MAP.items():
            coll = getattr(state, coll_name)
            for raw in data.get(key) or []:
                entity = _build(model, raw, key)
                if entity is None:
                    continue
                coll[entity.id] = entity
            resumen[coll_name] = len(coll)

        fire_raw = data.get("fire")
        if fire_raw:
            fire = _build(Fire, fire_raw, "fire")
            if fire is not None:
                if not fire.updated_at:
                    fire.updated_at = utcnow_iso()
                state.fire = fire
        resumen["fire"] = 1 if state.fire else 0
        state.t = utcnow_iso()

    log.info(
        "escenario '%s' cargado desde %s: %s",
        name,
        origen,
        ", ".join(f"{k}={v}" for k, v in resumen.items()),
    )
    resumen["source"] = origen  # type: ignore[assignment]
    return resumen


def _build(model: type, raw: dict, key: str):
    """Instancia el modelo perdonando un campo raro: primero tal cual, y si falla limpiando."""
    try:
        return model(**raw)
    except Exception as exc:
        log.warning("%s: registro inválido (%s); se intenta limpiando enums", key, exc)
        limpio = dict(raw)
        for campo in ("status", "position_source", "mobility", "convoy_role"):
            limpio.pop(campo, None)
        try:
            return model(**limpio)
        except Exception as exc2:
            log.error("%s: registro descartado (%s)", key, exc2)
            return None


# --------------------------------------------------------------------------------------
# Escenario mínimo embebido: 12 casas al sur de Tábara (provincia de Zamora).
# Coordenadas reales de la zona, personas y teléfonos INVENTADOS.
# --------------------------------------------------------------------------------------


def minimal_scenario() -> dict:
    lat0, lon0 = 41.711, -6.040  # Losacio (Zamora)
    nombres = [
        "Antonio Prieto",
        "Mercedes Cid",
        "Ramón Ferrero",
        "Pilar Casaseca",
        "Julián Represa",
        "Amparo Vega",
        "Tomás Rivero",
        "Encarna Lobo",
        "Nicolás Gago",
        "Adela Bécares",
        "Félix Turiel",
        "Rosario Panero",
    ]
    houses: list[dict] = []
    people: list[dict] = []
    for i, nombre in enumerate(nombres, start=1):
        lat = round(lat0 + 0.004 * ((i % 4) - 1.5), 6)
        lon = round(lon0 + 0.006 * ((i // 4) - 1.0), 6)
        hid = f"h-{i:03d}"
        vulnerable = i in (3, 9)
        houses.append(
            {
                "id": hid,
                "address": f"Calle de la Iglesia {i}, Losacio",
                "village": "Losacio",
                "lat": lat,
                "lon": lon,
                # Rango sintetico reservado del contrato (regla 2 de la seccion 6): +3460099xxxx.
                # NO usar +34980xxxxxxx: 980 es el prefijo real de Zamora y con
                # ALLOW_REAL_CALLS=true eso marcaria a alguien de verdad.
                "phone": f"+3460099{i:04d}",
                "residents_expected": 1 + (i % 3),
                "vulnerable": vulnerable,
                "vulnerability_reason": "movilidad reducida" if vulnerable else None,
                "sector_id": "s-1",
                "status": "pending",
            }
        )
        people.append(
            {
                "id": f"p-{i:03d}",
                "house_id": hid,
                "name": nombre,
                "phone": f"+3460000{i:04d}",
                "lat": lat,
                "lon": lon,
                "household_size": 1 + (i % 3),
                "mobility": "reduced" if vulnerable else "car",
                "has_smartphone": i % 3 != 0,
                "status": "unknown",
                "sector_id": "s-1",
            }
        )

    return {
        "meta": {
            "name": "minimo-embebido",
            "synthetic": True,
            "notice": "DATOS SINTÉTICOS de emergencia (fallback de la API). Nada real.",
        },
        "map": {"center_lat": lat0, "center_lon": lon0, "zoom": 12},
        "villages": [{"name": "Losacio", "lat": lat0, "lon": lon0, "population": 90}],
        "houses": houses,
        "people": people,
        "safe_zones": [
            {
                "id": "x-a",
                "name": "Tábara (CRA León Felipe)",
                "lat": 41.82611,
                "lon": -5.95889,
                "capacity": 400,
                "occupancy": 0,
                "status": "open",
                "access_roads": ["ZA-P-2434"],
            },
            {
                "id": "x-b",
                # Instalacion, coordenadas y carretera VERIFICADAS en
                # docs/research/geografia-zona.md. El "pabellon municipal" y la "ZA-P-1508"
                # que habia aqui antes no existen en la investigacion: eran inventados.
                "name": "Alcañices (CEIP Virgen de la Salud)",
                "lat": 41.69887,
                "lon": -6.34793,
                "capacity": 250,
                "occupancy": 0,
                "status": "open",
                "access_roads": ["N-122"],
            },
        ],
        "sectors": [
            {
                "id": "s-1",
                "name": "Sector 1 — Losacio",
                "polygon": {
                    "type": "Polygon",
                    "coordinates": [
                        [
                            [lon0 - 0.05, lat0 - 0.03],
                            [lon0 + 0.05, lat0 - 0.03],
                            [lon0 + 0.05, lat0 + 0.03],
                            [lon0 - 0.05, lat0 + 0.03],
                            [lon0 - 0.05, lat0 - 0.03],
                        ]
                    ],
                },
            }
        ],
        "patrols": [
            {
                "id": "pt-1",
                "name": "Guardia Civil Tábara 1",
                "lat": 41.7127,
                "lon": -6.0375,
                "status": "standby",
                "channel": "+34600999796",
            }
        ],
        "fire": {
            "perimeter": {
                "type": "Polygon",
                "coordinates": [
                    [
                        [-6.09, 41.66],
                        [-6.01, 41.66],
                        [-6.01, 41.69],
                        [-6.09, 41.69],
                        [-6.09, 41.66],
                    ]
                ],
            },
            "wind": {"direction_deg": 200.0, "speed_kmh": 30.0, "gusts_kmh": 48.0},
            "spread_rate_mh": 1500.0,
            "head_bearing_deg": 20.0,
            "cone_half_angle_deg": 30.0,
        },
    }
