"""Geometría mínima sobre WGS84, sin dependencias externas.

Convenciones (contrato de datos, §1):
- `lat`, `lon` en grados decimales. En objetos JSON siempre en ese orden.
- Geometrías GeoJSON con orden `[lon, lat]`.
- Rumbos (`bearing`) en grados desde el norte geográfico, sentido horario: 0 = norte, 90 = este.
- Distancias en metros.

Trabajamos con una proyección equirectangular local (plano tangente en un punto de
referencia). A las escalas de un incendio (decenas de km) el error es de centímetros a
pocos metros y nos permite hacer toda la geometría con álgebra de 2D estable.
"""

from __future__ import annotations

import math
from typing import Iterable, Sequence

EARTH_RADIUS_M = 6371008.8

# Un anillo GeoJSON: lista de pares [lon, lat], primero == último.
Ring = list[list[float]]


def to_local(lat0: float, lon0: float, lat: float, lon: float) -> tuple[float, float]:
    """Pasa (lat, lon) a metros (este, norte) respecto al punto de referencia."""
    x = math.radians(lon - lon0) * EARTH_RADIUS_M * math.cos(math.radians(lat0))
    y = math.radians(lat - lat0) * EARTH_RADIUS_M
    return x, y


def from_local(lat0: float, lon0: float, x: float, y: float) -> tuple[float, float]:
    """Inversa de `to_local`: metros (este, norte) -> (lat, lon)."""
    lat = lat0 + math.degrees(y / EARTH_RADIUS_M)
    lon = lon0 + math.degrees(x / (EARTH_RADIUS_M * math.cos(math.radians(lat0))))
    return lat, lon


def bearing_to_vector(bearing_deg: float) -> tuple[float, float]:
    """Rumbo -> vector unitario (este, norte)."""
    rad = math.radians(bearing_deg)
    return math.sin(rad), math.cos(rad)


def destination(lat: float, lon: float, bearing_deg: float, distance_m: float) -> tuple[float, float]:
    """Punto a `distance_m` en el rumbo `bearing_deg` (fórmula de círculo máximo)."""
    ang = distance_m / EARTH_RADIUS_M
    br = math.radians(bearing_deg)
    lat1, lon1 = math.radians(lat), math.radians(lon)
    lat2 = math.asin(math.sin(lat1) * math.cos(ang) + math.cos(lat1) * math.sin(ang) * math.cos(br))
    lon2 = lon1 + math.atan2(
        math.sin(br) * math.sin(ang) * math.cos(lat1),
        math.cos(ang) - math.sin(lat1) * math.sin(lat2),
    )
    return math.degrees(lat2), (math.degrees(lon2) + 540.0) % 360.0 - 180.0


def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2
    )
    return 2 * EARTH_RADIUS_M * math.asin(min(1.0, math.sqrt(a)))


