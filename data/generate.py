#!/usr/bin/env python3
"""Generador determinista del escenario sintético de evacuación (Sierra de la Culebra).

Uso:
    python data/generate.py --scenario sierra-culebra --seed 42 --houses 120 \
        --out data/scenarios/sierra-culebra.json

Determinista: la misma combinación de --scenario/--seed/--houses produce SIEMPRE
el mismo fichero, byte a byte. Por eso `meta.generated_at` NO es la hora real de
ejecución (eso rompería la reproducibilidad): es una fecha de referencia fija del
escenario. Ver docs/contrato-de-datos.md para la forma exacta de cada entidad.

Todo lo que este generador inventa (edades, nombres, quién contesta al teléfono...)
vive en el campo `_sim` de House/Person, que la API ignora — nunca en un campo del
contrato. El contrato es fuente de verdad y este script no le añade campos nuevos.
"""
from __future__ import annotations

import argparse
import json
import math
import random
import sys
from pathlib import Path

# ============================================================================
# GEOGRAFÍA VERIFICADA — fuente: docs/research/geografia-zona.md
# Comarca de Aliste / Tábara (Zamora). Coordenadas y poblaciones reales; los
# aforos de las zonas seguras son estimaciones por tipo de instalación, no
# cifras oficiales. Bloque aislado a propósito: cambiar estos números no debe
# tocar nada más abajo.
# ============================================================================
GEO_VILLAGES = [
    # (nombre, lat, lon, poblacion_aprox)
    ("Losacio", 41.71088, -6.03987, 90),  # donde se originó el incendio real de jul 2022
    ("Ferreruela de Tábara", 41.76583, -6.07194, 409),
    ("Sesnández de Tábara", 41.80778, -6.07667, 136),
]

GEO_SAFE_ZONES = [
    # (nombre, lat, lon, capacidad, carretera_de_acceso)
    # ZA-P-2434 es la ÚNICA vía provincial que da salida a Sesnández y, por el
    # mismo corredor, a Ferreruela: cortarla los aísla de Tábara aunque estén a
    # menos de 15 km. Ahí está el drama del escenario.
    ("Tábara (CRA León Felipe)", 41.82611, -5.95889, 400, "ZA-P-2434"),
    ("Alcañices (CEIP Virgen de la Salud / IES Aliste)", 41.69887, -6.34793, 1000, "N-122"),
]

GEO_MAP_CENTER = (41.715, -6.10)
GEO_MAP_ZOOM = 11

GEO_FIRE_ORIGIN = (41.635, -6.18)  # sudoeste de los pueblos, en la sierra
GEO_FIRE_HALF_WIDTH_M = 3200.0
GEO_FIRE_HALF_HEIGHT_M = 2100.0
# ============================================================================
# FIN GEOGRAFÍA VERIFICADA
# ============================================================================

# Fecha de referencia fija del escenario (no la hora real de generación) para
# garantizar que dos ejecuciones con la misma semilla produzcan el mismo byte.
SCENARIO_REFERENCE_DATE = "2026-09-19T17:00:00Z"

SYNTHETIC_NOTICE = (
    "DATOS SINTÉTICOS. Ningún teléfono, nombre ni dirección corresponde a una "
    "persona real."
)

PHONE_PREFIX = "+3460099"  # rango sintético reservado, contrato §1

STREET_NAMES = [
    "Calle Mayor",
    "Calle de la Iglesia",
    "Camino de la Fuente",
    "Travesía del Rollo",
    "Plaza de la Constitución",
    "Calle Real",
    "Calle del Convento",
    "Calle de la Ermita",
    "Calle del Pozo",
]

# Nombres por generación (España rural, coherentes con la edad derivada).
MALE_NAMES_OLD = [
    "Antonio", "Ángel", "Manuel", "José", "Francisco", "Isidro", "Julián",
    "Benigno", "Marcelino", "Aurelio", "Anastasio", "Restituto", "Eusebio",
    "Gregorio", "Felicísimo", "Secundino",
]
FEMALE_NAMES_OLD = [
    "Carmen", "Dolores", "Pilar", "Rosario", "Josefa", "Manuela",
    "Encarnación", "Angustias", "Felisa", "Balbina", "Aurora", "Adoración",
    "Herminia", "Fermina", "Casilda",
]
MALE_NAMES_MID = [
    "Javier", "Fernando", "Miguel Ángel", "Roberto", "Alfredo", "Emilio",
    "Ramón", "Fructuoso", "Vicente",
]
FEMALE_NAMES_MID = [
    "Isabel", "Cristina", "Mercedes", "María José", "Ángeles", "Begoña",
    "Consuelo", "Remedios", "Milagros",
]
MALE_NAMES_YOUNG = [
    "David", "Alberto", "Sergio", "Pablo", "Rubén", "Iván", "Adrián", "Diego",
]
FEMALE_NAMES_YOUNG = [
    "Laura", "Sara", "Patricia", "Marta", "Elena", "Lucía", "Beatriz", "Nuria",
]

