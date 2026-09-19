"""Modelo de propagación del incendio.

Produce exactamente la entidad `Fire` del contrato de datos (§2.3):

    {perimeter, wind, spread_rate_mh, head_bearing_deg, cone_half_angle_deg, updated_at}

## La decisión de diseño que sostiene todo esto

El perímetro se guarda en **forma radial**: un centro fijo y `n_rays` radios sobre rumbos
equiespaciados. Crecer = sumar metros a cada radio. Esto nos da tres garantías gratis:

1. **Nunca se autointersecta.** Los vértices viven en rayos distintos y fijos, ordenados por
   rumbo: el polígono es estrellado por construcción.
2. **El área crece de forma monótona.** A = ½·Σ rᵢ·rᵢ₊₁·sin(Δθ) con Δθ constante, y todos los
   radios sólo suben (la tasa efectiva es estrictamente positiva en todos los rumbos).
3. **La anisotropía es trivial de expresar**: el radio del rayo con rumbo θ crece según la tasa
   efectiva en ese rumbo respecto a `head_bearing_deg`.

La alternativa (mover los vértices del polígono original y arreglar los nudos después) es la que
degenera a los 40 minutos. Aquí el requisito era estabilidad, así que la estabilidad va en la
representación y no en un post-proceso.

## Tasas efectivas: dos leyes

- `cosine` (por defecto): f(θ) = 0.35 + 0.45·cos θ + 0.20·cos²θ, con θ el ángulo respecto a la
  cabeza. Da exactamente cabeza 100 % / flanco 35 % / cola 10 % (contrato §4) y es monótona y
  estrictamente positiva.
- `ellipse`: elipse de Huygens con el foco en el origen, R(θ) = R_cabeza·(1−e)/(1 − e·cos θ),
  con la excentricidad derivada de la relación longitud/anchura (LB) que crece con el viento
  (forma de Alexander 1985). Más realista con viento fuerte; igual de estable, porque sigue
  siendo una tasa radial positiva.

`wind.direction_deg` es **de dónde viene** el viento. `head_bearing_deg` es **hacia dónde** va la
cabeza. `head_bearing_from_wind` es el único sitio del proyecto donde se hace esa conversión.
"""

from __future__ import annotations

import math
import random
from dataclasses import dataclass, field
from typing import Sequence

from . import geo

DEFAULT_N_RAYS = 72
DEFAULT_CONE_HALF_ANGLE_DEG = 30.0


# ------------------------------------------------------------------------------- viento


@dataclass
class Wind:
    """Viento en convención meteorológica: `direction_deg` = de dónde viene."""

    direction_deg: float
    speed_kmh: float
    gusts_kmh: float | None = None

    @property
    def downwind_bearing_deg(self) -> float:
        """Hacia dónde empuja el viento (opuesto a de dónde viene)."""
        return (self.direction_deg + 180.0) % 360.0

    def to_dict(self) -> dict:
        d: dict = {
            "direction_deg": round(self.direction_deg, 1),
            "speed_kmh": round(self.speed_kmh, 1),
        }
        if self.gusts_kmh is not None:
            d["gusts_kmh"] = round(self.gusts_kmh, 1)
        return d

    @classmethod
    def from_dict(cls, d: dict) -> "Wind":
        return cls(
            direction_deg=float(d["direction_deg"]),
            speed_kmh=float(d["speed_kmh"]),
            gusts_kmh=float(d["gusts_kmh"]) if d.get("gusts_kmh") is not None else None,
        )


def head_bearing_from_wind(wind: Wind) -> float:
    """Rumbo de avance de la cabeza a partir del viento.

    Viento del SO (225) -> cabeza al NE (45). Viento del sur (180) -> cabeza al norte (0).
    Este es el signo que invierte la demo entera si se equivoca; hay un test dedicado.
    """
    return wind.downwind_bearing_deg


