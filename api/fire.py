"""Modelo de avance del fuego: `minutes_to_front` y el cono de avance.

La tesis del proyecto vive en este fichero (contrato §4):

    la tasa de avance efectiva decae con el ángulo respecto a `head_bearing_deg`
    — cabeza 100%, flancos ~35%, cola ~10% —

y por eso **alguien a 3 km a favor del viento está peor que alguien a 800 m en contra**.
Si esto se rompe, se rompe la cola de prioridad y el pitch.
"""

from __future__ import annotations

import math
from typing import Any

from geo import (
    angle_diff_deg,
    bearing_deg,
    destination_point,
    haversine_m,
    nearest_point_on_ring,
    point_in_cone,
    point_in_polygon,
    polygon_extreme_point,
)
from models import Fire

# Anclas del contrato.
HEAD_FACTOR = 1.00
FLANK_FACTOR = 0.35  # a 90°
TAIL_FACTOR = 0.10  # a 180°

# La curva EXACTA del contrato §4 (coseno de dos armónicos que pasa por los tres puntos):
#   factor(θ) = 0.45 + 0.45·cos θ + 0.10·cos 2θ
# θ=0 → 1.00 · θ=90° → 0.35 · θ=180° → 0.10, y monótona decreciente en [0°, 180°].
# Simplificación deliberada frente a la elipse de Huygens de FARSITE: ensancha el flanco (35% en vez
# del 6–19% real), o sea avisa a MÁS gente de la necesaria. Derivación: docs/03-dominio-crisis/06-modelo-fuego.md.
DECAY_A0, DECAY_A1, DECAY_A2 = 0.45, 0.45, 0.10

# Techo para no devolver infinitos al dashboard (12 h = "no es su problema ahora").
MAX_MINUTES = 720.0


def _latlon(subject: Any) -> tuple[float, float] | None:
    """Acepta Person, House, dict o tupla (lat, lon)."""
    if subject is None:
        return None
    if isinstance(subject, (tuple, list)) and len(subject) >= 2:
        return float(subject[0]), float(subject[1])
    lat = getattr(subject, "lat", None) if not isinstance(subject, dict) else subject.get("lat")
    lon = getattr(subject, "lon", None) if not isinstance(subject, dict) else subject.get("lon")
    if lat is None or lon is None:
        return None
    return float(lat), float(lon)


def angular_decay_factor(angle_off_head_deg: float) -> float:
    """Fracción de la tasa de avance de cabeza que aplica a `angle_off_head_deg`."""
    theta = math.radians(min(180.0, max(0.0, abs(angle_off_head_deg))))
    factor = DECAY_A0 + DECAY_A1 * math.cos(theta) + DECAY_A2 * math.cos(2.0 * theta)
    return min(HEAD_FACTOR, max(TAIL_FACTOR, factor))


def head_bearing(fire: Fire | None) -> float | None:
    """Hacia dónde avanza la cabeza. Si falta, se deduce del viento (`direction_deg` es DE DÓNDE
    viene, así que la cabeza va a +180°)."""
    if fire is None:
        return None
    if fire.head_bearing_deg is not None:
        return float(fire.head_bearing_deg) % 360.0
    if fire.wind and fire.wind.direction_deg is not None:
        return (float(fire.wind.direction_deg) + 180.0) % 360.0
    return None


def fire_head_point(fire: Fire | None) -> tuple[float, float] | None:
    """Vértice del cono: el punto del perímetro más avanzado en el rumbo de la cabeza."""
    if fire is None:
        return None
    ring = fire.perimeter.ring()
    if not ring:
        return None
    hb = head_bearing(fire)
    if hb is None:
        return None
    return polygon_extreme_point(ring, hb)


def effective_spread_rate_mh(fire: Fire, angle_off_head_deg: float) -> float | None:
    if fire.spread_rate_mh is None or fire.spread_rate_mh <= 0:
        return None
    return float(fire.spread_rate_mh) * angular_decay_factor(angle_off_head_deg)


def front_geometry(subject: Any, fire: Fire | None) -> dict | None:
    """Datos crudos del cálculo: distancia al frente, ángulo respecto a la cabeza y tasa efectiva.

    Se expone aparte para que el dashboard y los tests puedan explicar el número.
    """
    pos = _latlon(subject)
    if pos is None or fire is None:
        return None
    ring = fire.perimeter.ring()
    if len(ring) < 3:
        return None
    lat, lon = pos
    if point_in_polygon(lat, lon, ring):
        return {"distance_m": 0.0, "angle_off_head_deg": 0.0, "rate_mh": None, "inside": True}
    (nlat, nlon), dist = nearest_point_on_ring(lat, lon, ring)
    hb = head_bearing(fire)
    if hb is None:
        return {"distance_m": dist, "angle_off_head_deg": None, "rate_mh": None, "inside": False}
    # rumbo desde el frente hacia la persona: si coincide con la cabeza, le llega antes
    br = bearing_deg(nlat, nlon, lat, lon)
    angle = angle_diff_deg(br, hb)
    return {
        "distance_m": dist,
        "angle_off_head_deg": angle,
        "rate_mh": effective_spread_rate_mh(fire, angle),
        "inside": False,
    }


