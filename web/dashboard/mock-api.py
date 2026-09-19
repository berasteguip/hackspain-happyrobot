#!/usr/bin/env python3
"""Mock de `api/` para desarrollar y ENSAYAR el dashboard sin backend.

Sirve los endpoints de lectura del contrato (`docs/contrato-de-datos.md` §3) con datos
sintéticos conformes, y acepta las dos escrituras del dashboard:
`POST /human/override` y `POST /human/approve`.

No inventa campos: todo lo que sale de aquí está en el contrato.

Además de mock, sirve de guion de ensayo: a los pocos segundos de arrancar **gira el viento**
y se produce la cascada de decisiones (fuego → salida amenazada → carretera cortada →
rutas recalculadas → convoy roto → prioridad aérea → casas reordenadas). Es el paso 3 de la
demo, que es justo lo que hay que poder enseñar en el timeline.

Uso:
    python3 mock-api.py [puerto]        # por defecto 8000
    MOCK_API_KEY=cambiame python3 mock-api.py

Hora del escenario: arranca en 2026-09-19T17:30:00Z y avanza en tiempo real.
"""
from __future__ import annotations

import json
import os
import sys
import threading
import time
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

API_KEY = os.environ.get("MOCK_API_KEY", "cambiame")
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8000

T0 = datetime(2026, 9, 19, 17, 30, 0, tzinfo=timezone.utc)
BOOT = time.time()
LOCK = threading.RLock()


