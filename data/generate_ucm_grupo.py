"""Genera `data/scenarios/ucm-grupo.json` — el banco de pruebas GRANDE, con el grupo entero.

Es el hermano mayor de `generate_ucm.py`: mismo campus, misma idea, pero con los ~66 del grupo
de WhatsApp además del equipo. Existe para ensayar la ráfaga de verdad —decenas de llamadas en
paralelo— y no los cuatro de siempre.

**La geometría es el punto de este fichero**, y por eso está al principio del código y no en un
comentario al final. Hay DOS manchas separadas a propósito:

    · EQUIPO  → Facultad de Informática, 4 personas en ~60 m.
    · GRUPO   → ~570 m al noreste, 66 personas en ~140 m.

Separadas lo bastante como para que un círculo dibujado a mano coja una y solo una. Si estuvieran
pegadas habría que afinar el radio al metro en mitad de la demo, con el jurado mirando. Las
holguras concretas las verifica `_verificar()` al generar: si alguien mueve una constante y las
manchas se tocan, el script falla en vez de escribir un escenario roto.

NINGÚN teléfono real entra aquí (contrato §1: el repo es público). Los 66 llevan números del rango
reservado `+3460099xxxx` y nombres genéricos `Vecino NN`. Los datos de verdad —nombre y móvil— se
inyectan al arrancar desde el entorno, que no se comitea.

Ejecutar:  python3 data/generate_ucm_grupo.py [N]   (N = tamaño del grupo, por defecto 66)
Arrancar:  SCENARIO=ucm-grupo make api

Los nombres y móviles REALES no están aquí: se inyectan al arrancar desde `data/private/roster.csv`
(fuera de git). Plantilla con los ids ya puestos: `python3 data/roster_template.py ucm-grupo --grupo`.
"""

import json
import math
import pathlib
import sys

OUT = pathlib.Path(__file__).resolve().parent / "scenarios" / "ucm-grupo.json"

# --- Las dos manchas -------------------------------------------------------------------
# (lat, lon, radio en metros). El radio del grupo sale de la separación que se quiere entre
# puntos: 66 personas repartidas por área en un disco de 140 m quedan a ~30 m unas de otras,
# que es suficiente para que no se pisen en el mapa a zoom de campus.
EQUIPO_CENTRO = (40.45290, -3.72680)   # Facultad de Informática
EQUIPO_RADIO_M = 60.0
GRUPO_CENTRO = (40.45520, -3.72080)    # ~570 m al noreste, lejos del vecindario sintético
GRUPO_RADIO_M = 140.0

# Radios que se espera que use el operador al rodear. No los usa el código: son el contrato
# que `_verificar()` comprueba que se cumple.
CIRCULO_EQUIPO_M = 150.0
CIRCULO_GRUPO_M = 200.0

# El grupo crece según quién se apunte, así que se pasa por argumento en vez de editar el
# fichero: `python3 data/generate_ucm_grupo.py 82`. El radio NO cambia con N —la mancha tiene
# que seguir cabiendo en el mismo círculo—, así que los puntos se aprietan; `_verificar()` corta
# si dos caen a menos de 12 m, que es cuando dejan de ser dos puntos en el mapa.
N_GRUPO = int(sys.argv[1]) if len(sys.argv) > 1 else 66

EQUIPO = [
    ("Pablo", "+34600990001"),
    ("Mateo", "+34600990002"),
    ("Nico",  "+34600990003"),
    ("Allan", "+34600990004"),
]

# Vecindario sintético repartido por el resto del campus: es el "fuera del círculo". Sin él,
# rodear no demuestra nada, porque no habría a quién dejar fuera.
EDIFICIOS = [
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
]

# Mezcla de movilidad: el planner necesita coches con plazas libres para formar convoyes y
# gente con movilidad reducida para que la prioridad signifique algo.
MOVILIDAD_CICLO = ["car", "walking", "car", "car", "reduced", "walking", "car", "immobile"]


def metros_a_grados(lat, dnorte_m, deste_m):
    """Desplazamiento en metros → (lat, lon). Plano local: a 140 m el error es irrelevante."""
    return (
        dnorte_m / 111_320.0,
        deste_m / (111_320.0 * math.cos(math.radians(lat))),
    )


def distancia_m(a, b):
    """Haversine. La misma que usa `api/geo.py` para decidir quién cae dentro del círculo."""
    lat1, lon1 = math.radians(a[0]), math.radians(a[1])
    lat2, lon2 = math.radians(b[0]), math.radians(b[1])
    h = (
        math.sin((lat2 - lat1) / 2) ** 2
        + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    )
    return 2 * 6_371_000.0 * math.asin(math.sqrt(h))


