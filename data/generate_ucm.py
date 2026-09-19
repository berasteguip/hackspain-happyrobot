"""Genera `data/scenarios/ucm-madrid.json` — el banco de pruebas de llamadas en la Complutense.

No es el escenario de la demo (ese es `sierra-culebra`, que sale de `generate.py` con 120 casas
sintéticas). Este es pequeño y existe para una cosa concreta: **ensayar sobre teléfonos reales**
la selección por círculo de Vigía y el tablero de llamadas en paralelo.

Por qué es un fichero aparte y no gente añadida al escenario grande: los cuatro primeros
registros son móviles REALES del equipo y rompen a propósito la regla del contrato §1 de usar
solo el rango reservado `+3460099xxxx`. Tenerlos en su propio escenario significa que cargar
la demo (`SCENARIO=sierra-culebra`) no puede marcar un número de nadie ni por accidente.

Ejecutar:  python3 data/generate_ucm.py
Arrancar:  SCENARIO=ucm-madrid make api
"""

import json
import math
import pathlib

OUT = pathlib.Path(__file__).resolve().parent / "scenarios" / "ucm-madrid.json"

# Edificios de la Complutense (Ciudad Universitaria, Madrid). Coordenadas aproximadas.
EDIFICIOS = [
    ("Facultad de Informática", 40.45290, -3.72680),
    ("Facultad de Ciencias Matemáticas", 40.44940, -3.72700),
    ("Facultad de Ciencias Físicas", 40.44980, -3.72470),
    ("Biblioteca María Zambrano", 40.44790, -3.72550),
    ("Facultad de Derecho", 40.44700, -3.72850),
    ("Facultad de Filosofía", 40.44780, -3.73070),
    ("Facultad de Geografía e Historia", 40.44670, -3.73000),
    ("Facultad de Ciencias Químicas", 40.44880, -3.72310),
    ("Facultad de Ciencias Biológicas", 40.44930, -3.72230),
    ("Facultad de Ciencias de la Información", 40.45310, -3.73280),
    ("Facultad de Comercio y Turismo", 40.45200, -3.73090),
    ("Facultad de Psicología", 40.45250, -3.72150),
    ("Facultad de Educación", 40.44250, -3.73000),
    ("Facultad de Bellas Artes", 40.44430, -3.73220),
    ("Facultad de Medicina", 40.44060, -3.72600),
    ("Facultad de Farmacia", 40.44250, -3.72400),
    ("Facultad de Odontología", 40.44000, -3.72470),
    ("Facultad de Veterinaria", 40.43960, -3.72920),
    ("Rectorado · Edificio de Alumnos", 40.44600, -3.72870),
    ("Facultad de Ciencias Económicas", 40.44840, -3.71940),
    ("Escuela de Estadística", 40.45040, -3.72340),
    ("Colegio Mayor Ximénez de Cisneros", 40.45090, -3.72880),
    ("Colegio Mayor Chaminade", 40.45420, -3.72960),
    ("Paraninfo de la Complutense", 40.44720, -3.72730),
]

# --- Los cuatro del equipo -------------------------------------------------------------
# SIN teléfono real: el repo es público y un móvil en un fichero versionado se queda en el
# historial de git para siempre. Aquí van números del rango reservado (contrato §1) y los de
# verdad se inyectan al arrancar con PHONE_OVERRIDES en `.env`, que no se comitea:
#
#   PHONE_OVERRIDES=p-001:+34600112233,p-002:+34600445566,...
#
# Están los cuatro en el mismo sitio (es donde estamos ensayando), separados unas decenas
# de metros para que se distingan en el mapa. Un círculo de ~150 m coge a estos cuatro y a
# nadie más; uno de 700 m arrastra además al vecindario sintético, que es justo el otro caso
# que hay que poder enseñar.
REALES = [
    ("Pablo", "+34600990001"),
    ("Mateo", "+34600990002"),
    ("Nico",  "+34600990003"),
    ("Allan", "+34600990004"),
]
BASE_EQUIPO = ("Facultad de Informática", 40.45290, -3.72680)


def jitter(lat, lon, i):
    """Separa a dos personas del mismo edificio para que no caigan en el mismo píxel."""
    ang = (i * 137.5) * math.pi / 180.0
    r = 18 + (i % 5) * 9  # metros
    return (
        round(lat + (r * math.sin(ang)) / 111_320, 6),
        round(lon + (r * math.cos(ang)) / (111_320 * math.cos(math.radians(lat))), 6),
    )


# --- Vecindario sintético, como el de Gredos: teléfonos del rango reservado -------------
NOMBRES = ["Carmen Losada", "Antonio Prieto", "María Cid", "José Nevado", "Elena Quirós",
           "Pedro Vilas", "Isabel Tejada", "Manuel Arroyo", "Rosa Benito", "Javier Rueda",
           "Pilar Nogales", "Francisco Alba", "Ana Mendo", "Raúl Quesada", "Teresa Cuevas",
           "Lucía Serna", "Diego Palomar", "Sofía Bermejo", "Miguel Casal", "Marta Endrino"]