def length_to_breadth(speed_kmh: float) -> float:
    """Relación longitud/anchura del elipsoide de fuego en función del viento.

    Forma de Alexander (1985): LB = 1 + 8.729·(1 − e^(−0.03·U))^2.155, U en km/h.
    Acotada a [1.1, 8] para que la elipse no degenere en una aguja.
    """
    u = max(0.0, speed_kmh)
    lb = 1.0 + 8.729 * (1.0 - math.exp(-0.03 * u)) ** 2.155
    return min(8.0, max(1.1, lb))


def cosine_decay(angle_from_head_deg: float) -> float:
    """cabeza 1.00 · flanco 0.35 · cola 0.10, suave y estrictamente positiva."""
    c = math.cos(math.radians(angle_from_head_deg))
    return 0.35 + 0.45 * c + 0.20 * c * c


def ellipse_decay(angle_from_head_deg: float, speed_kmh: float) -> float:
    """Decaimiento elíptico de Huygens con el foco en el origen."""
    lb = length_to_breadth(speed_kmh)
    e = math.sqrt(max(0.0, 1.0 - 1.0 / (lb * lb)))
    c = math.cos(math.radians(angle_from_head_deg))
    return (1.0 - e) / (1.0 - e * c)


# ------------------------------------------------------------------------------- frentes


@dataclass
class SpottingConfig:
    """Focos secundarios por pavesas: el evento más dramático del escenario."""

    probability_per_min: float = 0.0
    min_distance_m: float = 300.0
    max_distance_m: float = 1500.0
    radius_m: float = 130.0
    min_wind_kmh: float = 25.0
    max_spots: int = 4

    @classmethod
    def from_dict(cls, d: dict | None) -> "SpottingConfig":
        d = d or {}
        return cls(
            probability_per_min=float(d.get("probability_per_min", 0.0)),
            min_distance_m=float(d.get("min_distance_m", 300.0)),
            max_distance_m=float(d.get("max_distance_m", 1500.0)),
            radius_m=float(d.get("radius_m", 130.0)),
            min_wind_kmh=float(d.get("min_wind_kmh", 25.0)),
            max_spots=int(d.get("max_spots", 4)),
        )


