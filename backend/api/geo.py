"""Utilidades geográficas sin dependencias externas.

Convenciones (contrato §1):
- los pares sueltos van como `(lat, lon)` en las firmas de Python;
- los anillos y líneas GeoJSON vienen como `[[lon, lat], ...]` — ojo a la inversión;
- las distancias son metros.

Para la geometría plana (distancias a segmentos, cruces) proyectamos a un plano local
equirectangular centrado en la zona de trabajo. A escala de un incendio (decenas de km) el
error es despreciable y evita arrastrar shapely.
"""

from __future__ import annotations

import math

EARTH_RADIUS_M = 6_371_008.8
M_PER_DEG_LAT = 110_540.0
M_PER_DEG_LON_EQ = 111_320.0

LatLon = tuple[float, float]


# --------------------------------------------------------------------------------------
# Distancias y rumbos sobre la esfera
# --------------------------------------------------------------------------------------


def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Distancia entre dos puntos en metros."""
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = p2 - p1
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlambda / 2) ** 2
    return 2 * EARTH_RADIUS_M * math.asin(min(1.0, math.sqrt(a)))


def bearing_deg(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Rumbo inicial de 1 a 2, en grados desde el norte (0-360)."""
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dl = math.radians(lon2 - lon1)
    y = math.sin(dl) * math.cos(p2)
    x = math.cos(p1) * math.sin(p2) - math.sin(p1) * math.cos(p2) * math.cos(dl)
    return (math.degrees(math.atan2(y, x)) + 360.0) % 360.0


def angle_diff_deg(a: float, b: float) -> float:
    """Diferencia angular mínima entre dos rumbos, 0-180."""
    d = abs((a - b) % 360.0)
    return d if d <= 180.0 else 360.0 - d


def destination_point(lat: float, lon: float, bearing: float, distance_m: float) -> LatLon:
    """Punto a `distance_m` en el rumbo `bearing` desde (lat, lon)."""
    d = distance_m / EARTH_RADIUS_M
    br = math.radians(bearing)
    p1 = math.radians(lat)
    l1 = math.radians(lon)
    p2 = math.asin(math.sin(p1) * math.cos(d) + math.cos(p1) * math.sin(d) * math.cos(br))
    l2 = l1 + math.atan2(
        math.sin(br) * math.sin(d) * math.cos(p1), math.cos(d) - math.sin(p1) * math.sin(p2)
    )
    return math.degrees(p2), (math.degrees(l2) + 540.0) % 360.0 - 180.0


def is_bearing_in_cone(bearing: float, cone_bearing: float, half_angle_deg: float) -> bool:
    """¿Cae `bearing` dentro del cono centrado en `cone_bearing` de semiángulo dado?"""
    return angle_diff_deg(bearing, cone_bearing) <= half_angle_deg


def point_in_cone(
    point: LatLon,
    vertex: LatLon,
    cone_bearing: float,
    half_angle_deg: float,
    max_distance_m: float | None = None,
) -> bool:
    """¿Está el punto dentro del sector circular con vértice en `vertex`?"""
    dist = haversine_m(vertex[0], vertex[1], point[0], point[1])
    if dist < 1.0:  # el propio vértice cuenta como dentro
        return True
    if max_distance_m is not None and dist > max_distance_m:
        return False
    br = bearing_deg(vertex[0], vertex[1], point[0], point[1])
    return is_bearing_in_cone(br, cone_bearing, half_angle_deg)


# --------------------------------------------------------------------------------------
# Proyección local (metros) para geometría plana
# --------------------------------------------------------------------------------------


class LocalPlane:
    """Plano equirectangular local. `to_xy` devuelve metros respecto al origen."""

    __slots__ = ("lat0", "lon0", "kx", "ky")

    def __init__(self, lat0: float, lon0: float) -> None:
        self.lat0 = lat0
        self.lon0 = lon0
        self.kx = M_PER_DEG_LON_EQ * math.cos(math.radians(lat0))
        self.ky = M_PER_DEG_LAT

    def to_xy(self, lat: float, lon: float) -> tuple[float, float]:
        return (lon - self.lon0) * self.kx, (lat - self.lat0) * self.ky

    def to_latlon(self, x: float, y: float) -> LatLon:
        return self.lat0 + y / self.ky, self.lon0 + x / self.kx


def _plane_for(ring: list[list[float]], lat: float | None = None, lon: float | None = None):
    if lat is not None and lon is not None:
        return LocalPlane(lat, lon)
    if ring:
        return LocalPlane(ring[0][1], ring[0][0])
    return LocalPlane(0.0, 0.0)