MOVILIDAD = ["car", "walking", "car", "reduced", "car", "walking", "car", "immobile",
             "car", "walking", "car", "car", "walking", "car", "reduced", "car",
             "walking", "car", "car", "walking"]


def sector_de(lat):
    return "s-1" if lat >= 40.4470 else "s-2"


houses, people = [], []

for n, (nombre, tel) in enumerate(REALES, start=1):
    edificio, blat, blon = BASE_EQUIPO
    lat, lon = jitter(blat, blon, n * 3)
    hid, pid = f"h-{n:03d}", f"p-{n:03d}"
    houses.append({
        "id": hid, "address": f"{edificio}, Ciudad Universitaria", "village": "Ciudad Universitaria",
        "lat": lat, "lon": lon, "phone": tel, "residents_expected": 1,
        "vulnerable": False, "vulnerability_reason": None, "sector_id": sector_de(lat),
        "call_attempts": 0, "last_call_at": None, "answered": False, "status": "pending",
        "minutes_to_front": None, "assigned_patrol_id": None, "patrol_eta_min": None,
        "priority_rank": None,
    })
    people.append({
        "id": pid, "house_id": hid, "name": nombre, "phone": tel,
        "lat": lat, "lon": lon, "position_source": None, "position_updated_at": None,
        "trajectory": [], "heading_deg": None, "speed_kmh": None,
        "household_size": 1, "mobility": "walking", "seats_free": None, "has_smartphone": True,
        "status": "unknown", "sector_id": sector_de(lat), "assigned_exit_id": None,
        "assigned_route": None, "convoy_id": None, "convoy_role": None,
        "minutes_to_front": None, "priority_score": None, "last_instruction": None,
        "consent_position": False, "call_attempts": 0,
        "notes": "Equipo router123. El teléfono de este fichero es del rango reservado; el real se inyecta con PHONE_OVERRIDES al arrancar y solo se marca si está en CALL_ALLOWLIST.",
    })

for n, nombre in enumerate(NOMBRES):
    idx = 1 + (n % (len(EDIFICIOS) - 1))
    edificio, blat, blon = EDIFICIOS[idx]
    lat, lon = jitter(blat, blon, n)
    seq = len(REALES) + n + 1
    hid, pid = f"h-{seq:03d}", f"p-{seq:03d}"
    tel = f"+3460099{100 + seq:04d}"
    vulnerable = MOVILIDAD[n] in {"reduced", "immobile"}
    houses.append({
        "id": hid, "address": f"{edificio}, Ciudad Universitaria", "village": "Ciudad Universitaria",
        "lat": lat, "lon": lon, "phone": tel, "residents_expected": 1 + (n % 3),
        "vulnerable": vulnerable,
        "vulnerability_reason": "movilidad reducida declarada (dato sintético)" if vulnerable else None,
        "sector_id": sector_de(lat), "call_attempts": 0, "last_call_at": None, "answered": False,
        "status": "pending", "minutes_to_front": None, "assigned_patrol_id": None,
        "patrol_eta_min": None, "priority_rank": None,
    })
    people.append({
        "id": pid, "house_id": hid, "name": nombre, "phone": tel,
        "lat": lat, "lon": lon, "position_source": None, "position_updated_at": None,
        "trajectory": [], "heading_deg": None, "speed_kmh": None,
        "household_size": 1 + (n % 3), "mobility": MOVILIDAD[n], "seats_free": None,
        "has_smartphone": n % 4 != 3, "status": "unknown", "sector_id": sector_de(lat),
        "assigned_exit_id": None, "assigned_route": None, "convoy_id": None, "convoy_role": None,
        "minutes_to_front": None, "priority_score": None, "last_instruction": None,
        "consent_position": False, "call_attempts": 0,
        "notes": "Vecino sintético. Teléfono del rango reservado: no existe, no se marca.",
    })

