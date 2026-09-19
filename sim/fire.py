"""Modelo de avance del fuego: elipses encadenadas (principio de Huygens).

Por qué elipses y no un círculo: con viento, un incendio forestal se propaga con forma
aproximadamente elíptica; es el modelo estándar en simulación de incendios
(Van Wagner 1969; Alexander 1985, "Estimating the length-to-breadth ratio of elliptical
forest fire patterns"; es también el modelo del núcleo de FARSITE / Prometheus).

Anisotropía: usamos exactamente los ratios que fija `docs/contrato-de-datos.md` §4
(cabeza 100 %, flancos ~35 %, cola ~10 % de `spread_rate_mh`). Así el simulador y la
fórmula de `minutes_to_front` de la API hablan del mismo fuego.

Giro de viento: cuando el viento gira no reorientamos la elipse vieja (el terreno ya
quemado no se "des-quema"). Anclamos una elipse nueva en la cabeza actual y la hacemos
crecer con el rumbo nuevo. El fuego es la UNIÓN de los segmentos. Eso es el principio de
Huygens aplicado a mano, y es lo que hace que un giro de viento no teletransporte el frente.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field

import numpy as np

from .geo import LocalFrame, bearing_to_unit

FLANK_RATIO = 0.35  # contrato §4
BACK_RATIO = 0.10  # contrato §4


@dataclass
class WindShift:
    """Giro de viento en `t_min`: nuevo rumbo de cabeza y (opcional) nueva velocidad."""

    t_min: float
    head_bearing_deg: float
    spread_rate_mh: float | None = None


@dataclass
class _Segment:
    t_start: float
    anchor_x: float
    anchor_y: float
    ux: float
    uy: float
    rate_mh: float
    forward0_m: float
    flank0_m: float


@dataclass
class FireModel:
    """Fuego que crece en el plano local (metros)."""

    frame: LocalFrame
    origin_lat: float
    origin_lon: float
    head_bearing_deg: float
    spread_rate_mh: float
    initial_radius_m: float = 400.0
    wind_shifts: list[WindShift] = field(default_factory=list)
    _segments: list[_Segment] = field(default_factory=list, init=False, repr=False)

    def __post_init__(self) -> None:
        x0, y0 = self.frame.to_xy(self.origin_lat, self.origin_lon)
        self._ox, self._oy = float(x0), float(y0)
        self._build_segments()

    # ------------------------------------------------------------------ interno
    def _build_segments(self) -> None:
        ux, uy = bearing_to_unit(self.head_bearing_deg)
        segs = [
            _Segment(
                t_start=0.0,
                anchor_x=self._ox,
                anchor_y=self._oy,
                ux=ux,
                uy=uy,
                rate_mh=self.spread_rate_mh,
                forward0_m=self.initial_radius_m,
                flank0_m=self.initial_radius_m,
            )
        ]
        for shift in sorted(self.wind_shifts, key=lambda s: s.t_min):
            prev = segs[-1]
            dt_h = max(shift.t_min - prev.t_start, 0.0) / 60.0
            fwd = prev.forward0_m + prev.rate_mh * dt_h
            flank = prev.flank0_m + prev.rate_mh * FLANK_RATIO * dt_h
            ux, uy = bearing_to_unit(shift.head_bearing_deg)
            segs.append(
                _Segment(
                    t_start=shift.t_min,
                    anchor_x=prev.anchor_x + prev.ux * fwd,
                    anchor_y=prev.anchor_y + prev.uy * fwd,
                    ux=ux,
                    uy=uy,
                    rate_mh=shift.spread_rate_mh if shift.spread_rate_mh else prev.rate_mh,
                    # la elipse nueva nace pequeña pero no puntual: hereda el flanco
                    forward0_m=self.initial_radius_m * 0.5,
                    flank0_m=flank,
                )
            )
        self._segments = segs

    def _ellipse_at(self, seg: _Segment, t_min: float):
        """Devuelve (cx, cy, semieje_mayor, semieje_menor) de un segmento en t_min."""
        dt_h = max(t_min - seg.t_start, 0.0) / 60.0
        fwd = seg.forward0_m + seg.rate_mh * dt_h
        back = seg.forward0_m * 0.5 + seg.rate_mh * BACK_RATIO * dt_h
        flank = seg.flank0_m + seg.rate_mh * FLANK_RATIO * dt_h
        a = (fwd + back) / 2.0
        cx = seg.anchor_x + seg.ux * (fwd - back) / 2.0
        cy = seg.anchor_y + seg.uy * (fwd - back) / 2.0
        return cx, cy, max(a, 1.0), max(flank, 1.0)

    # ------------------------------------------------------------------ API
    def active_segments(self, t_min: float) -> list[_Segment]:
        return [s for s in self._segments if s.t_start <= t_min]

    def contains(self, t_min: float, xs: np.ndarray, ys: np.ndarray) -> np.ndarray:
        """Máscara booleana vectorizada: ¿está cada punto dentro del fuego en t_min?"""
        out = np.zeros(xs.shape, dtype=bool)
        for seg in self.active_segments(t_min):
            cx, cy, a, b = self._ellipse_at(seg, t_min)
            dx = xs - cx
            dy = ys - cy
            # rotar al marco de la elipse: eje mayor a lo largo de (ux, uy)
            along = dx * seg.ux + dy * seg.uy
            cross = -dx * seg.uy + dy * seg.ux
            np.logical_or(out, (along / a) ** 2 + (cross / b) ** 2 <= 1.0, out=out)
        return out

    def head_position(self, t_min: float) -> tuple[float, float]:
        seg = self.active_segments(t_min)[-1]
        dt_h = max(t_min - seg.t_start, 0.0) / 60.0
        fwd = seg.forward0_m + seg.rate_mh * dt_h
        return seg.anchor_x + seg.ux * fwd, seg.anchor_y + seg.uy * fwd

    def head_bearing_at(self, t_min: float) -> float:
        seg = self.active_segments(t_min)[-1]
        return (math.degrees(math.atan2(seg.ux, seg.uy))) % 360.0

    def polygons_xy(self, t_min: float, n: int = 48) -> list[np.ndarray]:
        """Un polígono (n,2) por segmento activo, en metros. Para pintar y para GeoJSON."""
        th = np.linspace(0.0, 2 * np.pi, n, endpoint=True)
        polys = []
        for seg in self.active_segments(t_min):
            cx, cy, a, b = self._ellipse_at(seg, t_min)
            along = a * np.cos(th)
            cross = b * np.sin(th)
            xs = cx + along * seg.ux - cross * seg.uy
            ys = cy + along * seg.uy + cross * seg.ux
            polys.append(np.column_stack([xs, ys]))
        return polys

    def perimeter_geojson(self, t_min: float, n: int = 48) -> dict:
        """GeoJSON MultiPolygon con orden [lon, lat] (contrato §1)."""
        coords = []
        for poly in self.polygons_xy(t_min, n):
            lat, lon = self.frame.to_latlon(poly[:, 0], poly[:, 1])
            ring = np.column_stack([lon, lat]).tolist()
            ring.append(ring[0])
            coords.append([ring])
        return {"type": "MultiPolygon", "coordinates": coords}

    def minutes_until_reaches(self, x: float, y: float, horizon_min: float, step_min: float = 0.5) -> float | None:
        """Minutos hasta que el frente cubre (x, y). None si no lo cubre en el horizonte.

        Barrido grueso + bisección fina. Se usa para el `front_arrives_min` del informe.
        """
        xs = np.array([x], dtype=np.float64)
        ys = np.array([y], dtype=np.float64)
        if self.contains(0.0, xs, ys)[0]:
            return 0.0
        t = 0.0
        while t <= horizon_min:
            if self.contains(t, xs, ys)[0]:
                lo, hi = t - step_min, t
                for _ in range(12):
                    mid = (lo + hi) / 2
                    if self.contains(mid, xs, ys)[0]:
                        hi = mid
                    else:
                        lo = mid
                return round(hi, 2)
            t += step_min
        return None


def fire_from_scenario(frame: LocalFrame, fire_spec: dict) -> FireModel:
    shifts = [
        WindShift(
            t_min=float(s["t_min"]),
            head_bearing_deg=float(s["head_bearing_deg"]),
            spread_rate_mh=(float(s["spread_rate_mh"]) if s.get("spread_rate_mh") else None),
        )
        for s in fire_spec.get("wind_shifts", [])
    ]
    return FireModel(
        frame=frame,
        origin_lat=float(fire_spec["origin"]["lat"]),
        origin_lon=float(fire_spec["origin"]["lon"]),
        head_bearing_deg=float(fire_spec.get("head_bearing_deg", 45.0)),
        spread_rate_mh=float(fire_spec.get("spread_rate_mh", 1800.0)),
        initial_radius_m=float(fire_spec.get("initial_radius_m", 400.0)),
        wind_shifts=shifts,
    )