def espiral(centro, radio_m, n, i):
    """Punto i de n repartidos por ÁREA en un disco, con el ángulo áureo.

    `sqrt((i+0.5)/n)` es lo que hace que el reparto sea uniforme por área y no por radio: sin la
    raíz se amontonan todos en el centro. El ángulo áureo (137.507°) evita que salgan radios
    visibles, que es lo que pasa con cualquier ángulo racional.
    """
    lat, lon = centro
    r = radio_m * math.sqrt((i + 0.5) / n)
    ang = math.radians(i * 137.507)
    dlat, dlon = metros_a_grados(lat, r * math.cos(ang), r * math.sin(ang))
    return round(lat + dlat, 6), round(lon + dlon, 6)


def sector_de(lat):
    return "s-1" if lat >= 40.4470 else "s-2"


# Los teléfonos son ÚNICOS en todo el fichero, como en `generate.py`: la casa tiene el suyo y
# la persona el suyo, en bloques separados para poder leerlos de un vistazo. No es cosmético —
# `data/validate.py` rechaza cualquier número repetido entre registros. Al arrancar, la casa
# hereda el móvil real de su residente (`loader._apply_phone_overrides`), y ahí sí coinciden:
# es el runtime el que los une, no el fichero.
TEL_CASA = lambda i: f"+3460099{3000 + i:04d}"        # noqa: E731 - tabla, no lógica
TEL_GRUPO = lambda i: f"+3460099{1000 + i:04d}"       # noqa: E731
TEL_SINTETICO = lambda i: f"+3460099{2000 + i:04d}"   # noqa: E731


def casa(hid, address, lat, lon, tel, residentes, vulnerable):
    return {
        "id": hid, "address": address, "village": "Ciudad Universitaria",
        "lat": lat, "lon": lon, "phone": tel, "residents_expected": residentes,
        "vulnerable": vulnerable,
        "vulnerability_reason": "movilidad reducida declarada (dato sintético)" if vulnerable else None,
        "sector_id": sector_de(lat), "call_attempts": 0, "last_call_at": None,
        "answered": False, "status": "pending", "minutes_to_front": None,
        "assigned_patrol_id": None, "patrol_eta_min": None, "priority_rank": None,
    }


def persona(pid, hid, nombre, tel, lat, lon, movilidad, hogar, notas):
    return {
        "id": pid, "house_id": hid, "name": nombre, "phone": tel,
        "lat": lat, "lon": lon, "position_source": None, "position_updated_at": None,
        "trajectory": [], "heading_deg": None, "speed_kmh": None,
        "household_size": hogar, "mobility": movilidad,
        "seats_free": 3 if movilidad == "car" else None, "has_smartphone": True,
        "status": "unknown", "sector_id": sector_de(lat), "assigned_exit_id": None,
        "assigned_route": None, "convoy_id": None, "convoy_role": None,
        "minutes_to_front": None, "priority_score": None, "last_instruction": None,
        "consent_position": False, "call_attempts": 0, "notes": notas,
    }


houses, people = [], []
seq = 0

# --- 1. El equipo, donde estaba ---------------------------------------------------------
for nombre, tel in EQUIPO:
    seq += 1
    lat, lon = espiral(EQUIPO_CENTRO, EQUIPO_RADIO_M, len(EQUIPO), seq - 1)
    hid, pid = f"h-{seq:03d}", f"p-{seq:03d}"
    houses.append(casa(hid, "Facultad de Informática, Ciudad Universitaria", lat, lon,
                       TEL_CASA(seq - 1), 1, False))
    people.append(persona(
        pid, hid, nombre, tel, lat, lon, "car", 1,
        "Equipo router123. Teléfono del rango reservado; el real se inyecta desde el entorno.",
    ))

# --- 2. El grupo: 66 en la mancha del noreste -------------------------------------------
GRUPO_PRIMERO = seq + 1
for i in range(N_GRUPO):
    seq += 1
    lat, lon = espiral(GRUPO_CENTRO, GRUPO_RADIO_M, N_GRUPO, i)
    hid, pid = f"h-{seq:03d}", f"p-{seq:03d}"
    tel = TEL_GRUPO(i)
    movilidad = MOVILIDAD_CICLO[i % len(MOVILIDAD_CICLO)]
    vulnerable = movilidad in {"reduced", "immobile"}
    portal = 1 + i // 8
    houses.append(casa(
        hid, f"Residencia Complutense Norte, portal {portal}", lat, lon, TEL_CASA(seq - 1),
        1 + (i % 3), vulnerable,
    ))
    people.append(persona(
        pid, hid, f"Vecino {seq:02d}", tel, lat, lon, movilidad, 1 + (i % 3),
        "Participante del grupo. Nombre y teléfono reales se inyectan desde el entorno: "
        "este fichero está versionado y el repo es público.",
    ))