def iso(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


def scenario_now() -> str:
    """Hora del escenario = T0 + segundos reales desde el arranque."""
    return iso(T0 + timedelta(seconds=time.time() - BOOT))


# ---------------------------------------------------------------------------------------
# Estado sintético
# ---------------------------------------------------------------------------------------

STATE: dict = {
    "state_version": 1,
    "scenario": "sierra-culebra",
    "people": {},
    "houses": {},
    "fire": None,
    "safe_zones": {},
    "road_closures": {},
    "sectors": {},
    "convoys": {},
    "patrols": {},
}
VERSIONS: dict[tuple[str, str], int] = {}   # (colección, id) -> versión en la que cambió
JOURNAL: list[tuple[int, dict]] = []        # (versión, DecisionLogEntry)
PENDING: dict[str, dict] = {}               # decision_id -> PendingApproval
EV = {"n": 0}


def ev_id() -> str:
    EV["n"] += 1
    return f"ev-{EV['n']:06d}"


def bump(coll: str, ident: str) -> None:
    STATE["state_version"] += 1
    VERSIONS[(coll, ident)] = STATE["state_version"]


def decide(
    type_: str,
    subject_type: str,
    subject_id: str | None,
    reason: str,
    before: dict | None = None,
    after: dict | None = None,
    actor: str = "system",
    trigger: str | None = None,
    notified: list | None = None,
) -> dict:
    STATE["state_version"] += 1
    entry = {
        "id": ev_id(),
        "t": scenario_now(),
        "type": type_,
        "subject_type": subject_type,
        "subject_id": subject_id,
        "before": before or {},
        "after": after or {},
        "reason": reason,
        "trigger_event_id": trigger,
        "actor": actor,
        "approved_by": None,
        "notified": notified or [],
    }
    JOURNAL.append((STATE["state_version"], entry))
    return entry


def person(
    pid, name, phone, lat, lon, source, status, mobility, household, sector,
    exit_id=None, minutes=None, score=None, breakdown=None, convoy=None, role=None,
    traj=None, route=None, instruction=None, notes=None, smartphone=True, attempts=1,
):
    return {
        "id": pid, "house_id": pid.replace("p-", "h-"), "name": name, "phone": phone,
        "lat": lat, "lon": lon,
        "position_source": source,
        "position_updated_at": scenario_now(),
        "trajectory": traj or [],
        "heading_deg": None, "speed_kmh": None,
        "household_size": household, "mobility": mobility,
        "has_smartphone": smartphone,
        "status": status, "sector_id": sector,
        "assigned_exit_id": exit_id,
        "assigned_route": route,
        "convoy_id": convoy, "convoy_role": role,
        "minutes_to_front": minutes,
        "priority_score": score,
        "score_breakdown": breakdown,
        "last_instruction": (
            {"text": instruction, "sent_at": scenario_now(), "channel": "sms"} if instruction else None
        ),
        "consent_position": source == "gps",
        "call_attempts": attempts,
        "notes": notes,
    }


def breakdown_of(urgency, mobility, uncertainty, household, drift):
    """Aportaciones ya pesadas (contrato §4: el breakdown es factor → aportación)."""
    return {
        "urgency": urgency, "mobility": mobility, "uncertainty": uncertainty,
        "household_size": household, "trajectory_drift": drift,
    }


def route(points, distance_m, duration_s):
    return {
        "polyline": None, "points": points, "distance_m": distance_m,
        "duration_s": duration_s, "updated_at": scenario_now(), "source": "osrm",
    }


def build_initial() -> None:
    fire_now = {
        "type": "Polygon",
        "coordinates": [[
            [-6.070, 41.790], [-6.030, 41.786], [-6.012, 41.804],
            [-6.028, 41.822], [-6.062, 41.816], [-6.070, 41.790],
        ]],
    }
    fire_old = {
        "type": "Polygon",
        "coordinates": [[
            [-6.062, 41.795], [-6.036, 41.793], [-6.026, 41.806],
            [-6.038, 41.816], [-6.058, 41.812], [-6.062, 41.795],
        ]],
    }
    STATE["fire"] = {
        "perimeter": fire_now,
        "wind": {"direction_deg": 225, "speed_kmh": 34, "gusts_kmh": 52},
        "spread_rate_mh": 1800,
        "head_bearing_deg": 45,
        "cone_half_angle_deg": 30,
        "updated_at": scenario_now(),
        "history": [{"t": iso(T0 - timedelta(minutes=20)), "perimeter": fire_old}],
    }
    VERSIONS[("fire", "fire")] = 1

    zones = [
        {"id": "x-a", "name": "Tábara (CRA León Felipe)", "lat": 41.8712, "lon": -5.9531,
         "capacity": 400, "occupancy": 86, "status": "open",
         "access_roads": ["ZA-P-2434"], "distance_to_fire_m": 9200},
        {"id": "x-b", "name": "Pabellón de Ferreras", "lat": 41.8550, "lon": -6.0900,
         "capacity": 150, "occupancy": 131, "status": "filling",
         "access_roads": ["ZA-P-1512"], "distance_to_fire_m": 6100},
        {"id": "x-c", "name": "Campo de fútbol de Losacio", "lat": 41.8330, "lon": -6.0480,
         "capacity": 80, "occupancy": 12, "status": "open",
         "access_roads": ["camino de Losacio"], "distance_to_fire_m": 3400},
    ]
    for z in zones:
        STATE["safe_zones"][z["id"]] = z
        VERSIONS[("safe_zones", z["id"])] = 1

    sectors = [
        {"id": "s-1", "name": "Sector 1 — Losacio sur",
         "polygon": {"type": "Polygon", "coordinates": [[
             [-6.045, 41.812], [-6.010, 41.812], [-6.010, 41.830], [-6.045, 41.830], [-6.045, 41.812]]]},
         "people_inside": 4, "people_unknown": 2, "vulnerable_inside": 1,
         "minutes_to_front": 14.0, "air_priority_rank": 1,
         "air_priority_reason": "4 personas dentro (2 sin localizar), 1 vulnerable, frente a 14 min"},
        {"id": "s-2", "name": "Sector 2 — Losacio norte",
         "polygon": {"type": "Polygon", "coordinates": [[
             [-6.045, 41.830], [-6.010, 41.830], [-6.010, 41.848], [-6.045, 41.848], [-6.045, 41.830]]]},
         "people_inside": 3, "people_unknown": 1, "vulnerable_inside": 1,
         "minutes_to_front": 27.0, "air_priority_rank": 2,
         "air_priority_reason": "3 personas dentro, 1 vulnerable, frente a 27 min"},
        {"id": "s-3", "name": "Sector 3 — Ferreras de Abajo",
         "polygon": {"type": "Polygon", "coordinates": [[
             [-6.085, 41.826], [-6.050, 41.826], [-6.050, 41.845], [-6.085, 41.845], [-6.085, 41.826]]]},
         "people_inside": 2, "people_unknown": 0, "vulnerable_inside": 0,
         "minutes_to_front": 41.0, "air_priority_rank": 3,
         "air_priority_reason": "2 personas dentro, frente a 41 min"},
    ]
    for s in sectors:
        STATE["sectors"][s["id"]] = s
        VERSIONS[("sectors", s["id"])] = 1

    people = [
        person("p-001", "Antonio Prieto", "+34600990012", 41.8265, -6.0290, "gps", "moving",
               "car", 3, "s-1", "x-a", 21.5, 0.61,
               breakdown_of(0.021, 0.0, 0.0, 0.05, 0.10),
               convoy="c-1", role="leader",
               traj=[{"lat": 41.8228, "lon": -6.0321, "t": iso(T0 - timedelta(minutes=3))},
                     {"lat": 41.8247, "lon": -6.0305, "t": iso(T0 - timedelta(minutes=2))}],
               route=route([[41.8265, -6.0290], [41.8400, -6.0100], [41.8560, -5.9880], [41.8712, -5.9531]], 7400, 640),
               instruction="Salga por la ZA-P-2434 hacia Tábara. No coja la N-631.",
               notes="Tiene sitio para 2 vecinos más."),
        person("p-002", "Rosa Vaquero", "+34600990031", 41.8241, -6.0246, "declared", "contacted",
               "reduced", 2, "s-1", "x-a", 16.0, 0.74,
               breakdown_of(0.028, 0.12, 0.15, 0.033, 0.0),
               convoy="c-1", role="member",
               instruction="Antonio pasa a buscarte en un Seat León blanco. Sal a la puerta.",
               smartphone=False, attempts=2,
               notes="Posición declarada por teléfono: no hay GPS."),
        person("p-003", "Miguel Ferreras", "+34600990044", 41.8205, -6.0180, "gps", "at_risk",
               "car", 1, "s-1", "x-a", 7.5, 0.93,
               breakdown_of(0.060, 0.0, 0.0, 0.017, 0.10),
               traj=[{"lat": 41.8180, "lon": -6.0250, "t": iso(T0 - timedelta(minutes=4))},
                     {"lat": 41.8192, "lon": -6.0215, "t": iso(T0 - timedelta(minutes=2))}],
               route=route([[41.8205, -6.0180], [41.8300, -6.0120], [41.8480, -5.9900], [41.8712, -5.9531]], 9100, 780),
               instruction="Miguel, estás entrando en el cono del fuego. Da la vuelta AHORA.",
               notes="Iba hacia el frente: llamada inmediata."),
        person("p-004", "Carmen Losa", "+34600990058", 41.8352, -6.0355, "declared", "no_answer",
               "immobile", 1, "s-2", None, 29.0, 0.81,
               breakdown_of(0.016, 0.20, 0.15, 0.017, 0.0),
               smartphone=False, attempts=2,
               notes="Teleasistencia. No sale sin que alguien la lleve."),
        person("p-005", "Javier Tábara", "+34600990061", 41.8389, -6.0210, "gps", "moving",
               "car", 4, "s-2", "x-a", 33.0, 0.42,
               breakdown_of(0.014, 0.0, 0.0, 0.067, 0.0),
               convoy="c-1", role="member",
               traj=[{"lat": 41.8360, "lon": -6.0255, "t": iso(T0 - timedelta(minutes=2))}],
               route=route([[41.8389, -6.0210], [41.8520, -5.9980], [41.8712, -5.9531]], 6200, 520),
               instruction="Sigue al Seat León blanco de Antonio."),
        person("p-006", "Nieves Riofrío", "+34600990072", 41.8415, -6.0401, "gps", "refusing",
               "car", 2, "s-2", "x-b", 25.0, 0.55,
               breakdown_of(0.018, 0.0, 0.0, 0.033, 0.0),
               instruction="Nieves, el fuego va hacia tu casa. Te llamamos otra vez en 3 minutos.",
               notes="Se niega a salir: no quiere dejar los animales."),
        person("p-007", "Pablo Sarracín", "+34600990085", 41.8602, -6.0712, "gps", "safe",
               "car", 3, "s-3", "x-b", None, 0.08,
               breakdown_of(0.0, 0.0, 0.0, 0.05, 0.0),
               traj=[{"lat": 41.8480, "lon": -6.0650, "t": iso(T0 - timedelta(minutes=6))},
                     {"lat": 41.8550, "lon": -6.0690, "t": iso(T0 - timedelta(minutes=3))}],
               instruction="Ya estás en el pabellón. Quédate ahí."),
        person("p-008", "Luisa Manzanal", "+34600990097", 41.8318, -6.0142, "inferred", "unknown",
               "walking", 1, "s-1", None, 11.0, 0.88,
               breakdown_of(0.041, 0.06, 0.15, 0.017, 0.05),
               attempts=2,
               notes="Última posición conocida + rumbo. No contesta al móvil."),
    ]
    for p in people:
        STATE["people"][p["id"]] = p
        VERSIONS[("people", p["id"])] = 1

    houses = [
        {"id": "h-012", "address": "Calle Mayor 4, Losacio", "village": "Losacio",
         "lat": 41.8262, "lon": -6.0208, "phone": "+34600990012",
         "residents_expected": 3, "vulnerable": True, "vulnerability_reason": "teleasistencia",
         "sector_id": "s-1", "call_attempts": 2, "last_call_at": scenario_now(), "answered": False,
         "status": "no_answer", "minutes_to_front": 13.0, "assigned_patrol_id": "pt-1",
         "patrol_eta_min": 9.0, "priority_rank": 1},
        {"id": "h-031", "address": "Camino de la Fuente 7, Losacio", "village": "Losacio",
         "lat": 41.8296, "lon": -6.0165, "phone": "+34600990031",
         "residents_expected": 2, "vulnerable": False, "vulnerability_reason": None,
         "sector_id": "s-1", "call_attempts": 2, "last_call_at": scenario_now(), "answered": False,
         "status": "no_answer", "minutes_to_front": 15.0, "assigned_patrol_id": "pt-1",
         "patrol_eta_min": 12.0, "priority_rank": 2},
        {"id": "h-044", "address": "Carretera de Tábara 21, Losacio", "village": "Losacio",
         "lat": 41.8215, "lon": -6.0122, "phone": "+34600990044",
         "residents_expected": 1, "vulnerable": True, "vulnerability_reason": "mayor de 80 años sola",
         "sector_id": "s-1", "call_attempts": 2, "last_call_at": scenario_now(), "answered": False,
         "status": "no_answer", "minutes_to_front": 8.0, "assigned_patrol_id": "pt-1",
         "patrol_eta_min": 17.0, "priority_rank": 4},
        {"id": "h-058", "address": "Calle Iglesia 2, Losacio", "village": "Losacio",
         "lat": 41.8358, "lon": -6.0349, "phone": "+34600990058",
         "residents_expected": 1, "vulnerable": True, "vulnerability_reason": "encamada",
         "sector_id": "s-2", "call_attempts": 2, "last_call_at": scenario_now(), "answered": False,
         "status": "no_answer", "minutes_to_front": 28.0, "assigned_patrol_id": None,
         "patrol_eta_min": 14.0, "priority_rank": 3},
        {"id": "h-072", "address": "Calle Larga 15, Ferreras de Abajo", "village": "Ferreras de Abajo",
         "lat": 41.8430, "lon": -6.0620, "phone": "+34600990072",
         "residents_expected": 2, "vulnerable": False, "vulnerability_reason": None,
         "sector_id": "s-3", "call_attempts": 1, "last_call_at": scenario_now(), "answered": True,
         "status": "answered", "minutes_to_front": 40.0, "assigned_patrol_id": None,
         "patrol_eta_min": None, "priority_rank": None},
    ]
    for h in houses:
        STATE["houses"][h["id"]] = h
        VERSIONS[("houses", h["id"])] = 1

    STATE["convoys"]["c-1"] = {
        "id": "c-1", "exit_id": "x-a", "leader_person_id": "p-001",
        "member_ids": ["p-001", "p-002", "p-005"],
        "vehicle_description": "Seat León blanco",
        "route": route([[41.8265, -6.0290], [41.8400, -6.0100], [41.8560, -5.9880], [41.8712, -5.9531]], 7400, 640),
        "status": "moving", "formed_at": iso(T0 - timedelta(minutes=5)), "cohesion_ok": True,
    }
    VERSIONS[("convoys", "c-1")] = 1

    STATE["patrols"]["pt-1"] = {
        "id": "pt-1", "name": "Guardia Civil Tábara 2", "lat": 41.8501, "lon": -5.9902,
        "assigned_house_ids": ["h-012", "h-031"], "status": "en_route", "channel": "+34600990900",
    }
    VERSIONS[("patrols", "pt-1")] = 1

    # Historia previa: el timeline no arranca vacío (y el jurado ve de dónde viene todo).
    decide("fire_updated", "fire", "fire",
           "Perímetro actualizado desde el motor de escenario. Cabeza a 45°, 1.800 m/h.",
           before={"spread_rate_mh": 1500}, after={"spread_rate_mh": 1800, "head_bearing_deg": 45})
    decide("call_placed", "person", "p-004",
           "Segundo intento sin respuesta: la casa pasa a la lista de la patrulla.",
           after={"answered": False, "run_id": "run_mock_004"})
    decide("house_escalated_to_patrol", "house", "h-012",
           "13 min hasta el frente, patrulla a 9 min: 4 min de margen · vulnerable (teleasistencia).",
           before={"status": "no_answer", "assigned_patrol_id": None},
           after={"status": "no_answer", "assigned_patrol_id": "pt-1", "priority_rank": 1})
    decide("convoy_formed", "convoy", "c-1",
           "3 coches en el mismo camino hacia x-a. Guía: Antonio Prieto (Seat León blanco).",
           after={"member_ids": ["p-001", "p-002", "p-005"], "leader_person_id": "p-001"})
    decide("person_status_changed", "person", "p-003",
           "Su trayectoria entró en el cono de avance del fuego: pasa a en riesgo y se le llama en el acto.",
           before={"status": "moving"}, after={"status": "at_risk"},
           notified=[{"person_id": "p-003", "channel": "call", "at": scenario_now()}])
    decide("person_status_changed", "person", "p-006",
           "Se niega a salir (animales). Se reintenta con el guion de negativa en 3 min.",
           before={"status": "contacted"}, after={"status": "refusing"}, actor="agent")


# ---------------------------------------------------------------------------------------
# Guion de ensayo: el viento gira y se ve la cascada
# ---------------------------------------------------------------------------------------

def wind_turn() -> None:
    """El evento más brutal del motor: gira el viento y se recalcula medio plan."""
    fire = STATE["fire"]
    fire["history"] = (fire.get("history") or []) + [
        {"t": fire["updated_at"], "perimeter": fire["perimeter"]}
    ]
    fire["perimeter"] = {
        "type": "Polygon",
        "coordinates": [[
            [-6.072, 41.788], [-6.028, 41.784], [-6.002, 41.808],
            [-6.014, 41.830], [-6.058, 41.822], [-6.072, 41.788],
        ]],
    }
    fire["wind"] = {"direction_deg": 200, "speed_kmh": 46, "gusts_kmh": 68}
    fire["head_bearing_deg"] = 20
    fire["spread_rate_mh"] = 2400
    fire["updated_at"] = scenario_now()
    bump("fire", "fire")
    root = decide(
        "fire_updated", "fire", "fire",
        "GIRO DE VIENTO: de 225° a 200° con rachas de 68 km/h. La cabeza pasa de 45° a 20° "
        "y el avance de 1.800 a 2.400 m/h: el frente apunta ahora a Losacio norte.",
        before={"head_bearing_deg": 45, "spread_rate_mh": 1800, "wind": {"direction_deg": 225, "speed_kmh": 34}},
        after={"head_bearing_deg": 20, "spread_rate_mh": 2400, "wind": {"direction_deg": 200, "speed_kmh": 46}},
    )
    rid = root["id"]

    z = STATE["safe_zones"]["x-c"]
    z["status"], z["distance_to_fire_m"] = "threatened", 2100
    bump("safe_zones", "x-c")
    decide("exit_reassigned", "safe_zone", "x-c",
           "El cono de avance apunta al campo de fútbol de Losacio y el frente está a 2,1 km: "
           "la salida queda amenazada y se vacía de rutas.",
           before={"status": "open", "distance_to_fire_m": 3400},
           after={"status": "threatened", "distance_to_fire_m": 2100}, trigger=rid)

    rc = {"id": "rc-2", "road_name": "N-631",
          "geometry": {"type": "LineString",
                       "coordinates": [[-6.040, 41.808], [-6.022, 41.822], [-6.008, 41.838]]},
          "reason": "humo, visibilidad nula", "since": scenario_now(), "source": "guardia_civil"}
    STATE["road_closures"]["rc-2"] = rc
    bump("road_closures", "rc-2")
    decide("road_closed", "road_closure", "rc-2",
           "La Guardia Civil corta la N-631 por humo y visibilidad nula. Toda ruta que la usaba deja de valer.",
           after={"road_name": "N-631", "reason": "humo, visibilidad nula"}, trigger=rid)

    # Rutas: solo se recalculan (y se avisa) a quien le cambia la instrucción.
    p1 = STATE["people"]["p-001"]
    p1["assigned_route"] = route(
        [[41.8265, -6.0290], [41.8330, -6.0400], [41.8520, -6.0180], [41.8712, -5.9531]], 9800, 880)
    p1["last_instruction"] = {
        "text": "Antonio, no cojas la N-631: está cortada. Sigue por el camino de Riofrío y luego a Tábara.",
        "sent_at": scenario_now(), "channel": "call"}
    bump("people", "p-001")
    decide("route_recalculated", "person", "p-001",
           "La N-631 entró en el cono y está cortada: ruta desviada por el camino de Riofrío "
           "(+2,4 km, +4 min). Se llama al guía porque arrastra a 2 coches más.",
           before={"distance_m": 7400, "duration_s": 640},
           after={"distance_m": 9800, "duration_s": 880}, trigger=rid,
           notified=[{"person_id": "p-001", "channel": "call", "at": scenario_now()}])

    p5 = STATE["people"]["p-005"]
    p5["assigned_exit_id"] = "x-b"
    p5["minutes_to_front"] = 19.0
    p5["priority_score"] = 0.58
    p5["score_breakdown"] = breakdown_of(0.024, 0.0, 0.0, 0.067, 0.05)
    bump("people", "p-005")
    decide("exit_reassigned", "person", "p-005",
           "Con la cabeza a 20° su salida quedaba al otro lado del frente: se le manda a x-b "
           "(Pabellón de Ferreras), 6 min más pero fuera del cono.",
           before={"assigned_exit_id": "x-a", "minutes_to_front": 33.0},
           after={"assigned_exit_id": "x-b", "minutes_to_front": 19.0}, trigger=rid,
           notified=[{"person_id": "p-005", "channel": "sms", "at": scenario_now()}])

    c = STATE["convoys"]["c-1"]
    c["status"], c["cohesion_ok"] = "broken", False
    c["member_ids"] = ["p-001", "p-002"]
    bump("convoys", "c-1")
    decide("convoy_broken", "convoy", "c-1",
           "Javier sale del convoy al cambiarle la salida: el convoy queda en 2 coches y se "
           "recalcula la cohesión. El guía sigue siendo Antonio.",
           before={"member_ids": ["p-001", "p-002", "p-005"], "cohesion_ok": True},
           after={"member_ids": ["p-001", "p-002"], "cohesion_ok": False}, trigger=rid)

    s1, s2 = STATE["sectors"]["s-1"], STATE["sectors"]["s-2"]
    s2["air_priority_rank"], s2["minutes_to_front"] = 1, 12.0
    s2["air_priority_reason"] = ("El frente gira hacia el norte: 3 personas dentro (1 sin localizar), "
                                "1 vulnerable inmóvil, frente a 12 min. Descarga aquí primero.")
    s1["air_priority_rank"], s1["minutes_to_front"] = 2, 18.0
    s1["air_priority_reason"] = "4 personas dentro, frente a 18 min: deja de ser el sector más urgente"
    bump("sectors", "s-2")
    bump("sectors", "s-1")
    decide("air_priority_changed", "sector", "s-2",
           "Cambia la prioridad de descarga aérea: s-2 pasa a 1 (12 min al frente, 1 vulnerable "
           "inmóvil dentro) y s-1 baja a 2. Enviado al puesto de mando.",
           before={"air_priority_rank": 2}, after={"air_priority_rank": 1}, trigger=rid)

    h44 = STATE["houses"]["h-044"]
    h44["minutes_to_front"], h44["priority_rank"] = 5.0, 5
    bump("houses", "h-044")
    decide("house_escalated_to_patrol", "house", "h-044",
           "5 min hasta el frente y la patrulla a 17: el fuego llega 12 min ANTES. "
           "Baja en la lista porque mandar allí a la patrulla es matarla; requiere aprobación humana.",
           before={"minutes_to_front": 8.0, "priority_rank": 4},
           after={"minutes_to_front": 5.0, "priority_rank": 5}, trigger=rid)

    # Aprobación pendiente (contrato §2.6: approval_requested)
    ap = decide("approval_requested", "house", "h-044",
                "Mandar a la patrulla pt-1 a h-044 (mayor de 80 años sola) sabiendo que el frente "
                "llega 12 min antes que ella. Decisión que compromete a terceros: la firma una persona.",
                after={"title": "Mandar patrulla a h-044 con margen negativo",
                       "action": "patrol_assigned",
                       "expires_at": iso(T0 + timedelta(seconds=time.time() - BOOT + 240))},
                trigger=rid)
    PENDING[ap["id"]] = {
        "decision_id": ap["id"], "action": "patrol_assigned",
        "payload": {"house_id": "h-044", "patrol_id": "pt-1", "margin_min": -12.0},
        "reason": ap["reason"], "requested_at": ap["t"],
        "expires_at": ap["after"]["expires_at"],
    }


def heartbeat(n: int) -> None:
    """Movimiento de fondo: la pantalla nunca está congelada."""
    for pid, dlat, dlon in (("p-001", 0.0016, 0.0020), ("p-005", 0.0012, 0.0016), ("p-003", -0.0010, -0.0008)):
        p = STATE["people"].get(pid)
        if not p or p.get("status") == "safe":
            continue
        p["trajectory"] = (p.get("trajectory") or [])[-8:] + [
            {"lat": p["lat"], "lon": p["lon"], "t": scenario_now()}]
        p["lat"] = round(p["lat"] + dlat, 6)
        p["lon"] = round(p["lon"] + dlon, 6)
        p["position_updated_at"] = scenario_now()
        bump("people", pid)
    if n % 3 == 0:
        decide("call_placed", "person", "p-008",
               "Tercer intento a Luisa Manzanal (posición inferida). Si no contesta, sube a la lista de patrulla.",
               after={"run_id": f"run_mock_{n:03d}", "answered": False}, actor="agent")


def script_thread() -> None:
    n = 0
    turned = False
    while True:
        time.sleep(5)
        n += 1
        with LOCK:
            STATE["t"] = scenario_now()
            if not turned and n >= 3:          # ~15 s desde el arranque
                turned = True
                wind_turn()
                print("[mock-api] 🌬  giro de viento aplicado (cascada de decisiones)")
            else:
                heartbeat(n)


# ---------------------------------------------------------------------------------------
# Serialización
# ---------------------------------------------------------------------------------------

def snapshot() -> dict:
    return {
        "state_version": STATE["state_version"],
        "t": scenario_now(),
        "scenario": STATE["scenario"],
        "people": list(STATE["people"].values()),
        "houses": list(STATE["houses"].values()),
        "fire": STATE["fire"],
        "safe_zones": list(STATE["safe_zones"].values()),
        "road_closures": list(STATE["road_closures"].values()),
        "sectors": list(STATE["sectors"].values()),
        "convoys": list(STATE["convoys"].values()),
        "patrols": list(STATE["patrols"].values()),
        "pending_approvals": list(PENDING.values()),
    }


def diff(since: int) -> dict:
    out = {
        "state_version": STATE["state_version"],
        "since_version": since,
        "t": scenario_now(),
        "fire": STATE["fire"] if VERSIONS.get(("fire", "fire"), 0) > since else None,
        "decision_log": [e for v, e in JOURNAL if v > since],
        "removed": [],
        "pending_approvals": list(PENDING.values()),
    }
    for coll in ("people", "houses", "safe_zones", "road_closures", "sectors", "convoys", "patrols"):
        out[coll] = [
            item for ident, item in STATE[coll].items()
            if VERSIONS.get((coll, ident), 0) > since
        ]
    return out


def queue() -> list:
    """`/queue`: personas por priority_score desc, cada una con su score_breakdown y motivo."""
    ETIQ = {"urgency": "minutos hasta el frente", "mobility": "movilidad",
            "uncertainty": "incertidumbre", "household_size": "personas en casa",
            "trajectory_drift": "va hacia el fuego"}
    items = []
    for p in STATE["people"].values():
        if p.get("status") == "safe" or p.get("priority_score") is None:
            continue
        bd = p.get("score_breakdown") or {}
        top = sorted(bd.items(), key=lambda kv: kv[1], reverse=True)[:2]
        partes = ", ".join(f"{ETIQ.get(k, k)} (+{v:.2f})" for k, v in top if v > 0)
        minutos = (f"{p['minutes_to_front']:.0f} min hasta el frente"
                   if p.get("minutes_to_front") is not None else "sin estimación de frente")
        extra = (" · dato incierto: la ignorancia sube la prioridad"
                 if p.get("status") in ("unknown", "no_answer") or p.get("position_source") == "declared" else "")
        items.append({
            "person_id": p["id"], "name": p.get("name"),
            "priority_score": p["priority_score"], "score_breakdown": bd,
            "minutes_to_front": p.get("minutes_to_front"), "status": p.get("status"),
            "reason": f"{minutos}; pesa sobre todo {partes or 'sin factores dominantes'}{extra}",
        })
    items.sort(key=lambda it: it["priority_score"], reverse=True)
    return items


def no_answer() -> list:
    out = []
    for h in STATE["houses"].values():
        if h.get("status") != "no_answer":
            continue
        m, eta = h.get("minutes_to_front"), h.get("patrol_eta_min")
        margin = None if (m is None or eta is None) else round(m - eta, 1)
        if margin is None:
            reason = f"frente sin estimar, patrulla {'a %.0f min' % eta if eta is not None else 'sin asignar'}"
        elif margin < 0:
            reason = (f"{m:.0f} min hasta el frente, patrulla a {eta:.0f} min: el fuego llega "
                      f"{abs(margin):.0f} min ANTES que la patrulla — no se manda sin aprobación humana")
        else:
            reason = f"{m:.0f} min hasta el frente, patrulla a {eta:.0f} min: {margin:.0f} min de margen"
        if h.get("vulnerable"):
            reason += f" · vulnerable ({h.get('vulnerability_reason')})"
        out.append({**h, "house_id": h["id"], "margin_min": margin, "reason": reason})
    out.sort(key=lambda it: (it["margin_min"] is not None and it["margin_min"] < 0,
                            it["priority_rank"] if it.get("priority_rank") is not None else 99))
    return out


def air_priority() -> list:
    ss = sorted(STATE["sectors"].values(), key=lambda s: s.get("air_priority_rank") or 99)
    return [{**s, "sector_id": s["id"], "reason": s.get("air_priority_reason")} for s in ss]


# ---------------------------------------------------------------------------------------
# HTTP
# ---------------------------------------------------------------------------------------

class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):   # menos ruido: solo lo interesante
        if "diff" not in str(args):
            print("[mock-api] " + fmt % args)

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "content-type,x-api-key")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")

    def _json(self, code: int, body):
        payload = json.dumps(body, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self._cors()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def _auth(self) -> bool:
        if self.headers.get("x-api-key") == API_KEY:
            return True
        self._json(401, {"ok": False, "error": "unauthorized"})
        return False

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self):
        url = urlparse(self.path)
        path, qs = url.path.rstrip("/") or "/", parse_qs(url.query)

        if path == "/health":
            self._json(200, {"ok": True, "state_version": STATE["state_version"],
                             "people_count": len(STATE["people"]),
                             "uptime_s": int(time.time() - BOOT)})
            return
        if not self._auth():
            return

        if path == "/state":
            with LOCK:
                self._json(200, snapshot())
        elif path == "/state/diff":
            since = int((qs.get("since_version") or ["0"])[0])
            # Long-poll corto: hasta 10 s esperando que suba la versión.
            deadline = time.time() + 10
            while time.time() < deadline:
                with LOCK:
                    if STATE["state_version"] > since:
                        self._json(200, diff(since))
                        return
                time.sleep(0.3)
            with LOCK:
                self._json(200, diff(since))
        elif path == "/queue":
            with LOCK:
                self._json(200, queue())
        elif path == "/houses/no-answer":
            with LOCK:
                self._json(200, no_answer())
        elif path == "/sectors/air-priority":
            with LOCK:
                self._json(200, air_priority())
        elif path.startswith("/people/"):
            pid = path.rsplit("/", 1)[-1]
            with LOCK:
                p = STATE["people"].get(pid)
            self._json(200 if p else 404, p or {"ok": False, "error": "not_found"})
        else:
            self._json(404, {"ok": False, "error": "not_found", "path": path})

    def do_POST(self):
        path = urlparse(self.path).path.rstrip("/") or "/"
        if not self._auth():
            return
        length = int(self.headers.get("Content-Length", 0))
        try:
            body = json.loads(self.rfile.read(length) or b"{}")
        except ValueError:
            self._json(400, {"ok": False, "error": "invalid_json"})
            return

        with LOCK:
            if path == "/human/override":
                print("[mock-api] POST /human/override ->", json.dumps(body, ensure_ascii=False))
                st, sid = body.get("subject_type"), body.get("subject_id")
                field, value = body.get("field"), body.get("value")
                coll = {"person": "people", "house": "houses", "sector": "sectors",
                        "convoy": "convoys", "safe_zone": "safe_zones", "patrol": "patrols"}.get(st)
                before = {}
                if coll and sid in STATE.get(coll, {}):
                    before = {field: STATE[coll][sid].get(field)}
                    STATE[coll][sid][field] = value
                    bump(coll, sid)
                d = decide("human_override", st or "system", sid,
                           f"{body.get('reason') or 'sin motivo'} — anulado a mano por "
                           f"{body.get('operator') or 'operador'} ({field} = {value}).",
                           before=before, after={field: value}, actor="human")
                d["approved_by"] = body.get("operator")
                self._json(200, {"ok": True, "state_version": STATE["state_version"], "decisions": [d]})

            elif path == "/human/approve":
                print("[mock-api] POST /human/approve ->", json.dumps(body, ensure_ascii=False))
                did, ok = body.get("decision_id"), bool(body.get("approved"))
                pend = PENDING.pop(did, None)
                STATE["state_version"] += 1
                d = decide("approval_granted" if ok else "plan_discarded",
                           (pend or {}).get("action") and "house" or "system",
                           (pend or {}).get("payload", {}).get("house_id"),
                           f"{'Aprobado' if ok else 'Rechazado'} por {body.get('operator') or 'operador'}: "
                           f"{body.get('reason') or 'sin motivo'}",
                           before={"decision_id": did, "state": "pending"},
                           after={"decision_id": did, "state": "approved" if ok else "rejected"},
                           actor="human", trigger=did)
                d["approved_by"] = body.get("operator")
                self._json(200, {"ok": True, "state_version": STATE["state_version"], "decisions": [d]})

            elif path == "/reset":
                STATE["state_version"] = 1
                for coll in ("people", "houses", "safe_zones", "road_closures", "sectors", "convoys", "patrols"):
                    STATE[coll].clear()
                VERSIONS.clear(); JOURNAL.clear(); PENDING.clear(); EV["n"] = 0
                build_initial()
                self._json(200, {"ok": True, "state_version": STATE["state_version"], "decisions": []})
            else:
                self._json(404, {"ok": False, "error": "not_found", "path": path})


def main() -> None:
    with LOCK:
        build_initial()
        STATE["t"] = scenario_now()
    threading.Thread(target=script_thread, daemon=True).start()
    print(f"[mock-api] DATOS SINTÉTICOS en http://localhost:{PORT} (x-api-key: {API_KEY})")
    print("[mock-api] a los ~15 s gira el viento y se ve la cascada de decisiones")
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()


if __name__ == "__main__":
    main()