# --------------------------------------------------------------------------------------
# Polígonos ([[lon, lat], ...])
# --------------------------------------------------------------------------------------


def point_in_polygon(lat: float, lon: float, ring: list[list[float]]) -> bool:
    """Ray casting. `ring` en formato GeoJSON `[[lon, lat], ...]`."""
    if len(ring) < 3:
        return False
    inside = False
    n = len(ring)
    j = n - 1
    for i in range(n):
        xi, yi = ring[i][0], ring[i][1]
        xj, yj = ring[j][0], ring[j][1]
        if (yi > lat) != (yj > lat):
            x_cross = xi + (lat - yi) * (xj - xi) / ((yj - yi) or 1e-12)
            if lon < x_cross:
                inside = not inside
        j = i
    return inside


def _dist_point_segment(
    px: float, py: float, ax: float, ay: float, bx: float, by: float
) -> tuple[float, float, float]:
    """Distancia punto-segmento en el plano; devuelve (distancia, x_proy, y_proy)."""
    dx, dy = bx - ax, by - ay
    if dx == 0 and dy == 0:
        return math.hypot(px - ax, py - ay), ax, ay
    t = ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)
    t = max(0.0, min(1.0, t))
    cx, cy = ax + t * dx, ay + t * dy
    return math.hypot(px - cx, py - cy), cx, cy


def nearest_point_on_ring(lat: float, lon: float, ring: list[list[float]]) -> tuple[LatLon, float]:
    """Punto del perímetro más cercano y su distancia en metros (aunque el punto esté dentro)."""
    if len(ring) < 2:
        return (lat, lon), 0.0
    plane = LocalPlane(lat, lon)
    px, py = 0.0, 0.0
    best = (float("inf"), 0.0, 0.0)
    for i in range(len(ring) - 1):
        ax, ay = plane.to_xy(ring[i][1], ring[i][0])
        bx, by = plane.to_xy(ring[i + 1][1], ring[i + 1][0])
        d, cx, cy = _dist_point_segment(px, py, ax, ay, bx, by)
        if d < best[0]:
            best = (d, cx, cy)
    # cerramos el anillo si el escenario no lo trae cerrado
    if ring[0] != ring[-1]:
        ax, ay = plane.to_xy(ring[-1][1], ring[-1][0])
        bx, by = plane.to_xy(ring[0][1], ring[0][0])
        d, cx, cy = _dist_point_segment(px, py, ax, ay, bx, by)
        if d < best[0]:
            best = (d, cx, cy)
    return plane.to_latlon(best[1], best[2]), best[0]


def distance_point_to_polygon_m(lat: float, lon: float, ring: list[list[float]]) -> float:
    """0.0 si el punto está dentro; si no, distancia al borde más cercano."""
    if point_in_polygon(lat, lon, ring):
        return 0.0
    return nearest_point_on_ring(lat, lon, ring)[1]


def polygon_centroid(ring: list[list[float]]) -> LatLon:
    """Centroide del área (fallback a media de vértices si el área degenera)."""
    pts = ring[:-1] if len(ring) > 2 and ring[0] == ring[-1] else ring
    if not pts:
        return 0.0, 0.0
    area = 0.0
    cx = cy = 0.0
    n = len(pts)
    for i in range(n):
        x1, y1 = pts[i][0], pts[i][1]
        x2, y2 = pts[(i + 1) % n][0], pts[(i + 1) % n][1]
        cross = x1 * y2 - x2 * y1
        area += cross
        cx += (x1 + x2) * cross
        cy += (y1 + y2) * cross
    if abs(area) < 1e-12:
        return sum(p[1] for p in pts) / n, sum(p[0] for p in pts) / n
    area *= 0.5
    return cy / (6 * area), cx / (6 * area)


def polygon_extreme_point(ring: list[list[float]], bearing: float) -> LatLon:
    """Vértice del polígono más avanzado en el rumbo dado: la "cabeza" del fuego."""
    if not ring:
        return 0.0, 0.0
    clat, clon = polygon_centroid(ring)
    plane = LocalPlane(clat, clon)
    br = math.radians(bearing)
    ux, uy = math.sin(br), math.cos(br)  # rumbo desde el norte → (x=este, y=norte)
    best, best_pt = -float("inf"), (ring[0][1], ring[0][0])
    for lon, lat in ((p[0], p[1]) for p in ring):
        x, y = plane.to_xy(lat, lon)
        proj = x * ux + y * uy
        if proj > best:
            best, best_pt = proj, (lat, lon)
    return best_pt


def _orient(ax, ay, bx, by, cx, cy) -> float:
    return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax)