SURNAMES = [
    "Prieto", "Mateos", "Rubio", "Casquero", "Combarros", "Fidalgo",
    "Carbajo", "Alonso", "Vega", "Represa", "Manso", "Pérez", "Domínguez",
    "Martín", "Vaquero", "Justo", "Barrio", "Cid", "Franco", "Seco",
    "Blanco", "Calvo", "Andrés", "Pisabarro", "Geijo", "Cantero", "Moral",
]

VULNERABILITY_REASONS = [
    "movilidad reducida",
    "encamado, necesita ambulancia",
    "vive solo/a, teleasistencia",
    "dependiente, cuidador ausente durante el día",
]

METERS_PER_DEG_LAT = 111_320.0


def meters_per_deg_lon(lat_deg: float) -> float:
    return 111_320.0 * math.cos(math.radians(lat_deg))


def offset_latlon(lat: float, lon: float, north_m: float, east_m: float):
    dlat = north_m / METERS_PER_DEG_LAT
    dlon = east_m / meters_per_deg_lon(lat)
    return lat + dlat, lon + dlon


def haversine_m(lat1, lon1, lat2, lon2) -> float:
    r = 6_371_000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlmb = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlmb / 2) ** 2
    return 2 * r * math.asin(min(1.0, math.sqrt(a)))


def bearing_deg(lat1, lon1, lat2, lon2) -> float:
    """Rumbo (grados, 0=norte, sentido horario) de punto 1 a punto 2."""
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dlmb = math.radians(lon2 - lon1)
    y = math.sin(dlmb) * math.cos(p2)
    x = math.cos(p1) * math.sin(p2) - math.sin(p1) * math.cos(p2) * math.cos(dlmb)
    return (math.degrees(math.atan2(y, x)) + 360.0) % 360.0


def angle_diff(a: float, b: float) -> float:
    d = abs(a - b) % 360.0
    return d if d <= 180.0 else 360.0 - d


# ----------------------------------------------------------------------------
# Demografía
# ----------------------------------------------------------------------------

AGE_BUCKETS = [
    # (lo, hi, peso) — pesos suman 100, ~48% >=65
    (20, 34, 5),
    (35, 49, 12),
    (50, 64, 35),
    (65, 74, 22),
    (75, 84, 18),
    (85, 96, 8),
]


def sample_age(rng: random.Random) -> int:
    total = sum(w for _, _, w in AGE_BUCKETS)
    r = rng.uniform(0, total)
    acc = 0.0
    for lo, hi, w in AGE_BUCKETS:
        acc += w
        if r <= acc:
            return rng.randint(lo, hi)
    return AGE_BUCKETS[-1][1]


def sample_household_size(rng: random.Random, age: int) -> int:
    if age >= 75:
        dist = [(1, 0.70), (2, 0.25), (3, 0.05)]
    elif age >= 65:
        dist = [(1, 0.40), (2, 0.45), (3, 0.15)]
    elif age >= 50:
        dist = [(1, 0.20), (2, 0.40), (3, 0.25), (4, 0.15)]
    else:
        dist = [(1, 0.15), (2, 0.30), (3, 0.30), (4, 0.25)]
    return weighted_choice(rng, dist)


def weighted_choice(rng: random.Random, dist):
    total = sum(w for _, w in dist)
    r = rng.uniform(0, total)
    acc = 0.0
    for value, w in dist:
        acc += w
        if r <= acc:
            return value
    return dist[-1][0]


def derive_mobility(rng: random.Random, age: int) -> str:
    if age >= 85:
        dist = [("immobile", 0.35), ("reduced", 0.40), ("walking", 0.20), ("car", 0.05)]
    elif age >= 75:
        dist = [("immobile", 0.12), ("reduced", 0.30), ("walking", 0.30), ("car", 0.28)]
    elif age >= 65:
        dist = [("immobile", 0.02), ("reduced", 0.12), ("walking", 0.26), ("car", 0.60)]
    elif age >= 50:
        dist = [("immobile", 0.0), ("reduced", 0.03), ("walking", 0.12), ("car", 0.85)]
    else:
        dist = [("immobile", 0.0), ("reduced", 0.02), ("walking", 0.08), ("car", 0.90)]
    return weighted_choice(rng, dist)


def derive_smartphone(rng: random.Random, age: int) -> bool:
    if age < 50:
        p = 0.97
    elif age < 65:
        p = 0.85
    elif age < 75:
        p = 0.55
    elif age < 85:
        p = 0.25
    else:
        p = 0.08
    return rng.random() < p