def initial_bearing_deg(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Rumbo inicial de 1 a 2, en [0, 360)."""
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dlon = math.radians(lon2 - lon1)
    y = math.sin(dlon) * math.cos(p2)
    x = math.cos(p1) * math.sin(p2) - math.sin(p1) * math.cos(p2) * math.cos(dlon)
    return (math.degrees(math.atan2(y, x)) + 360.0) % 360.0


def angle_diff_deg(a: float, b: float) -> float:
    """Diferencia angular mínima entre dos rumbos, en [0, 180]."""
    d = abs((a - b) % 360.0)
    return min(d, 360.0 - d)


# --------------------------------------------------------------------------- anillos


def close_ring(ring: Sequence[Sequence[float]]) -> Ring:
    pts = [[float(p[0]), float(p[1])] for p in ring]
    if pts and (abs(pts[0][0] - pts[-1][0]) > 1e-12 or abs(pts[0][1] - pts[-1][1]) > 1e-12):
        pts.append([pts[0][0], pts[0][1]])
    return pts


def ring_reference_point(ring: Sequence[Sequence[float]]) -> tuple[float, float]:
    """Punto de referencia (media aritmética) para proyectar el anillo."""
    pts = [p for p in ring]
    lat = sum(p[1] for p in pts) / len(pts)
    lon = sum(p[0] for p in pts) / len(pts)
    return lat, lon


def _local_points(ring: Sequence[Sequence[float]], lat0: float, lon0: float) -> list[tuple[float, float]]:
    return [to_local(lat0, lon0, p[1], p[0]) for p in ring]


def ring_area_m2(ring: Sequence[Sequence[float]]) -> float:
    """Área (positiva) del anillo en m², por la fórmula del zapatero en plano local."""
    r = close_ring(ring)
    lat0, lon0 = ring_reference_point(r[:-1])
    pts = _local_points(r, lat0, lon0)
    acc = 0.0
    for (x1, y1), (x2, y2) in zip(pts, pts[1:]):
        acc += x1 * y2 - x2 * y1
    return abs(acc) / 2.0


def ring_centroid(ring: Sequence[Sequence[float]]) -> tuple[float, float]:
    """Centroide de área del anillo, devuelto como (lat, lon)."""
    r = close_ring(ring)
    lat0, lon0 = ring_reference_point(r[:-1])
    pts = _local_points(r, lat0, lon0)
    a = 0.0
    cx = 0.0
    cy = 0.0
    for (x1, y1), (x2, y2) in zip(pts, pts[1:]):
        cross = x1 * y2 - x2 * y1
        a += cross
        cx += (x1 + x2) * cross
        cy += (y1 + y2) * cross
    if abs(a) < 1e-9:  # degenerado: caemos a la media
        return lat0, lon0
    a *= 0.5
    return from_local(lat0, lon0, cx / (6 * a), cy / (6 * a))


def _segments_properly_intersect(
    p1: tuple[float, float],
    p2: tuple[float, float],
    p3: tuple[float, float],
    p4: tuple[float, float],
) -> bool:
    def cross(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])

    d1 = cross(p3, p4, p1)
    d2 = cross(p3, p4, p2)
    d3 = cross(p1, p2, p3)
    d4 = cross(p1, p2, p4)
    if ((d1 > 0) != (d2 > 0)) and ((d3 > 0) != (d4 > 0)):
        return True
    return False


def ring_is_simple(ring: Sequence[Sequence[float]]) -> bool:
    """True si el anillo no se autointersecta (O(n²), n pequeño: nos vale)."""
    r = close_ring(ring)
    lat0, lon0 = ring_reference_point(r[:-1])
    pts = _local_points(r, lat0, lon0)
    n = len(pts) - 1  # segmentos
    if n < 3:
        return False
    for i in range(n):
        a1, a2 = pts[i], pts[i + 1]
        for j in range(i + 1, n):
            if j == i or (j == i + 1) or (i == 0 and j == n - 1):
                continue  # adyacentes: comparten vértice por construcción
            if _segments_properly_intersect(a1, a2, pts[j], pts[j + 1]):
                return False
    return True


def polygon_is_valid(polygon: dict) -> tuple[bool, str]:
    """Valida un GeoJSON Polygon de una sola corona. Devuelve (ok, motivo)."""
    if not isinstance(polygon, dict) or polygon.get("type") != "Polygon":
        return False, "no es un GeoJSON Polygon"
    coords = polygon.get("coordinates")
    if not coords or not isinstance(coords, list):
        return False, "sin coordinates"
    ring = coords[0]
    if len(ring) < 4:
        return False, f"anillo con {len(ring)} puntos (mínimo 4)"
    if ring[0] != ring[-1]:
        return False, "anillo no cerrado"
    for a, b in zip(ring, ring[1:]):
        if abs(a[0] - b[0]) < 1e-12 and abs(a[1] - b[1]) < 1e-12:
            return False, "vértices consecutivos duplicados"
    if ring_area_m2(ring) <= 0:
        return False, "área nula"
    if not ring_is_simple(ring):
        return False, "el anillo se autointersecta"
    return True, "ok"


def ray_ring_distance_m(
    lat0: float,
    lon0: float,
    ring: Sequence[Sequence[float]],
    bearing_deg: float,
) -> float | None:
    """Distancia del punto (lat0, lon0) al borde del anillo siguiendo `bearing_deg`.

    Si el rayo corta el anillo varias veces devuelve la intersección más lejana
    (para polígonos estrellados hay exactamente una).
    """
    r = close_ring(ring)
    pts = _local_points(r, lat0, lon0)
    dx, dy = bearing_to_vector(bearing_deg)
    best: float | None = None
    for (px, py), (qx, qy) in zip(pts, pts[1:]):
        ex, ey = qx - px, qy - py
        det = -dx * ey + ex * dy
        if abs(det) < 1e-12:
            continue
        s = (-px * ey + ex * py) / det
        t = (dx * py - dy * px) / det
        if s > 0 and -1e-9 <= t <= 1 + 1e-9:
            if best is None or s > best:
                best = s
    return best


def circle_ring(lat: float, lon: float, radius_m: float, n: int = 48) -> Ring:
    """Anillo GeoJSON aproximando un círculo (para focos secundarios y autoría de guiones)."""
    pts: Ring = []
    for i in range(n):
        b = 360.0 * i / n
        la, lo = destination(lat, lon, b, radius_m)
        pts.append([round(lo, 7), round(la, 7)])
    return close_ring(pts)


def ring_bounds(ring: Iterable[Sequence[float]]) -> tuple[float, float, float, float]:
    """(min_lon, min_lat, max_lon, max_lat)."""
    pts = list(ring)
    lons = [p[0] for p in pts]
    lats = [p[1] for p in pts]
    return min(lons), min(lats), max(lons), max(lats)
