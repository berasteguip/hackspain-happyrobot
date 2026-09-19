"""Capa de rutas con tres implementaciones detrás de la misma interfaz.

`ROUTING_PROVIDER` elige la preferida (`straight` | `osrm` | `valhalla`). Si un proveedor falla,
**se cae al siguiente y se registra**: en una demo en vivo, quedarse sin ruta no es una opción, así
que la cadena termina siempre en `straight`, que no puede fallar.

- `straight`: línea recta a velocidad media. Si el segmento entra en el polígono del fuego o pisa
  una carretera cortada, mete un waypoint de rodeo perpendicular. Es el fallback de la demo.
- `osrm`: HTTP a un OSRM local. OSRM no sabe evitar polígonos, así que comprobamos la geometría
  devuelta contra las zonas prohibidas y marcamos `crosses_avoid`.
- `valhalla`: HTTP con `exclude_polygons` (sí sabe evitarlos). Geometría en polyline6.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Sequence

import httpx

from geo import (
    bearing_deg,
    decode_polyline,
    destination_point,
    encode_polyline,
    haversine_m,
    path_intersects_polygon,
    path_near_linestring,
)
from models import Route, utcnow_iso
from settings import settings

log = logging.getLogger("crisis.routing")

LatLon = tuple[float, float]


class RoutingError(RuntimeError):
    """El proveedor no pudo dar una ruta. Se cae al siguiente."""


@dataclass
class AvoidZones:
    """Zonas prohibidas: el fuego y las carreteras cortadas."""

    polygons: list[list[list[float]]] = field(default_factory=list)  # anillos [[lon, lat], ...]
    lines: list[list[list[float]]] = field(default_factory=list)  # [[lon, lat], ...]

    def empty(self) -> bool:
        return not self.polygons and not self.lines

    def path_is_blocked(self, path: Sequence[LatLon]) -> bool:
        pts = list(path)
        if any(path_intersects_polygon(pts, ring) for ring in self.polygons):
            return True
        return any(path_near_linestring(pts, line) for line in self.lines)


@dataclass
class RouteResult:
    polyline: str
    distance_m: float
    duration_s: int
    source: str
    points: list[LatLon] = field(default_factory=list)
    crosses_avoid: bool = False
    notes: list[str] = field(default_factory=list)

    def to_route(self) -> Route:
        return Route(
            polyline=self.polyline,
            distance_m=round(self.distance_m, 1),
            duration_s=int(self.duration_s),
            updated_at=utcnow_iso(),
            source=self.source,
        )


# ----------------------------------------------------------------------------------------
# Proveedores
# ----------------------------------------------------------------------------------------


class RoutingProvider:
    name = "base"

    def route(self, origin: LatLon, dest: LatLon, avoid: AvoidZones | None = None) -> RouteResult:
        raise NotImplementedError


class StraightProvider(RoutingProvider):
    """Nunca falla. Es el suelo de la cadena."""

    name = "straight"

    def __init__(self, speed_kmh: float | None = None) -> None:
        self.speed_kmh = speed_kmh or settings.straight_speed_kmh

    def route(self, origin: LatLon, dest: LatLon, avoid: AvoidZones | None = None) -> RouteResult:
        points = [origin, dest]
        notes: list[str] = []
        if avoid and not avoid.empty() and avoid.path_is_blocked(points):
            detour = self._detour_point(origin, dest, avoid)
            if detour is not None:
                points = [origin, detour, dest]
                notes.append("rodeo recto para no cruzar la zona prohibida")
        distance = sum(
            haversine_m(points[i][0], points[i][1], points[i + 1][0], points[i + 1][1])
            for i in range(len(points) - 1)
        )
        duration = int(distance / (self.speed_kmh * 1000 / 3600))
        crosses = bool(avoid and not avoid.empty() and avoid.path_is_blocked(points))
        if crosses:
            notes.append("la línea recta sigue pisando zona prohibida: ruta aproximada")
        return RouteResult(
            polyline=encode_polyline(points),
            distance_m=distance,
            duration_s=duration,
            source=self.name,
            points=points,
            crosses_avoid=crosses,
            notes=notes,
        )

    @staticmethod
    def _detour_point(origin: LatLon, dest: LatLon, avoid: AvoidZones) -> LatLon | None:
        """Waypoint perpendicular al tramo, probando los dos lados y varias distancias."""
        mid = ((origin[0] + dest[0]) / 2, (origin[1] + dest[1]) / 2)
        base = bearing_deg(origin[0], origin[1], dest[0], dest[1])
        span = max(1500.0, haversine_m(origin[0], origin[1], dest[0], dest[1]) * 0.6)
        for factor in (0.5, 1.0, 1.5):
            for side in (90.0, -90.0):
                cand = destination_point(mid[0], mid[1], base + side, span * factor)
                if not avoid.path_is_blocked([origin, cand, dest]):
                    return cand
        return None


class OsrmProvider(RoutingProvider):
    name = "osrm"

    def __init__(self, base_url: str | None = None, client: httpx.Client | None = None) -> None:
        self.base_url = (base_url or settings.osrm_url).rstrip("/")
        self._client = client

    def _get_client(self) -> httpx.Client:
        return self._client or httpx.Client(timeout=settings.routing_timeout_s)

    def route(self, origin: LatLon, dest: LatLon, avoid: AvoidZones | None = None) -> RouteResult:
        url = (
            f"{self.base_url}/route/v1/driving/"
            f"{origin[1]:.6f},{origin[0]:.6f};{dest[1]:.6f},{dest[0]:.6f}"
        )
        params = {"overview": "full", "geometries": "polyline", "alternatives": "false"}
        client = self._get_client()
        try:
            resp = client.get(url, params=params)
            resp.raise_for_status()
            data = resp.json()
        except Exception as exc:  # httpx.*, json, etc.
            raise RoutingError(f"osrm no respondió: {exc}") from exc
        finally:
            if self._client is None:
                client.close()
        if data.get("code") != "Ok" or not data.get("routes"):
            raise RoutingError(f"osrm sin ruta: {data.get('code')}")
        r = data["routes"][0]
        polyline = r.get("geometry") or ""
        points = decode_polyline(polyline)
        crosses = bool(avoid and not avoid.empty() and avoid.path_is_blocked(points))
        notes = ["osrm no evita polígonos: la ruta pisa zona prohibida"] if crosses else []
        return RouteResult(
            polyline=polyline,
            distance_m=float(r.get("distance", 0.0)),
            duration_s=int(r.get("duration", 0)),
            source=self.name,
            points=points,
            crosses_avoid=crosses,
            notes=notes,
        )


class ValhallaProvider(RoutingProvider):
    name = "valhalla"

    def __init__(self, base_url: str | None = None, client: httpx.Client | None = None) -> None:
        self.base_url = (base_url or settings.valhalla_url).rstrip("/")
        self._client = client

    def _get_client(self) -> httpx.Client:
        return self._client or httpx.Client(timeout=settings.routing_timeout_s)

    def route(self, origin: LatLon, dest: LatLon, avoid: AvoidZones | None = None) -> RouteResult:
        body: dict = {
            "locations": [
                {"lat": origin[0], "lon": origin[1]},
                {"lat": dest[0], "lon": dest[1]},
            ],
            "costing": "auto",
            "directions_options": {"units": "kilometers", "language": "es-ES"},
        }
        if avoid and avoid.polygons:
            # Valhalla espera [[ [lon, lat], ... ]] igual que GeoJSON.
            body["exclude_polygons"] = [list(ring) for ring in avoid.polygons]
        client = self._get_client()
        try:
            resp = client.post(f"{self.base_url}/route", json=body)
            resp.raise_for_status()
            data = resp.json()
        except Exception as exc:
            raise RoutingError(f"valhalla no respondió: {exc}") from exc
        finally:
            if self._client is None:
                client.close()
        legs = (data.get("trip") or {}).get("legs") or []
        summary = (data.get("trip") or {}).get("summary") or {}
        if not legs:
            raise RoutingError("valhalla sin legs")
        shape = legs[0].get("shape") or ""
        points = decode_polyline(shape, precision=6)  # Valhalla usa polyline6
        distance_km = float(summary.get("length", 0.0))
        duration_s = int(summary.get("time", 0))
        crosses = bool(avoid and avoid.lines and avoid.path_is_blocked(points))
        return RouteResult(
            # re-encodamos a precisión 5 para que todo el sistema hable un solo formato
            polyline=encode_polyline(points) if points else shape,
            distance_m=distance_km * 1000.0,
            duration_s=duration_s,
            source=self.name,
            points=points,
            crosses_avoid=crosses,
            notes=["valhalla: ruta pisa una carretera cortada"] if crosses else [],
        )


# ----------------------------------------------------------------------------------------
# Cadena con fallback
# ----------------------------------------------------------------------------------------

PROVIDERS: dict[str, type[RoutingProvider]] = {
    "straight": StraightProvider,
    "osrm": OsrmProvider,
    "valhalla": ValhallaProvider,
    # El contrato §5 escribió `google` como opción; no hay cliente de Google Maps en el backend
    # (Maps se usa desde HappyRobot), así que lo tratamos como alias de `straight` y lo avisamos.
    "google": StraightProvider,
}


MAX_CONSECUTIVE_FAILURES = 3


class RoutingChain:
    """Preferido primero, `straight` al final. Registra cada caída.

    `ROUTING_PROVIDER` acepta una lista separada por comas (`valhalla,osrm,straight`) si se quiere
    una cadena explícita. Con un solo valor la cadena es `[preferido, straight]`.

    Cortocircuito: si un proveedor falla `MAX_CONSECUTIVE_FAILURES` veces seguidas se desactiva
    durante el resto de la ejecución. Con 120 personas y un OSRM caído, esperar el timeout en cada
    una se come la demo.
    """

    def __init__(self, providers: Sequence[RoutingProvider] | None = None) -> None:
        self.providers = list(providers) if providers is not None else self._from_settings()
        self.fallback_events: list[str] = []
        self._failures: dict[str, int] = {}
        self._disabled: set[str] = set()

    @staticmethod
    def _from_settings() -> list[RoutingProvider]:
        raw = (settings.routing_provider or "straight").replace(" ", "")
        names = [n for n in raw.split(",") if n]
        resolved: list[str] = []
        for name in names:
            if name not in PROVIDERS:
                log.warning("ROUTING_PROVIDER=%s desconocido; se ignora", name)
                continue
            if name == "google":
                log.warning(
                    "ROUTING_PROVIDER=google no está implementado en la API "
                    "(Maps se usa desde HappyRobot); se trata como straight"
                )
                name = "straight"
            if name not in resolved:
                resolved.append(name)
        if not resolved:
            resolved = ["straight"]
        if "straight" not in resolved:
            resolved.append("straight")  # suelo garantizado
        return [PROVIDERS[name]() for name in resolved]

    def route(self, origin: LatLon, dest: LatLon, avoid: AvoidZones | None = None) -> RouteResult:
        errors: list[str] = []
        for provider in self.providers:
            if provider.name in self._disabled:
                continue
            try:
                result = provider.route(origin, dest, avoid)
                self._failures[provider.name] = 0
                if errors:
                    result.notes.extend(errors)
                    self.fallback_events.extend(errors)
                return result
            except Exception as exc:  # incluye RoutingError
                count = self._failures.get(provider.name, 0) + 1
                self._failures[provider.name] = count
                msg = f"{provider.name} falló ({exc}); se prueba el siguiente proveedor"
                log.warning(msg)
                errors.append(msg)
                if count >= MAX_CONSECUTIVE_FAILURES:
                    self._disabled.add(provider.name)
                    log.error(
                        "proveedor %s desactivado tras %d fallos seguidos", provider.name, count
                    )
        # Imposible en la práctica: StraightProvider no lanza. Pero no dejamos la demo sin ruta.
        log.error("todos los proveedores fallaron; ruta recta de emergencia")
        result = StraightProvider().route(origin, dest, avoid)
        result.notes.extend(errors)
        self.fallback_events.extend(errors)
        return result


_chain: RoutingChain | None = None


def get_chain() -> RoutingChain:
    global _chain
    if _chain is None:
        _chain = RoutingChain()
        log.info(
            "cadena de rutas: %s", " → ".join(p.name for p in _chain.providers)
        )
    return _chain


def set_chain(chain: RoutingChain | None) -> None:
    """Inyección para tests."""
    global _chain
    _chain = chain


def avoid_zones_from_state(state) -> AvoidZones:
    """El fuego y las carreteras cortadas, en el formato que entiende la capa de rutas."""
    polygons: list[list[list[float]]] = []
    if getattr(state, "fire", None) is not None:
        ring = state.fire.perimeter.ring()
        if len(ring) >= 3:
            polygons.append(ring)
    lines = [
        rc.geometry.coordinates
        for rc in state.road_closures.values()
        if rc.geometry and rc.geometry.coordinates
    ]
    return AvoidZones(polygons=polygons, lines=lines)


def route_between(
    origin: LatLon, dest: LatLon, avoid: AvoidZones | None = None
) -> RouteResult:
    return get_chain().route(origin, dest, avoid)