scenario = {
    "meta": {
        "name": "Ciudad Universitaria (UCM) — banco de pruebas de llamadas",
        "seed": 20260919,
        "generated_at": "2026-09-19T00:00:00Z",
        "synthetic": True,
        "notice": (
            "ESCENARIO DE PRUEBA, no de demo. Sirve para ensayar la selección por círculo en "
            "Vigía y el tablero de llamadas en paralelo sobre teléfonos reales del equipo. "
            "El incendio en la Dehesa de la Villa es FICTICIO. Las coordenadas de los edificios "
            "de la Complutense son aproximadas. Las cuatro primeras personas (p-001..p-004) son "
            "los miembros del equipo router123. TODOS los teléfonos de este fichero son del "
            "rango reservado +3460099xxxx (contrato §1): los móviles reales del ensayo se "
            "inyectan al arrancar con PHONE_OVERRIDES desde `.env`, que no se comitea, porque "
            "este repo es público. El resto del vecindario es sintético."
        ),
    },
    "map": {
        "center_lat": 40.4470, "center_lon": -3.7280, "zoom": 15,
        "bbox": [-3.7400, 40.4370, -3.7150, 40.4580],
    },
    "villages": [
        {"name": "Ciudad Universitaria", "lat": 40.4470, "lon": -3.7280, "population": 24},
    ],
    "houses": houses,
    "people": people,
    # El cono de avance (±30° sobre el rumbo 170°) amenaza a cualquier zona que tenga
    # delante, SIN límite de distancia: alejar las salidas hacia el sur no las salva, porque
    # el fuego empuja justo hacia allí. Las dos utilizables están al ESTE, perpendiculares a
    # la carrera del frente —que además es lo correcto operativamente: no se evacúa a nadie
    # en la misma dirección en la que avanza el fuego—. Príncipe Pío se deja al sur y nace
    # AMENAZADA a propósito, para que el escenario ejercite ese camino del planner.
    "safe_zones": [
        {"id": "x-a", "name": "Intercambiador de Plaza de Castilla", "lat": 40.46683,
         "lon": -3.68917, "capacity": 900, "occupancy": 0, "status": "open",
         "access_roads": ["Paseo de la Castellana"], "distance_to_fire_m": 2470},
        {"id": "x-b", "name": "Intercambiador de Nuevos Ministerios", "lat": 40.44600,
         "lon": -3.69200, "capacity": 1200, "occupancy": 0, "status": "open",
         "access_roads": ["Paseo de la Castellana", "Calle de Raimundo Fernández Villaverde"],
         "distance_to_fire_m": 3550},
        {"id": "x-c", "name": "Estación de Príncipe Pío", "lat": 40.42055, "lon": -3.72030,
         "capacity": 1200, "occupancy": 0, "status": "open",
         "access_roads": ["Paseo de la Florida", "Cuesta de San Vicente"],
         "distance_to_fire_m": 5400},
    ],
    "sectors": [
        {"id": "s-1", "name": "Sector 1 — Complutense norte",
         "polygon": {"type": "Polygon", "coordinates": [[[-3.7400, 40.4470], [-3.7150, 40.4470],
                                                         [-3.7150, 40.4580], [-3.7400, 40.4580],
                                                         [-3.7400, 40.4470]]]},
         "people_inside": 0, "people_unknown": 0, "vulnerable_inside": 0,
         "minutes_to_front": None, "air_priority_rank": 1,
         "air_priority_reason": "sector más cercano al frente ficticio"},
        {"id": "s-2", "name": "Sector 2 — Complutense sur",
         "polygon": {"type": "Polygon", "coordinates": [[[-3.7400, 40.4370], [-3.7150, 40.4370],
                                                         [-3.7150, 40.4470], [-3.7400, 40.4470],
                                                         [-3.7400, 40.4370]]]},
         "people_inside": 0, "people_unknown": 0, "vulnerable_inside": 0,
         "minutes_to_front": None, "air_priority_rank": 2,
         "air_priority_reason": "a sotavento del sector 1"},
    ],
    "patrols": [
        {"id": "pt-1", "name": "Patrulla Complutense 1", "lat": 40.44600, "lon": -3.72870,
         "assigned_house_ids": [], "status": "standby", "channel": "+34600999901"},
        {"id": "pt-2", "name": "Patrulla Moncloa 2", "lat": 40.43524, "lon": -3.71903,
         "assigned_house_ids": [], "status": "standby", "channel": "+34600999902"},
    ],
    "fire": {
        # Norte de la Dehesa de la Villa. Lo bastante lejos de las salidas para que no las
        # marque `SAFE_ZONE_THREATENED_M` (3 km) nada más arrancar, y lo bastante cerca del
        # campus para que el cono de avance sí apunte a la gente.
        "perimeter": {"type": "Polygon", "coordinates": [[
            [-3.7295, 40.4690], [-3.7205, 40.4695], [-3.7160, 40.4755],
            [-3.7235, 40.4795], [-3.7330, 40.4760], [-3.7295, 40.4690],
        ]]},
        "wind": {"direction_deg": 350, "speed_kmh": 28, "gusts_kmh": 44},
        "spread_rate_mh": 900,
        "head_bearing_deg": 170,
        "cone_half_angle_deg": 30,
        "updated_at": "2026-09-19T00:00:00Z",
        "history": [],
    },
    "roads": [
        {"name": "Avenida de Pablo Iglesias",
         "geometry": {"type": "LineString",
                      "coordinates": [[-3.72680, 40.45290], [-3.68917, 40.46683]]},
         "sole_exit_for": []},
        {"name": "Calle de Raimundo Fernández Villaverde",
         "geometry": {"type": "LineString",
                      "coordinates": [[-3.72730, 40.44720], [-3.69200, 40.44600]]},
         "sole_exit_for": []},
    ],
}

OUT.write_text(json.dumps(scenario, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(f"{OUT} · casas={len(houses)} personas={len(people)}")