def minutes_to_front(subject: Any, fire: Fire | None) -> float | None:
    """Minutos hasta que el frente alcanza a la persona (o casa).

    `None` cuando no se puede calcular (sin posición, sin fuego o sin tasa de avance):
    el contrato dice que un campo no calculado es `null`, nunca `0`.
    """
    geom = front_geometry(subject, fire)
    if geom is None:
        return None
    if geom["inside"]:
        return 0.0
    rate = geom["rate_mh"]
    if not rate:
        return None
    minutes = (geom["distance_m"] / rate) * 60.0
    return round(min(minutes, MAX_MINUTES), 1)


def is_in_advance_cone(subject: Any, fire: Fire | None, max_distance_m: float | None = None) -> bool:
    """¿Está el sujeto dentro del cono de avance (el geofence de la sección 3 del escenario)?"""
    pos = _latlon(subject)
    if pos is None or fire is None:
        return False
    ring = fire.perimeter.ring()
    if point_in_polygon(pos[0], pos[1], ring):
        return True
    head = fire_head_point(fire)
    hb = head_bearing(fire)
    if head is None or hb is None:
        return False
    return point_in_cone(pos, head, hb, float(fire.cone_half_angle_deg or 30.0), max_distance_m)


def projected_position(subject: Any, horizon_min: float) -> tuple[float, float] | None:
    """Dónde estará la persona en `horizon_min` si sigue igual (rumbo y velocidad actuales)."""
    pos = _latlon(subject)
    heading = getattr(subject, "heading_deg", None)
    speed = getattr(subject, "speed_kmh", None)
    if pos is None or heading is None or not speed:
        return None
    distance_m = (float(speed) * 1000.0 / 60.0) * float(horizon_min)
    if distance_m <= 0:
        return None
    return destination_point(pos[0], pos[1], float(heading), distance_m)


def trajectory_enters_cone(subject: Any, fire: Fire | None, horizon_min: float = 10.0) -> bool:
    """La trayectoria (no la posición) se mete en el cono: es lo que dispara la llamada inmediata."""
    if fire is None:
        return False
    if is_in_advance_cone(subject, fire):
        return True
    ahead = projected_position(subject, horizon_min)
    if ahead is None:
        return False
    return is_in_advance_cone(ahead, fire)


def drift_toward_fire(subject: Any, fire: Fire | None, horizon_min: float = 10.0) -> float:
    """Factor 0-1 de "va hacia el fuego" para la fórmula de prioridad (peso 0.10).

    1.0 si la trayectoria entra en el cono; si no, el coseno del ángulo entre su rumbo y el
    rumbo hacia el frente (0 si se aleja). Sin rumbo conocido devuelve 0.0: la ignorancia la
    castiga el factor de incertidumbre, no este.
    """
    pos = _latlon(subject)
    if pos is None or fire is None:
        return 0.0
    heading = getattr(subject, "heading_deg", None)
    speed = getattr(subject, "speed_kmh", None)
    if heading is None or not speed:
        return 0.0
    if trajectory_enters_cone(subject, fire, horizon_min):
        return 1.0
    ring = fire.perimeter.ring()
    if len(ring) < 3:
        return 0.0
    (nlat, nlon), _ = nearest_point_on_ring(pos[0], pos[1], ring)
    to_fire = bearing_deg(pos[0], pos[1], nlat, nlon)
    delta = angle_diff_deg(float(heading), to_fire)
    return max(0.0, math.cos(math.radians(delta)))


def distance_to_fire_m(subject: Any, fire: Fire | None) -> float | None:
    pos = _latlon(subject)
    if pos is None or fire is None:
        return None
    ring = fire.perimeter.ring()
    if len(ring) < 3:
        return None
    if point_in_polygon(pos[0], pos[1], ring):
        return 0.0
    return round(nearest_point_on_ring(pos[0], pos[1], ring)[1], 1)


def fire_threatens_point(
    subject: Any, fire: Fire | None, distance_m: float, cone_matters: bool = True
) -> bool:
    """Criterio de "zona de salida amenazada": fuego a menos de X o el cono apuntando a ella."""
    d = distance_to_fire_m(subject, fire)
    if d is not None and d <= distance_m:
        return True
    return bool(cone_matters and is_in_advance_cone(subject, fire))


def describe_front(subject: Any, fire: Fire | None) -> str:
    """Frase corta para el `reason` de un decision_log."""
    geom = front_geometry(subject, fire)
    if geom is None:
        return "sin datos de frente"
    if geom["inside"]:
        return "dentro del perímetro del fuego"
    angle = geom["angle_off_head_deg"]
    minutes = minutes_to_front(subject, fire)
    if angle is None:
        return f"a {geom['distance_m'] / 1000:.1f} km del frente"
    if angle <= 30:
        zona = "en la cabeza del fuego"
    elif angle <= 110:
        zona = "en el flanco"
    else:
        zona = "en la cola"
    minutos = f"{minutes:.0f} min" if minutes is not None else "sin estimar"
    return f"a {geom['distance_m'] / 1000:.1f} km {zona} ({minutos} hasta el frente)"


def haversine_between(a: Any, b: Any) -> float | None:
    """Atajo cómodo para el planner (cohesión de convoyes, ETAs)."""
    pa, pb = _latlon(a), _latlon(b)
    if pa is None or pb is None:
        return None
    return haversine_m(pa[0], pa[1], pb[0], pb[1])