GRUPO_ULTIMO = seq

# --- 3. Vecindario sintético por el resto del campus ------------------------------------
for n, (edificio, blat, blon) in enumerate(EDIFICIOS):
    seq += 1
    lat, lon = espiral((blat, blon), 45.0, len(EDIFICIOS), n)
    hid, pid = f"h-{seq:03d}", f"p-{seq:03d}"
    tel = TEL_SINTETICO(n)
    movilidad = MOVILIDAD_CICLO[(n + 3) % len(MOVILIDAD_CICLO)]
    vulnerable = movilidad in {"reduced", "immobile"}
    houses.append(casa(hid, f"{edificio}, Ciudad Universitaria", lat, lon, TEL_CASA(seq - 1),
                       1 + (n % 3), vulnerable))
    people.append(persona(
        pid, hid, f"Vecino sintético {n + 1:02d}", tel, lat, lon, movilidad, 1 + (n % 3),
        "Vecino sintético. Teléfono del rango reservado: no existe, no se marca.",
    ))


SAFE_ZONES = [
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
]

PATROLS = [
    {"id": "pt-1", "name": "Patrulla Complutense 1", "lat": 40.44600, "lon": -3.72870,
     "assigned_house_ids": [], "status": "standby", "channel": "+34600999901"},
    {"id": "pt-2", "name": "Patrulla Moncloa 2", "lat": 40.43524, "lon": -3.71903,
     "assigned_house_ids": [], "status": "standby", "channel": "+34600999902"},
]

FIRE_PERIMETRO = [
    [-3.7295, 40.4690], [-3.7205, 40.4695], [-3.7160, 40.4755],
    [-3.7235, 40.4795], [-3.7330, 40.4760], [-3.7295, 40.4690],
]


def _bbox(margen_grados=0.004):
    """Rectángulo que contiene TODO lo que se pinta, con un margen para que no roce el borde.

    El contrato exige que casas, personas, salidas y patrullas caigan dentro (`validate.py`), y
    las salidas están a 3-5 km del campus: un bbox escrito a mano y centrado en la Complutense
    las deja fuera y recorta del mapa justo el sitio al que se manda a la gente. El frente del
    incendio entra también, aunque el validador no lo mire, porque si no se ve el fuego no se
    entiende nada.
    """
    lats = [r["lat"] for r in houses + people + SAFE_ZONES + PATROLS]
    lons = [r["lon"] for r in houses + people + SAFE_ZONES + PATROLS]
    lats += [pt[1] for pt in FIRE_PERIMETRO]
    lons += [pt[0] for pt in FIRE_PERIMETRO]
    return {
        "lat_min": round(min(lats) - margen_grados, 5),
        "lat_max": round(max(lats) + margen_grados, 5),
        "lon_min": round(min(lons) - margen_grados, 5),
        "lon_max": round(max(lons) + margen_grados, 5),
    }


def _verificar():
    """Falla si las dos manchas dejan de ser separables. Es el único motivo de este fichero.

    Comprueba lo que de verdad importa el día de la demo: que el círculo de cada grupo coja a
    los suyos ENTEROS y a ninguno del otro, y que sobre holgura para dibujarlo a pulso.
    """
    equipo = people[:len(EQUIPO)]
    grupo = people[GRUPO_PRIMERO - 1:GRUPO_ULTIMO]
    resto = people[GRUPO_ULTIMO:]
    fallos = []

    sep = distancia_m(EQUIPO_CENTRO, GRUPO_CENTRO)
    if sep < CIRCULO_EQUIPO_M + CIRCULO_GRUPO_M + 100:
        fallos.append(f"manchas demasiado juntas: {sep:.0f} m entre centros")

    for etiqueta, gente, centro, radio, otros in (
        ("equipo", equipo, EQUIPO_CENTRO, CIRCULO_EQUIPO_M, grupo + resto),
        ("grupo", grupo, GRUPO_CENTRO, CIRCULO_GRUPO_M, equipo + resto),
    ):
        dentro = [p for p in gente if distancia_m(centro, (p["lat"], p["lon"])) <= radio]
        if len(dentro) != len(gente):
            fallos.append(f"círculo de {etiqueta}: coge {len(dentro)} de {len(gente)} suyos")
        intrusos = [p for p in otros if distancia_m(centro, (p["lat"], p["lon"])) <= radio]
        if intrusos:
            fallos.append(f"círculo de {etiqueta}: se cuelan {len(intrusos)} ajenos")

    # Separación mínima entre puntos del grupo: si dos caen a menos de 12 m son un solo píxel.
    juntos = min(
        distancia_m((a["lat"], a["lon"]), (b["lat"], b["lon"]))
        for i, a in enumerate(grupo) for b in grupo[i + 1:]
    )
    if juntos < 12:
        fallos.append(f"dos del grupo a {juntos:.0f} m: se pisan en el mapa")

    malos = [p["id"] for p in people if not p["phone"].startswith("+3460099")]
    if malos:
        fallos.append(f"teléfonos fuera del rango reservado: {malos}")

    if fallos:
        raise SystemExit("GEOMETRÍA INVÁLIDA:\n  - " + "\n  - ".join(fallos))
    return sep, juntos