class FireFront:
    """Un frente de fuego en forma radial."""

    def __init__(
        self,
        center_lat: float,
        center_lon: float,
        radii_m: Sequence[float],
        wind: Wind,
        spread_rate_mh: float,
        head_bearing_deg: float | None = None,
        spread_law: str = "cosine",
        cone_half_angle_deg: float = DEFAULT_CONE_HALF_ANGLE_DEG,
        front_id: str = "f-1",
        label: str = "frente principal",
    ) -> None:
        if len(radii_m) < 8:
            raise ValueError("un frente necesita al menos 8 rayos")
        if min(radii_m) <= 0:
            raise ValueError("todos los radios deben ser positivos")
        if spread_law not in ("cosine", "ellipse"):
            raise ValueError(f"spread_law desconocida: {spread_law}")
        self.center_lat = float(center_lat)
        self.center_lon = float(center_lon)
        self.radii_m = [float(r) for r in radii_m]
        self.wind = wind
        self.spread_rate_mh = float(spread_rate_mh)
        self.head_bearing_deg = (
            float(head_bearing_deg) if head_bearing_deg is not None else head_bearing_from_wind(wind)
        )
        self.spread_law = spread_law
        self.cone_half_angle_deg = float(cone_half_angle_deg)
        self.front_id = front_id
        self.label = label

    # -- construcción ------------------------------------------------------------------

    @property
    def n_rays(self) -> int:
        return len(self.radii_m)

    def ray_bearing(self, i: int) -> float:
        return (360.0 * i / self.n_rays) % 360.0

    @classmethod
    def from_geojson(
        cls,
        polygon: dict,
        wind: Wind,
        spread_rate_mh: float,
        head_bearing_deg: float | None = None,
        n_rays: int = DEFAULT_N_RAYS,
        **kwargs,
    ) -> "FireFront":
        """Convierte un Polygon GeoJSON a forma radial (muestreando rayos desde el centroide)."""
        ring = geo.close_ring(polygon["coordinates"][0])
        clat, clon = geo.ring_centroid(ring)
        radii: list[float | None] = []
        for i in range(n_rays):
            b = 360.0 * i / n_rays
            radii.append(geo.ray_ring_distance_m(clat, clon, ring, b))
        known = [r for r in radii if r and r > 0]
        if not known:
            raise ValueError("no se pudo muestrear el polígono inicial")
        fallback = sum(known) / len(known)
        filled = [r if (r and r > 0) else fallback for r in radii]
        return cls(clat, clon, filled, wind, spread_rate_mh, head_bearing_deg, **kwargs)

    @classmethod
    def circular(
        cls,
        lat: float,
        lon: float,
        radius_m: float,
        wind: Wind,
        spread_rate_mh: float,
        head_bearing_deg: float | None = None,
        n_rays: int = DEFAULT_N_RAYS,
        **kwargs,
    ) -> "FireFront":
        return cls(lat, lon, [radius_m] * n_rays, wind, spread_rate_mh, head_bearing_deg, **kwargs)

    # -- física ------------------------------------------------------------------------

    def effective_rate_mh(self, bearing_deg: float) -> float:
        """Tasa de avance (m/h) en un rumbo dado. Siempre > 0."""
        delta = geo.angle_diff_deg(bearing_deg, self.head_bearing_deg)
        if self.spread_law == "ellipse":
            factor = ellipse_decay(delta, self.wind.speed_kmh)
        else:
            factor = cosine_decay(delta)
        return self.spread_rate_mh * max(0.02, factor)

    def advance(self, minutes: float) -> None:
        """Hace crecer el frente `minutes` minutos simulados."""
        if minutes <= 0:
            return
        hours = minutes / 60.0
        for i in range(self.n_rays):
            self.radii_m[i] += self.effective_rate_mh(self.ray_bearing(i)) * hours

    def set_wind(self, wind: Wind, head_bearing_deg: float | None = None) -> None:
        """Cambia el viento. Por defecto la cabeza gira con él (opuesta a su procedencia)."""
        self.wind = wind
        self.head_bearing_deg = (
            float(head_bearing_deg) if head_bearing_deg is not None else head_bearing_from_wind(wind)
        )

    # -- geometría ---------------------------------------------------------------------

    def vertex(self, i: int) -> tuple[float, float]:
        """Vértice i como (lat, lon)."""
        return geo.destination(self.center_lat, self.center_lon, self.ray_bearing(i), self.radii_m[i])

    def ring(self) -> geo.Ring:
        pts: geo.Ring = []
        for i in range(self.n_rays):
            la, lo = self.vertex(i)
            pts.append([round(lo, 6), round(la, 6)])
        return geo.close_ring(pts)

    def perimeter_geojson(self) -> dict:
        return {"type": "Polygon", "coordinates": [self.ring()]}

    def area_m2(self) -> float:
        """Área exacta de la forma radial (sin pasar por lat/lon)."""
        dtheta = 2 * math.pi / self.n_rays
        acc = 0.0
        for i in range(self.n_rays):
            acc += self.radii_m[i] * self.radii_m[(i + 1) % self.n_rays]
        return 0.5 * acc * math.sin(dtheta)

    def area_ha(self) -> float:
        return self.area_m2() / 10_000.0

    def head_point(self) -> tuple[float, float]:
        """Punto de la cabeza del fuego (lat, lon), sobre `head_bearing_deg`."""
        r = self.radius_at_bearing(self.head_bearing_deg)
        return geo.destination(self.center_lat, self.center_lon, self.head_bearing_deg, r)

    def radius_at_bearing(self, bearing_deg: float) -> float:
        """Radio interpolado linealmente entre los dos rayos vecinos."""
        step = 360.0 / self.n_rays
        pos = (bearing_deg % 360.0) / step
        i0 = int(math.floor(pos)) % self.n_rays
        i1 = (i0 + 1) % self.n_rays
        frac = pos - math.floor(pos)
        return self.radii_m[i0] * (1 - frac) + self.radii_m[i1] * frac

    def distance_to_edge_m(self, lat: float, lon: float) -> float:
        """Distancia del punto al borde. Negativa si el punto ya está dentro."""
        b = geo.initial_bearing_deg(self.center_lat, self.center_lon, lat, lon)
        d = geo.haversine_m(self.center_lat, self.center_lon, lat, lon)
        return d - self.radius_at_bearing(b)

    def minutes_to_point(self, lat: float, lon: float) -> float:
        """Minutos hasta que el frente alcance el punto, con la tasa efectiva en su rumbo."""
        b = geo.initial_bearing_deg(self.center_lat, self.center_lon, lat, lon)
        gap = self.distance_to_edge_m(lat, lon)
        if gap <= 0:
            return 0.0
        return 60.0 * gap / self.effective_rate_mh(b)

    def is_in_head_cone(self, lat: float, lon: float) -> bool:
        """¿El punto cae en el cono de avance (contrato §2.3)?"""
        hlat, hlon = self.head_point()
        b = geo.initial_bearing_deg(hlat, hlon, lat, lon)
        return geo.angle_diff_deg(b, self.head_bearing_deg) <= self.cone_half_angle_deg

    # -- focos secundarios -------------------------------------------------------------

    def spot(
        self,
        distance_m: float,
        radius_m: float = 130.0,
        bearing_deg: float | None = None,
        front_id: str = "f-spot",
    ) -> "FireFront":
        """Crea un foco secundario por delante de la cabeza, en el rumbo del viento."""
        b = self.wind.downwind_bearing_deg if bearing_deg is None else bearing_deg
        hlat, hlon = self.head_point()
        slat, slon = geo.destination(hlat, hlon, b, distance_m)
        return FireFront.circular(
            slat,
            slon,
            radius_m,
            self.wind,
            self.spread_rate_mh,
            self.head_bearing_deg,
            n_rays=self.n_rays,
            spread_law=self.spread_law,
            cone_half_angle_deg=self.cone_half_angle_deg,
            front_id=front_id,
            label=f"foco secundario a {int(distance_m)} m",
        )