def pick_name(rng: random.Random, gender: str, age: int) -> str:
    if age >= 65:
        pool = FEMALE_NAMES_OLD if gender == "f" else MALE_NAMES_OLD
    elif age >= 40:
        pool = FEMALE_NAMES_MID if gender == "f" else MALE_NAMES_MID
    else:
        pool = FEMALE_NAMES_YOUNG if gender == "f" else MALE_NAMES_YOUNG
    return rng.choice(pool)


def pick_surname(rng: random.Random) -> str:
    return rng.choice(SURNAMES)


# ----------------------------------------------------------------------------
# Teléfonos
# ----------------------------------------------------------------------------


class PhonePool:
    """Genera teléfonos únicos +3460099xxxx (rango sintético del contrato)."""

    def __init__(self, rng: random.Random):
        self.rng = rng
        self.used = set()

    def next_phone(self) -> str:
        for _ in range(20_000):
            suffix = self.rng.randint(0, 9999)
            phone = f"{PHONE_PREFIX}{suffix:04d}"
            if phone not in self.used:
                self.used.add(phone)
                return phone
        raise RuntimeError("Se agotó el rango sintético de teléfonos +3460099xxxx")


# ----------------------------------------------------------------------------
# Generación de casas
# ----------------------------------------------------------------------------


def build_villages(num_villages: int):
    return GEO_VILLAGES[:num_villages] if num_villages <= len(GEO_VILLAGES) else GEO_VILLAGES


def allocate_houses_per_village(villages, total_houses: int):
    weights = [pop for _, _, _, pop in villages]
    total_weight = sum(weights)
    allocations = []
    for _, _, _, pop in villages:
        allocations.append(max(1, round(total_houses * pop / total_weight)))
    # ajuste para que la suma sea exacta
    diff = total_houses - sum(allocations)
    i = 0
    while diff != 0:
        idx = i % len(allocations)
        if diff > 0:
            allocations[idx] += 1
            diff -= 1
        elif allocations[idx] > 1:
            allocations[idx] -= 1
            diff += 1
        i += 1
    return allocations


