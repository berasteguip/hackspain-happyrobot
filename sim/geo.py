"""Proyección local plana: lat/lon <-> metros.

La simulación trabaja en metros sobre un plano local (equirectangular centrado en el
escenario). A esta escala (~25 km) el error de la equirectangular frente a UTM es de
decenas de centímetros, irrelevante para un modelo mesoscópico, y nos ahorra pyproj.

Convención del repo (docs/contrato-de-datos.md §1): en JSON siempre `lat`, `lon` en ese
orden; en GeoJSON siempre `[lon, lat]`.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np

EARTH_R_M = 6_371_000.0


@dataclass(frozen=True)
class LocalFrame:
    """Plano local en metros con origen en (lat0, lon0)."""

    lat0: float
    lon0: float

    @property
    def _kx(self) -> float:
        return EARTH_R_M * math.cos(math.radians(self.lat0)) * math.pi / 180.0

    @property
    def _ky(self) -> float:
        return EARTH_R_M * math.pi / 180.0

    def to_xy(self, lat, lon):
        lat = np.asarray(lat, dtype=np.float64)
        lon = np.asarray(lon, dtype=np.float64)
        return (lon - self.lon0) * self._kx, (lat - self.lat0) * self._ky

    def to_latlon(self, x, y):
        x = np.asarray(x, dtype=np.float64)
        y = np.asarray(y, dtype=np.float64)
        return y / self._ky + self.lat0, x / self._kx + self.lon0


def bearing_to_unit(bearing_deg: float) -> tuple[float, float]:
    """Rumbo geográfico (0=N, 90=E, sentido horario) -> vector unitario (x=este, y=norte)."""
    a = math.radians(bearing_deg)
    return math.sin(a), math.cos(a)


def haversine_m(lat1, lon1, lat2, lon2):
    lat1, lon1, lat2, lon2 = (np.radians(np.asarray(v, dtype=np.float64)) for v in (lat1, lon1, lat2, lon2))
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    h = np.sin(dlat / 2) ** 2 + np.cos(lat1) * np.cos(lat2) * np.sin(dlon / 2) ** 2
    return 2 * EARTH_R_M * np.arcsin(np.sqrt(np.clip(h, 0.0, 1.0)))