# ------------------------------------------------------------------------------- campo


@dataclass
class FireField:
    """Todos los frentes activos. El primario es el de mayor área."""

    fronts: list[FireFront] = field(default_factory=list)
    spotting: SpottingConfig = field(default_factory=SpottingConfig)
    include_secondary_perimeters: bool = True
    _spot_count: int = 0

    # -- acceso ------------------------------------------------------------------------

    @property
    def primary(self) -> FireFront:
        return max(self.fronts, key=lambda f: f.area_m2())

    @property
    def wind(self) -> Wind:
        return self.primary.wind

    @property
    def head_bearing_deg(self) -> float:
        return self.primary.head_bearing_deg

    def add_front(self, front: FireFront) -> FireFront:
        self.fronts.append(front)
        return front

    # -- evolución ---------------------------------------------------------------------

    def advance(self, minutes: float) -> None:
        for f in self.fronts:
            f.advance(minutes)

    def set_wind(self, wind: Wind, head_bearing_deg: float | None = None) -> None:
        for f in self.fronts:
            f.set_wind(wind, head_bearing_deg)

    def set_spread_rate(self, rate_mh: float) -> None:
        for f in self.fronts:
            f.spread_rate_mh = float(rate_mh)

    def force_spot(self, distance_m: float | None = None, radius_m: float | None = None) -> FireFront:
        """Genera un foco secundario ya (evento `spot_fire` del guion)."""
        src = self.primary
        d = distance_m if distance_m is not None else (self.spotting.min_distance_m + self.spotting.max_distance_m) / 2
        self._spot_count += 1
        front = src.spot(
            distance_m=d,
            radius_m=radius_m if radius_m is not None else self.spotting.radius_m,
            front_id=f"f-spot-{self._spot_count}",
        )
        return self.add_front(front)

    def maybe_spot(self, minutes: float, rng: random.Random) -> FireFront | None:
        """Tirada de dados por pavesas. Devuelve el foco nuevo o None."""
        cfg = self.spotting
        if cfg.probability_per_min <= 0 or self._spot_count >= cfg.max_spots:
            return None
        if self.primary.wind.speed_kmh < cfg.min_wind_kmh:
            return None
        p = 1.0 - (1.0 - min(1.0, cfg.probability_per_min)) ** max(0.0, minutes)
        if rng.random() >= p:
            return None
        d = rng.uniform(cfg.min_distance_m, cfg.max_distance_m)
        return self.force_spot(distance_m=d)

    # -- salida ------------------------------------------------------------------------

    def total_area_ha(self) -> float:
        return sum(f.area_ha() for f in self.fronts)

    def to_event_payload(self, t_iso: str) -> dict:
        """Cuerpo de `POST /events/fire` (contrato §3)."""
        p = self.primary
        payload = {
            "perimeter": p.perimeter_geojson(),
            "wind": p.wind.to_dict(),
            "spread_rate_mh": round(p.spread_rate_mh, 1),
            "head_bearing_deg": round(p.head_bearing_deg, 1),
            "cone_half_angle_deg": round(p.cone_half_angle_deg, 1),
            "t": t_iso,
        }
        others = [f for f in self.fronts if f is not p]
        if others and self.include_secondary_perimeters:
            # OJO: campo no presente en docs/06-producto/03-contrato-de-datos.md. Ver backend/engine/README.md
            # ("Deudas con el contrato"): un GeoJSON Polygon no puede llevar dos frentes
            # disjuntos, y la unión convexa reclamaría como quemado terreno que no lo está.
            payload["secondary_perimeters"] = [f.perimeter_geojson() for f in others]
        return payload

    def describe(self) -> str:
        p = self.primary
        extra = f", {len(self.fronts) - 1} foco(s) secundario(s)" if len(self.fronts) > 1 else ""
        return (
            f"area {self.total_area_ha():.0f} ha, cabeza {p.head_bearing_deg:.0f}deg "
            f"a {p.spread_rate_mh:.0f} m/h, viento del {p.wind.direction_deg:.0f}deg "
            f"{p.wind.speed_kmh:.0f} km/h{extra}"
        )


def build_front_from_spec(
    spec: dict,
    wind: Wind,
    spread_rate_mh: float,
    head_bearing_deg: float | None,
    n_rays: int = DEFAULT_N_RAYS,
    spread_law: str = "cosine",
    cone_half_angle_deg: float = DEFAULT_CONE_HALF_ANGLE_DEG,
    front_id: str = "f-1",
    label: str = "frente principal",
) -> FireFront:
    """Construye un frente desde el guion: `initial_polygon` o `center` + `radius_m`."""
    kwargs = dict(
        spread_law=spread_law,
        cone_half_angle_deg=cone_half_angle_deg,
        front_id=front_id,
        label=label,
    )
    if spec.get("initial_polygon"):
        return FireFront.from_geojson(
            spec["initial_polygon"], wind, spread_rate_mh, head_bearing_deg, n_rays=n_rays, **kwargs
        )
    center = spec.get("center")
    if not center:
        raise ValueError("un frente necesita `initial_polygon` o `center` + `radius_m`")
    return FireFront.circular(
        float(center["lat"]),
        float(center["lon"]),
        float(spec.get("radius_m", 400.0)),
        wind,
        spread_rate_mh,
        head_bearing_deg,
        n_rays=n_rays,
        **kwargs,
    )