separacion, min_sep = _verificar()

scenario = {
    "meta": {
        "name": "Ciudad Universitaria (UCM) — grupo completo",
        "seed": 20260920,
        "generated_at": "2026-09-20T00:00:00Z",
        "synthetic": True,
        "notice": (
            "ESCENARIO DE PRUEBA, no de demo (la demo es sierra-culebra). Sirve para ensayar la "
            "ráfaga grande: decenas de llamadas en paralelo desde el círculo de Vigía. El "
            "incendio de la Dehesa de la Villa es FICTICIO y las coordenadas del campus son "
            "aproximadas. Hay DOS grupos separados ~570 m a propósito, para poder rodear uno sin "
            "el otro: p-001..p-004 son el equipo (Facultad de Informática) y p-005..p-070 el "
            "grupo de participantes (mancha noreste). TODOS los teléfonos son del rango "
            "reservado +3460099xxxx (contrato §1) y TODOS los nombres son genéricos: los datos "
            "reales se inyectan al arrancar desde el entorno, que no se comitea, porque este "
            "repo es público."
        ),
        "geometria": {
            "equipo": {"centro": list(EQUIPO_CENTRO), "personas": len(EQUIPO),
                       "circulo_sugerido_m": CIRCULO_EQUIPO_M},
            "grupo": {"centro": list(GRUPO_CENTRO), "personas": N_GRUPO,
                      "circulo_sugerido_m": CIRCULO_GRUPO_M},
            "separacion_entre_centros_m": round(separacion),
        },
    },
    "map": {
        "center_lat": 40.4500, "center_lon": -3.7250, "zoom": 14,
        # Diccionario, no lista: es lo que produce `generate.py` para sierra-culebra y lo único
        # que `data/validate.py` sabe leer. `ucm-madrid.json` lo escribió como lista y por eso
        # revienta el validador con un TypeError — mismo bug, otro fichero.
        # Se CALCULA de los datos en vez de escribirse a mano: el contrato exige que todo caiga
        # dentro, y las salidas están a 3-5 km del campus. Un bbox tecleado se queda corto en
        # cuanto alguien mueve una zona segura, y el mapa recorta justo el sitio al que mandas
        # a la gente.
        "bbox": _bbox(),
    },
    "villages": [
        {"name": "Ciudad Universitaria", "lat": 40.4500, "lon": -3.7250, "population": len(people)},
    ],
    "houses": houses,
    "people": people,
    "safe_zones": SAFE_ZONES,
    "sectors": [
        {"id": "s-1", "name": "Sector 1 — Complutense norte",
         "polygon": {"type": "Polygon", "coordinates": [[[-3.7400, 40.4470], [-3.7150, 40.4470],
                                                         [-3.7150, 40.4600], [-3.7400, 40.4600],
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
    "patrols": PATROLS,
    "fire": {
        "perimeter": {"type": "Polygon", "coordinates": [FIRE_PERIMETRO]},
        "wind": {"direction_deg": 350, "speed_kmh": 28, "gusts_kmh": 44},
        "spread_rate_mh": 900,
        "head_bearing_deg": 170,
        "cone_half_angle_deg": 30,
        "updated_at": "2026-09-20T00:00:00Z",
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
print(f"{OUT}")
print(f"  casas={len(houses)} personas={len(people)}")
print(f"  equipo   p-001..p-{len(EQUIPO):03d}  círculo {CIRCULO_EQUIPO_M:.0f} m")
print(f"  grupo    p-{GRUPO_PRIMERO:03d}..p-{GRUPO_ULTIMO:03d}  círculo {CIRCULO_GRUPO_M:.0f} m")
print(f"  separación entre centros: {separacion:.0f} m · punto más cercano del grupo: {min_sep:.0f} m")