def build_streets_for_village(rng: random.Random, n_houses: int):
    n_streets = min(5, max(3, n_houses // 8))
    names = rng.sample(STREET_NAMES, k=min(n_streets, len(STREET_NAMES)))
    if len(names) < n_streets:
        names = names + [rng.choice(STREET_NAMES) for _ in range(n_streets - len(names))]
    return names


def gen_houses_for_village(
    rng: random.Random, village_name: str, v_lat: float, v_lon: float, n_houses: int
):
    """Núcleo denso en calles (numeración par/impar) + 15% disperso en el campo."""
    n_dispersed = max(1, round(n_houses * 0.15)) if n_houses >= 4 else 0
    n_core = n_houses - n_dispersed

    streets = build_streets_for_village(rng, max(n_core, 1))
    houses = []

    # núcleo: reparte las casas del núcleo entre las calles, a ambos lados
    per_street = max(1, n_core // len(streets)) if streets else 0
    remaining = n_core
    street_idx = 0
    house_number = {name: {"even": 2, "odd": 1} for name in streets}
    # separación entre casas y entre calles (metros)
    house_spacing_m = 22.0
    street_spacing_m = 40.0

    house_slot = 0
    while remaining > 0:
        street = streets[street_idx % len(streets)]
        side = "even" if house_slot % 2 == 0 else "odd"
        number = house_number[street][side]
        house_number[street][side] += 2

        along = (number // 2) * house_spacing_m
        across = (streets.index(street) - (len(streets) - 1) / 2.0) * street_spacing_m
        side_sign = 1.0 if side == "even" else -1.0
        lat, lon = offset_latlon(
            v_lat, v_lon, north_m=along, east_m=across + side_sign * 6.0
        )
        houses.append(
            {
                "address": f"{street} {number}, {village_name}",
                "lat": lat,
                "lon": lon,
                "dispersed": False,
            }
        )
        remaining -= 1
        house_slot += 1
        if house_slot % max(1, per_street) == 0:
            street_idx += 1

    # disperso: 0.5-3 km del centro, en el campo
    for i in range(n_dispersed):
        distance_m = rng.uniform(500.0, 3000.0)
        bearing = rng.uniform(0.0, 360.0)
        north_m = distance_m * math.cos(math.radians(bearing))
        east_m = distance_m * math.sin(math.radians(bearing))
        lat, lon = offset_latlon(v_lat, v_lon, north_m=north_m, east_m=east_m)
        houses.append(
            {
                "address": f"Diseminado, {village_name} (camino rural)",
                "lat": lat,
                "lon": lon,
                "dispersed": True,
            }
        )

    return houses


# ----------------------------------------------------------------------------
# Fuego / minutes_to_front (aproximación para el estado inicial)
# ----------------------------------------------------------------------------


def build_fire(villages):
    # `villages` son los village_records (dicts), no las tuplas de GEO_VILLAGES.
    centroid_lat = sum(v["lat"] for v in villages) / len(villages)
    centroid_lon = sum(v["lon"] for v in villages) / len(villages)
    origin_lat, origin_lon = GEO_FIRE_ORIGIN
    head_bearing = bearing_deg(origin_lat, origin_lon, centroid_lat, centroid_lon)
    # el viento sopla "casi" en la dirección opuesta al avance, no exactamente
    # (contrato: confundirlos invierte la demo, por eso van explícitos y separados)
    wind_direction = (head_bearing + 180.0 + 15.0) % 360.0

    hw, hh = GEO_FIRE_HALF_WIDTH_M, GEO_FIRE_HALF_HEIGHT_M
    corners_m = [(-hw, -hh), (hw, -hh), (hw, hh), (-hw, hh)]
    coords = []
    for east_m, north_m in corners_m:
        lat, lon = offset_latlon(origin_lat, origin_lon, north_m=north_m, east_m=east_m)
        coords.append([round(lon, 6), round(lat, 6)])
    coords.append(coords[0])

    fire = {
        "perimeter": {"type": "Polygon", "coordinates": [coords]},
        "wind": {
            "direction_deg": round(wind_direction, 1),
            "speed_kmh": 34.0,
            "gusts_kmh": 52.0,
        },
        "spread_rate_mh": 1800.0,
        "head_bearing_deg": round(head_bearing, 1),
        "cone_half_angle_deg": 30.0,
        "updated_at": SCENARIO_REFERENCE_DATE,
        "history": [],
    }
    return fire, (origin_lat, origin_lon)


def fire_radius_m_at_bearing(bearing_from_origin: float) -> float:
    """Radio aproximado (m) del rectángulo del fuego en un rumbo dado, tratado
    como elipse con semiejes half_width/half_height. Aproximación deliberada
    para el estado inicial; el motor de escenario recalcula con geometría real."""
    theta = math.radians(bearing_from_origin)
    a, b = GEO_FIRE_HALF_WIDTH_M, GEO_FIRE_HALF_HEIGHT_M
    denom = math.sqrt((math.sin(theta) / a) ** 2 + (math.cos(theta) / b) ** 2)
    return 1.0 / denom if denom > 0 else a


def effective_spread_factor(angle_from_head: float) -> float:
    """1.0 en la cabeza, ~0.35 en el flanco (90°), ~0.10 en la cola (180°)."""
    if angle_from_head <= 90.0:
        return 1.0 + (0.35 - 1.0) * (angle_from_head / 90.0)
    return 0.35 + (0.10 - 0.35) * ((angle_from_head - 90.0) / 90.0)


def minutes_to_front(lat, lon, fire_origin, head_bearing_deg, spread_rate_mh):
    origin_lat, origin_lon = fire_origin
    dist_m = haversine_m(origin_lat, origin_lon, lat, lon)
    bearing_from_origin = bearing_deg(origin_lat, origin_lon, lat, lon)
    radius_m = fire_radius_m_at_bearing(bearing_from_origin)
    distance_to_front_m = max(dist_m - radius_m, 50.0)
    angle = angle_diff(bearing_from_origin, head_bearing_deg)
    factor = effective_spread_factor(angle)
    effective_rate_mh = max(spread_rate_mh * factor, 1.0)
    return round((distance_to_front_m / effective_rate_mh) * 60.0, 1)


# ----------------------------------------------------------------------------
# Simulación oculta (_sim): quién no contesta, quién se niega, quién tarda
# ----------------------------------------------------------------------------


def sim_call_behavior(rng: random.Random, age: int, household_size: int):
    p_no_answer = 0.12
    if age >= 75:
        p_no_answer += 0.20
    elif age >= 65:
        p_no_answer += 0.08
    if household_size == 1:
        p_no_answer += 0.10
    p_no_answer = min(p_no_answer, 0.75)
    will_answer = rng.random() > p_no_answer

    p_refuse = 0.04
    if age >= 80:
        p_refuse += 0.08
    if household_size == 1 and age >= 70:
        p_refuse += 0.05
    p_refuse = min(p_refuse, 0.40)
    will_refuse = rng.random() < p_refuse

    return will_answer, will_refuse


def sim_delay_minutes(rng: random.Random, age: int, mobility: str) -> float:
    base = 8.0
    penalty = {"immobile": 25.0, "reduced": 15.0, "walking": 5.0, "car": 0.0}[mobility]
    age_penalty = 10.0 if age >= 80 else 0.0
    jitter = rng.uniform(-5.0, 5.0)
    return round(max(base + penalty + age_penalty + jitter, 1.0), 1)


# ----------------------------------------------------------------------------
# Vecinos (capa 2 del escenario)
# ----------------------------------------------------------------------------


def build_neighbor_graph(house_records, k_min=2, k_max=4, rng: random.Random = None):
    """Grafo dirigido de 2-4 vecinos más cercanos por casa, simetrizado
    (si A dice que B es vecino, B también lista a A) para garantizar que la
    red vecinal cubra el pueblo con pocas semillas: ver
    data/tests/test_neighbor_coverage.py."""
    by_village = {}
    for h in house_records:
        by_village.setdefault(h["village"], []).append(h)

    forward = {h["id"]: set() for h in house_records}
    for village, houses in by_village.items():
        for h in houses:
            distances = []
            for other in houses:
                if other["id"] == h["id"]:
                    continue
                d = haversine_m(h["lat"], h["lon"], other["lat"], other["lon"])
                distances.append((d, other["id"]))
            distances.sort(key=lambda t: (t[0], t[1]))
            k = rng.randint(k_min, k_max)
            for _, other_id in distances[:k]:
                forward[h["id"]].add(other_id)

    # simetrizar
    symmetric = {hid: set(neigh) for hid, neigh in forward.items()}
    for hid, neigh in forward.items():
        for other_id in neigh:
            symmetric[other_id].add(hid)

    return {hid: sorted(neigh) for hid, neigh in symmetric.items()}


# ----------------------------------------------------------------------------
# Sectores
# ----------------------------------------------------------------------------


COMPASS = [
    ("norte", 0),
    ("este", 90),
    ("sur", 180),
    ("oeste", 270),
    ("centro", None),
]


def build_sectors(bbox, villages, n_sectors: int):
    lat_min, lat_max = bbox["lat_min"], bbox["lat_max"]
    lon_min, lon_max = bbox["lon_min"], bbox["lon_max"]

    # partición en rejilla: filas x columnas lo más cuadrada posible
    cols = 2 if n_sectors >= 4 else 1
    rows = max(1, math.ceil(n_sectors / cols))
    cell_lat = (lat_max - lat_min) / rows
    cell_lon = (lon_max - lon_min) / cols

    sectors = []
    idx = 1
    for r in range(rows):
        for c in range(cols):
            if idx > n_sectors:
                break
            cell_lat_min = lat_min + r * cell_lat
            cell_lat_max = lat_min + (r + 1) * cell_lat
            cell_lon_min = lon_min + c * cell_lon
            cell_lon_max = lon_min + (c + 1) * cell_lon
            centroid_lat = (cell_lat_min + cell_lat_max) / 2
            centroid_lon = (cell_lon_min + cell_lon_max) / 2

            nearest_village = min(
                villages,
                key=lambda v: haversine_m(centroid_lat, centroid_lon, v[1], v[2]),
            )
            bearing_to_centroid = bearing_deg(
                nearest_village[1], nearest_village[2], centroid_lat, centroid_lon
            )
            direction = min(
                COMPASS[:-1],
                key=lambda cdir: angle_diff(bearing_to_centroid, cdir[1]),
            )[0]
            name = f"Sector {idx} — {nearest_village[0]} {direction}"

            polygon_coords = [
                [round(cell_lon_min, 6), round(cell_lat_min, 6)],
                [round(cell_lon_max, 6), round(cell_lat_min, 6)],
                [round(cell_lon_max, 6), round(cell_lat_max, 6)],
                [round(cell_lon_min, 6), round(cell_lat_max, 6)],
                [round(cell_lon_min, 6), round(cell_lat_min, 6)],
            ]
            sectors.append(
                {
                    "id": f"s-{idx}",
                    "name": name,
                    "polygon": {"type": "Polygon", "coordinates": [polygon_coords]},
                    "_bbox": (cell_lat_min, cell_lat_max, cell_lon_min, cell_lon_max),
                }
            )
            idx += 1
    return sectors


def sector_for_point(sectors, lat, lon):
    for s in sectors:
        lat_min, lat_max, lon_min, lon_max = s["_bbox"]
        if lat_min <= lat <= lat_max and lon_min <= lon <= lon_max:
            return s["id"]
    # margen numérico: si cae justo en el borde exterior por redondeo, asigna
    # al sector más cercano por centroide
    return min(
        sectors,
        key=lambda s: haversine_m(
            lat, lon, (s["_bbox"][0] + s["_bbox"][1]) / 2, (s["_bbox"][2] + s["_bbox"][3]) / 2
        ),
    )["id"]


# ----------------------------------------------------------------------------
# Generación principal
# ----------------------------------------------------------------------------


def generate_scenario(scenario_name: str, seed: int, n_houses: int):
    rng = random.Random(seed)
    phones = PhonePool(rng)

    num_villages = 3 if n_houses >= 40 else 1
    villages_geo = build_villages(num_villages)
    allocations = allocate_houses_per_village(
        [(n, la, lo, p) for n, la, lo, p in villages_geo], n_houses
    )

    village_records = []
    all_house_geo = []
    for (name, lat, lon, pop), n_v_houses in zip(villages_geo, allocations):
        village_records.append({"name": name, "lat": lat, "lon": lon, "population": pop})
        for h in gen_houses_for_village(rng, name, lat, lon, n_v_houses):
            h["village"] = name
            all_house_geo.append(h)

    fire, fire_origin = build_fire(village_records)
    head_bearing = fire["head_bearing_deg"]
    spread_rate = fire["spread_rate_mh"]

    houses = []
    people = []
    house_seq = 0
    person_seq = 0

    for h_geo in all_house_geo:
        house_seq += 1
        house_id = f"h-{house_seq:03d}"
        lat, lon = h_geo["lat"], h_geo["lon"]

        is_second_residence = rng.random() < 0.10
        has_extra_visitors_roll = rng.random()

        house_people = []
        residents_expected = 0
        vulnerable = False
        vulnerability_reason = None
        occupied_this_weekend = False

        if is_second_residence:
            # 50% de las segundas residencias tienen a los propietarios ese
            # fin de semana; el resto están realmente vacías.
            if has_extra_visitors_roll < 0.5:
                occupied_this_weekend = True
                age = rng.randint(30, 70)
                gender = rng.choice(["m", "f"])
                house_people.append(
                    {
                        "age": age,
                        "gender": gender,
                        "household_size": rng.choice([1, 2, 2, 3]),
                        "uncensored": True,
                    }
                )
        else:
            age = sample_age(rng)
            gender = rng.choice(["m", "f"])
            household_size = sample_household_size(rng, age)
            residents_expected = household_size
            mobility_probe = derive_mobility(rng, age)
            vulnerable = mobility_probe in ("reduced", "immobile") or (
                age >= 80 and household_size == 1
            )
            if vulnerable:
                if mobility_probe == "immobile":
                    vulnerability_reason = "encamado, necesita ambulancia"
                elif mobility_probe == "reduced":
                    vulnerability_reason = "movilidad reducida"
                elif household_size == 1 and age >= 80:
                    vulnerability_reason = rng.choice(
                        ["vive solo/a, teleasistencia", "dependiente, cuidador ausente durante el día"]
                    )
            house_people.append(
                {
                    "age": age,
                    "gender": gender,
                    "household_size": household_size,
                    "uncensored": False,
                    "_mobility_hint": mobility_probe,
                }
            )
            # ~3% adicional de casas con visita de fin de semana no censada
            # (para llegar al ~8% total junto con las segundas residencias)
            if rng.random() < 0.033:
                v_age = rng.randint(18, 55)
                v_gender = rng.choice(["m", "f"])
                house_people.append(
                    {
                        "age": v_age,
                        "gender": v_gender,
                        "household_size": rng.choice([1, 2, 3]),
                        "uncensored": True,
                    }
                )

        has_landline = (not is_second_residence) and rng.random() < 0.25
        # el fijo (si existe) es el número de la casa; si no, la casa se
        # identifica con el móvil del residente principal.
        house_phone = phones.next_phone()

        house_record = {
            "id": house_id,
            "address": h_geo["address"],
            "village": h_geo["village"],
            "lat": round(lat, 6),
            "lon": round(lon, 6),
            "phone": house_phone,
            "residents_expected": residents_expected,
            "vulnerable": vulnerable,
            "vulnerability_reason": vulnerability_reason,
            "sector_id": None,  # se asigna tras construir los sectores
            "call_attempts": 0,
            "last_call_at": None,
            "answered": False,
            "status": "pending",
            "minutes_to_front": minutes_to_front(lat, lon, fire_origin, head_bearing, spread_rate),
            "assigned_patrol_id": None,
            "patrol_eta_min": None,
            "priority_rank": None,
            "_sim": {
                "is_second_residence": is_second_residence,
                "currently_occupied": (not is_second_residence) or occupied_this_weekend,
                "has_uncensored_visitors": any(p["uncensored"] for p in house_people),
                "has_landline": has_landline,
                "dispersed": h_geo["dispersed"],
                "neighbor_ids": [],  # se completa tras construir el grafo de vecindad
            },
        }
        houses.append(house_record)

        for p_info in house_people:
            person_seq += 1
            age = p_info["age"]
            gender = p_info["gender"]
            household_size = p_info["household_size"]
            mobility = p_info.get("_mobility_hint") or derive_mobility(rng, age)
            has_smartphone = derive_smartphone(rng, age)
            name = f"{pick_name(rng, gender, age)} {pick_surname(rng)}"
            person_phone = phones.next_phone()

            will_answer, will_refuse = sim_call_behavior(rng, age, household_size)
            delay_min = sim_delay_minutes(rng, age, mobility)

            person_id = f"p-{person_seq:03d}"
            people.append(
                {
                    "id": person_id,
                    "house_id": house_id,
                    "name": name,
                    "phone": person_phone,
                    "lat": round(lat, 6),
                    "lon": round(lon, 6),
                    "position_source": None,
                    "position_updated_at": None,
                    "trajectory": [],
                    "heading_deg": None,
                    "speed_kmh": None,
                    "household_size": household_size,
                    "mobility": mobility,
                    # null, no 0: nadie ha declarado asientos todavia porque nadie ha hablado aun.
                    # El 0 significaria "va lleno", que es informacion distinta (contrato §2.1).
                    "seats_free": None,
                    "has_smartphone": has_smartphone,
                    "status": "unknown",
                    "sector_id": None,  # se asigna tras construir los sectores
                    "assigned_exit_id": None,
                    "assigned_route": None,
                    "convoy_id": None,
                    "convoy_role": None,
                    "minutes_to_front": minutes_to_front(
                        lat, lon, fire_origin, head_bearing, spread_rate
                    ),
                    "priority_score": None,
                    "last_instruction": None,
                    "consent_position": False,
                    "call_attempts": 0,
                    "notes": None,
                    "_sim": {
                        "age": age,
                        "gender": gender,
                        "uncensored": p_info["uncensored"],
                        "will_answer_call": will_answer,
                        "will_refuse_evacuation": will_refuse,
                        "evacuation_delay_min": delay_min,
                    },
                }
            )

    # bbox a partir de todos los puntos generados (con margen) + villas + zonas seguras
    all_lats = [h["lat"] for h in houses] + [v["lat"] for v in village_records]
    all_lons = [h["lon"] for h in houses] + [v["lon"] for v in village_records]
    safe_zone_geo = GEO_SAFE_ZONES if n_houses >= 40 else GEO_SAFE_ZONES[:1]
    all_lats += [sz[1] for sz in safe_zone_geo]
    all_lons += [sz[2] for sz in safe_zone_geo]
    margin = 0.02
    bbox = {
        "lat_min": round(min(all_lats) - margin, 6),
        "lat_max": round(max(all_lats) + margin, 6),
        "lon_min": round(min(all_lons) - margin, 6),
        "lon_max": round(max(all_lons) + margin, 6),
    }

    n_sectors = min(6, max(2, n_houses // 20))
    sectors_raw = build_sectors(
        bbox, [(v["name"], v["lat"], v["lon"]) for v in village_records], n_sectors
    )

    for h in houses:
        h["sector_id"] = sector_for_point(sectors_raw, h["lat"], h["lon"])
    people_by_house = {}
    for p in people:
        p["sector_id"] = sector_for_point(sectors_raw, p["lat"], p["lon"])
        people_by_house.setdefault(p["house_id"], []).append(p)

    # red vecinal (capa 2)
    neighbor_map = build_neighbor_graph(houses, rng=rng)
    for h in houses:
        h["_sim"]["neighbor_ids"] = neighbor_map[h["id"]]

    houses_by_id = {h["id"]: h for h in houses}

    # completar sectores con agregados calculados sobre el dataset generado
    sectors = []
    for idx, s in enumerate(sectors_raw, start=1):
        sector_people = [p for p in people if p["sector_id"] == s["id"]]
        sector_houses = [h for h in houses if h["sector_id"] == s["id"]]
        people_inside = len(sector_people)
        people_unknown = sum(1 for p in sector_people if p["status"] == "unknown")
        vulnerable_inside = sum(1 for h in sector_houses if h["vulnerable"])
        sector_minutes = (
            min((h["minutes_to_front"] for h in sector_houses), default=None)
        )
        sectors.append(
            {
                "id": s["id"],
                "name": s["name"],
                "polygon": s["polygon"],
                "people_inside": people_inside,
                "people_unknown": people_unknown,
                "vulnerable_inside": vulnerable_inside,
                "minutes_to_front": sector_minutes,
                "air_priority_rank": None,  # se calcula tras tener todos los sectores
                "air_priority_reason": None,
            }
        )

    # air_priority_rank: más gente dentro + más vulnerables + menos minutos = antes
    def air_priority_key(s):
        minutes = s["minutes_to_front"] if s["minutes_to_front"] is not None else 1e9
        return (-s["vulnerable_inside"], -s["people_inside"], minutes)

    ranked = sorted(sectors, key=air_priority_key)
    for rank, s in enumerate(ranked, start=1):
        s["air_priority_rank"] = rank
        s["air_priority_reason"] = (
            f"{s['people_inside']} personas dentro, {s['vulnerable_inside']} "
            f"vulnerable(s), frente a {s['minutes_to_front']} min"
            if s["minutes_to_front"] is not None
            else f"{s['people_inside']} personas dentro, {s['vulnerable_inside']} vulnerable(s)"
        )

    # zonas seguras
    safe_zones = []
    zone_letters = ["a", "b", "c", "d"]
    for i, (name, lat, lon, capacity, road_name) in enumerate(safe_zone_geo):
        distance_to_fire = haversine_m(fire_origin[0], fire_origin[1], lat, lon)
        safe_zones.append(
            {
                "id": f"x-{zone_letters[i]}",
                "name": name,
                "lat": lat,
                "lon": lon,
                "capacity": capacity,
                "occupancy": 0,
                "status": "open",
                "access_roads": [road_name],
                "distance_to_fire_m": round(distance_to_fire, 1),
            }
        )

    # carreteras: una principal por pueblo hacia la primera zona segura,
    # marcada como única salida cuando el pueblo solo tiene esa carretera.
    roads = []
    main_exit_name, main_exit_lat, main_exit_lon = (
        safe_zone_geo[0][0],
        safe_zone_geo[0][1],
        safe_zone_geo[0][2],
    )
    main_road_name = safe_zone_geo[0][3]
    for v in village_records:
        roads.append(
            {
                "name": main_road_name,
                "geometry": {
                    "type": "LineString",
                    "coordinates": [
                        [round(v["lon"], 6), round(v["lat"], 6)],
                        [round(main_exit_lon, 6), round(main_exit_lat, 6)],
                    ],
                },
                "sole_exit_for": [v["name"]],
            }
        )
        break  # una sola entrada de esta carretera troncal es suficiente para el dataset
    # carretera secundaria de ejemplo (cortable en el motor de escenario)
    if len(village_records) > 1:
        roads.append(
            {
                "name": "N-631",
                "geometry": {
                    "type": "LineString",
                    "coordinates": [
                        [round(village_records[0]["lon"], 6), round(village_records[0]["lat"], 6)],
                        [round(village_records[1]["lon"], 6), round(village_records[1]["lat"], 6)],
                    ],
                },
                "sole_exit_for": [],
            }
        )

    # patrullas
    n_patrols = max(1, n_houses // 40)
    patrol_names = [
        "Guardia Civil Tábara 1",
        "Guardia Civil Tábara 2",
        "Policía Local Alcañices",
        "Guardia Civil Puesto Móvil",
    ]
    patrols = []
    for i in range(n_patrols):
        base_village = village_records[i % len(village_records)]
        lat, lon = offset_latlon(base_village["lat"], base_village["lon"], north_m=200, east_m=200)
        patrols.append(
            {
                "id": f"pt-{i + 1}",
                "name": patrol_names[i % len(patrol_names)],
                "lat": round(lat, 6),
                "lon": round(lon, 6),
                "assigned_house_ids": [],
                "status": "standby",
                "channel": phones.next_phone(),
            }
        )

    meta = {
        "name": scenario_name,
        "seed": seed,
        "generated_at": SCENARIO_REFERENCE_DATE,
        "synthetic": True,
        "notice": SYNTHETIC_NOTICE,
    }
    map_block = {
        "center_lat": GEO_MAP_CENTER[0],
        "center_lon": GEO_MAP_CENTER[1],
        "zoom": GEO_MAP_ZOOM,
        "bbox": bbox,
    }

    # limpiar campos internos de trabajo antes de servir el JSON final
    for s in sectors:
        pass  # sectors ya no lleva _bbox (se construyó en dict aparte)

    return {
        "meta": meta,
        "map": map_block,
        "villages": village_records,
        "houses": houses,
        "people": people,
        "safe_zones": safe_zones,
        "sectors": sectors,
        "patrols": patrols,
        "fire": fire,
        "roads": roads,
    }


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--scenario", required=True, help="Nombre del escenario (p.ej. sierra-culebra)")
    parser.add_argument("--seed", type=int, required=True, help="Semilla determinista")
    parser.add_argument("--houses", type=int, required=True, help="Número total de casas a generar")
    parser.add_argument("--out", required=True, help="Ruta del fichero JSON de salida")
    args = parser.parse_args(argv)

    scenario = generate_scenario(args.scenario, args.seed, args.houses)

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with out_path.open("w", encoding="utf-8") as f:
        json.dump(scenario, f, ensure_ascii=False, indent=2, sort_keys=False)
        f.write("\n")

    print(f"Escenario '{args.scenario}' (seed={args.seed}) escrito en {out_path}")
    print(
        f"  villages={len(scenario['villages'])} houses={len(scenario['houses'])} "
        f"people={len(scenario['people'])} sectors={len(scenario['sectors'])} "
        f"safe_zones={len(scenario['safe_zones'])} patrols={len(scenario['patrols'])} "
        f"roads={len(scenario['roads'])}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