def _segments_intersect(ax, ay, bx, by, cx, cy, dx, dy) -> bool:
    d1 = _orient(cx, cy, dx, dy, ax, ay)
    d2 = _orient(cx, cy, dx, dy, bx, by)
    d3 = _orient(ax, ay, bx, by, cx, cy)
    d4 = _orient(ax, ay, bx, by, dx, dy)
    if ((d1 > 0) != (d2 > 0)) and ((d3 > 0) != (d4 > 0)):
        return True
    return False


def segment_intersects_polygon(p1: LatLon, p2: LatLon, ring: list[list[float]]) -> bool:
    """¿El segmento entra en el polígono (cruza el borde o empieza dentro)?"""
    if len(ring) < 3:
        return False
    if point_in_polygon(p1[0], p1[1], ring) or point_in_polygon(p2[0], p2[1], ring):
        return True
    plane = LocalPlane(p1[0], p1[1])
    ax, ay = plane.to_xy(p1[0], p1[1])
    bx, by = plane.to_xy(p2[0], p2[1])
    closed = ring if ring[0] == ring[-1] else ring + [ring[0]]
    for i in range(len(closed) - 1):
        cx, cy = plane.to_xy(closed[i][1], closed[i][0])
        dx, dy = plane.to_xy(closed[i + 1][1], closed[i + 1][0])
        if _segments_intersect(ax, ay, bx, by, cx, cy, dx, dy):
            return True
    return False


def path_intersects_polygon(path: list[LatLon], ring: list[list[float]]) -> bool:
    """¿Alguna parte de la ruta entra en el polígono?"""
    if not path or len(ring) < 3:
        return False
    if len(path) == 1:
        return point_in_polygon(path[0][0], path[0][1], ring)
    return any(
        segment_intersects_polygon(path[i], path[i + 1], ring) for i in range(len(path) - 1)
    )


# --------------------------------------------------------------------------------------
# Líneas (carreteras cortadas)
# --------------------------------------------------------------------------------------


def distance_point_to_linestring_m(lat: float, lon: float, coords: list[list[float]]) -> float:
    """Distancia mínima de un punto a una polilínea `[[lon, lat], ...]`."""
    if not coords:
        return float("inf")
    if len(coords) == 1:
        return haversine_m(lat, lon, coords[0][1], coords[0][0])
    plane = LocalPlane(lat, lon)
    best = float("inf")
    for i in range(len(coords) - 1):
        ax, ay = plane.to_xy(coords[i][1], coords[i][0])
        bx, by = plane.to_xy(coords[i + 1][1], coords[i + 1][0])
        d, _, _ = _dist_point_segment(0.0, 0.0, ax, ay, bx, by)
        best = min(best, d)
    return best


def path_near_linestring(
    path: list[LatLon], coords: list[list[float]], tolerance_m: float = 80.0
) -> bool:
    """¿La ruta pasa por la carretera cortada (a menos de `tolerance_m`)?"""
    if not path or not coords:
        return False
    return any(distance_point_to_linestring_m(lat, lon, coords) <= tolerance_m for lat, lon in path)


# --------------------------------------------------------------------------------------
# Encoded polyline (algoritmo de Google; precisión 5 por defecto, 6 para Valhalla)
# --------------------------------------------------------------------------------------


def encode_polyline(points: list[LatLon], precision: int = 5) -> str:
    factor = 10**precision
    out: list[str] = []
    prev_lat = prev_lon = 0
    for lat, lon in points:
        ilat = int(round(lat * factor))
        ilon = int(round(lon * factor))
        for delta in (ilat - prev_lat, ilon - prev_lon):
            v = ~(delta << 1) if delta < 0 else (delta << 1)
            while v >= 0x20:
                out.append(chr((0x20 | (v & 0x1F)) + 63))
                v >>= 5
            out.append(chr(v + 63))
        prev_lat, prev_lon = ilat, ilon
    return "".join(out)


def decode_polyline(encoded: str | None, precision: int = 5) -> list[LatLon]:
    if not encoded:
        return []
    factor = 10**precision
    points: list[LatLon] = []
    index = lat = lon = 0
    length = len(encoded)
    while index < length:
        for axis in range(2):
            shift = result = 0
            while index < length:
                b = ord(encoded[index]) - 63
                index += 1
                result |= (b & 0x1F) << shift
                shift += 5
                if b < 0x20:
                    break
            delta = ~(result >> 1) if result & 1 else (result >> 1)
            if axis == 0:
                lat += delta
            else:
                lon += delta
        points.append((lat / factor, lon / factor))
    return points
