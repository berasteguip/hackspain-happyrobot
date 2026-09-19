"""Carga y ejecución de un guion de escenario declarativo (YAML).

El motor no es un guion de la demo: es el componente que hace que el sistema tenga algo a lo que
adaptarse. Entre dos eventos del timeline el fuego sigue creciendo y el motor sigue empujando
`POST /events/fire`, así que la situación cambia **siempre**, no solo en los momentos del guion.

## Cómo mapea cada tipo de evento a la API (contrato §3)

| Evento del guion   | Qué hace el motor |
|--------------------|-------------------|
| `fire_declared`    | `POST /events/fire` con el perímetro inicial |
| `wind_shift`       | gira la cabeza (opuesta a la procedencia del viento) y `POST /events/fire` |
| `road_closed`      | `POST /events/road-closure` |
| `road_reopened`    | `POST /human/override` sobre la `RoadClosure` (ver deudas en el README) |
| `exit_threatened`  | `POST /events/exit-threatened` |
| `exit_closed`      | `POST /human/override` -> `SafeZone.status = "closed"` |
| `spot_fire`        | nuevo frente por pavesas + `POST /events/fire` |
| `person_stalled`   | `POST /positions` repitiendo la misma posición (así es como se ve un parado de verdad) |
| `person_wrong_way` | `POST /positions` acercándose al frente |
| `person_answers`   | `POST /calls/outcome` con `answered: true` |
| `patrol_reports`   | `POST /human/override` sobre la `House` (`empty`, `occupants_refuse`, ...) |
| `new_people_appear`| N x `POST /calls/outcome` (la capa 0: gente que llama al número del ES-Alert) |
| `integration_down` | silencia un canal de envío durante N minutos, avisando por consola |

Decisión deliberada: `person_stalled` y `person_wrong_way` **no** inventan endpoints. Un parón y
un desvío son realidades del GPS, así que se cuentan por `POST /positions` y es la API quien
decide que eso es `at_risk`. El motor mueve el mundo; el juicio es del sistema.
"""

from __future__ import annotations

import json
import math
import random
import sys
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Iterable, TextIO

import yaml

from . import geo
from .clock import SimClock
from .client import CrisisApiClient
from .fire_model import (
    DEFAULT_CONE_HALF_ANGLE_DEG,
    DEFAULT_N_RAYS,
    FireField,
    SpottingConfig,
    Wind,
    build_front_from_spec,
    head_bearing_from_wind,
)

EVENT_TYPES = (
    "fire_declared",
    "wind_shift",
    "road_closed",
    "road_reopened",
    "exit_threatened",
    "exit_closed",
    "spot_fire",
    "person_stalled",
    "person_wrong_way",
    "person_answers",
    "patrol_reports",
    "new_people_appear",
    "integration_down",
)

# Canales de envío que puede tumbar `integration_down`.
INTEGRATION_CHANNELS = {
    "gps": {"positions"},
    "happyrobot": {"calls"},
    "positions": {"positions"},
    "calls": {"calls"},
    "api": {"fire", "positions", "calls", "roads", "exits", "overrides"},
    "routing": set(),  # vive en `api/`: aquí solo se anuncia
}

SYNTHETIC_PHONE_PREFIX = "+3460099"  # rango reservado del contrato §1


# --------------------------------------------------------------------------------- consola


class Console:
    """Salida legible. Esta consola se enseña en la demo, así que cada línea cuenta."""

    TAG_WIDTH = 17

    def __init__(self, stream: TextIO | None = None, show_payloads: bool = False) -> None:
        self.stream = stream or sys.stdout
        self.show_payloads = show_payloads

    def write(self, text: str = "") -> None:
        self.stream.write(text + "\n")
        self.stream.flush()

    def banner(self, text: str) -> None:
        self.write("")
        self.write(f"=== {text}")

    def event(self, stamp: str, tag: str, text: str, prefix: str = "") -> None:
        self.write(f"[{stamp}] {prefix}{tag.upper():<{self.TAG_WIDTH}}{text}")

    def sub(self, text: str) -> None:
        self.write(f"{'':<27}{text}")


# ------------------------------------------------------------------------------ estructuras


@dataclass
class ScenarioEvent:
    at_min: float
    type: str
    note: str | None = None
    data: dict = field(default_factory=dict)

    def get(self, key: str, default: Any = None) -> Any:
        return self.data.get(key, default)


@dataclass
class Settings:
    time_scale: float | None = None
    ends_at_min: float | None = None
    fire_push_interval_sim_s: float = 30.0
    fire_log_every_min: float = 4.0
    position_interval_sim_s: float = 30.0
    position_log_every_min: float = 1.0
    n_rays: int = DEFAULT_N_RAYS
    spread_law: str = "cosine"
    cone_half_angle_deg: float = DEFAULT_CONE_HALF_ANGLE_DEG
    seed: int = 20260718
    reset_on_start: bool = True
    include_secondary_perimeters: bool = True

    @classmethod
    def from_dict(cls, d: dict | None) -> "Settings":
        d = dict(d or {})
        known = {f for f in cls.__dataclass_fields__}  # type: ignore[attr-defined]
        unknown = set(d) - known
        if unknown:
            raise ValueError(f"settings desconocidos en el guion: {sorted(unknown)}")
        return cls(**d)


@dataclass
class Behaviour:
    """Comportamiento continuo de una persona (parada o yendo hacia el fuego)."""

    kind: str
    person_id: str
    lat: float
    lon: float
    until_min: float
    next_push_min: float
    next_log_min: float
    last_move_min: float = 0.0
    speed_kmh: float = 0.0


@dataclass
class Outage:
    integration: str
    channels: set[str]
    until_min: float


class Scenario:
    def __init__(self, raw: dict, source: Path | None = None) -> None:
        self.raw = raw
        self.source = source
        self.name: str = str(raw.get("name") or (source.stem if source else "sin-nombre"))
        self.starts_at = _parse_iso(raw.get("starts_at"))
        fire = raw.get("fire") or {}
        if not fire:
            raise ValueError("el guion necesita un bloque `fire`")
        self.fire_spec = fire
        self.wind = Wind.from_dict(fire["wind"])
        self.spread_rate_mh = float(fire.get("spread_rate_mh", 1200.0))
        self.head_bearing_deg = (
            float(fire["head_bearing_deg"]) if fire.get("head_bearing_deg") is not None else None
        )
        self.settings = Settings.from_dict(raw.get("settings"))
        self.spotting = SpottingConfig.from_dict(fire.get("spotting"))
        self.timeline = self._parse_timeline(raw.get("timeline") or [])

    # -- carga -------------------------------------------------------------------------

    @staticmethod
    def _parse_timeline(items: Iterable[dict]) -> list[ScenarioEvent]:
        events: list[ScenarioEvent] = []
        for i, item in enumerate(items):
            if "type" not in item:
                raise ValueError(f"evento #{i} sin `type`")
            etype = str(item["type"])
            if etype not in EVENT_TYPES:
                raise ValueError(
                    f"evento #{i}: tipo '{etype}' desconocido. Tipos validos: {', '.join(EVENT_TYPES)}"
                )
            if "at_min" not in item:
                raise ValueError(f"evento #{i} ({etype}) sin `at_min`")
            data = {k: v for k, v in item.items() if k not in ("at_min", "type", "note")}
            events.append(
                ScenarioEvent(
                    at_min=float(item["at_min"]),
                    type=etype,
                    note=item.get("note"),
                    data=data,
                )
            )
        return sorted(events, key=lambda e: e.at_min)

    @classmethod
    def load(cls, path: str | Path) -> "Scenario":
        p = Path(path)
        if not p.exists():
            raise FileNotFoundError(f"no existe el guion {p}")
        with p.open("r", encoding="utf-8") as fh:
            raw = yaml.safe_load(fh) or {}
        return cls(raw, source=p)

    # -- derivados ---------------------------------------------------------------------

    @property
    def end_min(self) -> float:
        if self.settings.ends_at_min is not None:
            return float(self.settings.ends_at_min)
        last = max((e.at_min for e in self.timeline), default=0.0)
        return last + 4.0

    def build_field(self) -> FireField:
        """Construye el estado inicial del fuego (uno o varios frentes)."""
        s = self.settings
        head = self.head_bearing_deg if self.head_bearing_deg is not None else head_bearing_from_wind(self.wind)
        main = build_front_from_spec(
            self.fire_spec,
            self.wind,
            self.spread_rate_mh,
            head,
            n_rays=s.n_rays,
            spread_law=s.spread_law,
            cone_half_angle_deg=s.cone_half_angle_deg,
            front_id="f-1",
            label="frente principal",
        )
        fronts = [main]
        for i, extra in enumerate(self.fire_spec.get("extra_fronts") or [], start=2):
            fronts.append(
                build_front_from_spec(
                    extra,
                    Wind.from_dict(extra["wind"]) if extra.get("wind") else self.wind,
                    float(extra.get("spread_rate_mh", self.spread_rate_mh)),
                    float(extra["head_bearing_deg"]) if extra.get("head_bearing_deg") is not None else head,
                    n_rays=s.n_rays,
                    spread_law=s.spread_law,
                    cone_half_angle_deg=s.cone_half_angle_deg,
                    front_id=f"f-{i}",
                    label=str(extra.get("label", f"frente {i}")),
                )
            )
        return FireField(
            fronts=fronts,
            spotting=self.spotting,
            include_secondary_perimeters=s.include_secondary_perimeters,
        )


def _parse_iso(value: Any) -> datetime:
    if value is None:
        return datetime.now(timezone.utc)
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    text = str(value).strip().replace("Z", "+00:00")
    dt = datetime.fromisoformat(text)
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


# --------------------------------------------------------------------------------- runner


class ScenarioRunner:
    def __init__(
        self,
        scenario: Scenario,
        client: CrisisApiClient,
        clock: SimClock,
        console: Console | None = None,
        rng: random.Random | None = None,
    ) -> None:
        self.scenario = scenario
        self.settings = scenario.settings
        self.client = client
        self.clock = clock
        self.console = console or Console()
        self.rng = rng or random.Random(self.settings.seed)
        self.field = scenario.build_field()
        self.behaviours: list[Behaviour] = []
        self.outages: list[Outage] = []
        self._fire_t = 0.0
        self._next_fire_push = 0.0
        self._last_fire_log = -999.0
        self._synthetic_seq = 900
        self.prefix = ""

    # -- helpers de envío --------------------------------------------------------------

    def _post(self, path: str, payload: dict, channel: str, quiet: bool = False) -> Any:
        r = self.client.post(path, payload, channel=channel)
        if quiet:
            return r
        if self.client.dry_run:
            status = "dry-run"
        elif r.status is not None:
            status = str(r.status)
        else:
            status = "sin respuesta"
        extra = f" v{r.state_version}" if r.state_version is not None else ""
        self.console.sub(f"-> POST {path} [{status}]{extra}")
        if self.console.show_payloads or self.client.dry_run:
            self.console.sub(f"   {_preview(payload)}")
        for d in r.decisions[:5]:
            self.console.sub(
                f"   <- {d.get('type', '?')} {d.get('subject_id', '')}: {d.get('reason', '')}".rstrip()
            )
        return r

    def _push_fire(self, reason: str = "", force_log: bool = False) -> None:
        payload = self.field.to_event_payload(self.clock.iso())
        now = self.clock.sim_minutes
        loud = force_log or (now - self._last_fire_log) >= self.settings.fire_log_every_min
        if loud:
            self._last_fire_log = now
            text = self.field.describe()
            if reason:
                text = f"{text} ({reason})"
            self.console.event(self.clock.stamp(), "fire_update", text, self.prefix)
            self._post("/events/fire", payload, channel="fire")
        else:
            self._post("/events/fire", payload, channel="fire", quiet=True)

    # -- ciclo de vida -----------------------------------------------------------------

    def run(self, from_min: float = 0.0, until_min: float | None = None) -> None:
        end = float(until_min) if until_min is not None else self.scenario.end_min
        sc = self.scenario
        self.console.banner(
            f"escenario '{sc.name}' | inicio {sc.starts_at.strftime('%Y-%m-%d %H:%MZ')} | "
            f"{len(sc.timeline)} eventos | 0 -> {end:g} min simulados | "
            f"time_scale={self.clock.time_scale:g}{' (instantaneo)' if self.clock.instant else ''}"
        )
        self.console.write(
            f"    API {self.client.base_url}"
            f"{'  [DRY-RUN: no se envia nada]' if self.client.dry_run else ''}"
        )
        self.console.write(
            f"    fuego inicial: {self.field.describe()} | ley de propagacion "
            f"'{self.settings.spread_law}' | {self.settings.n_rays} rayos"
        )
        self.console.write("")

        if self.settings.reset_on_start:
            self.console.event(self.clock.stamp(), "reset", f"reinicio el estado del escenario '{sc.name}'")
            self._post("/reset", {"scenario": sc.name}, channel="fire")

        idx = 0
        if from_min > 0:
            idx = self._catch_up(from_min)
        else:
            self.clock.seek(0.0)
            self._fire_t = 0.0

        self._next_fire_push = self.clock.sim_minutes
        while True:
            now = self.clock.sim_minutes
            if now >= end:
                break
            candidates = [end, self._next_fire_push]
            if idx < len(sc.timeline):
                candidates.append(sc.timeline[idx].at_min)
            candidates += [b.next_push_min for b in self.behaviours]
            candidates += [o.until_min for o in self.outages]
            target = min(c for c in candidates if c > now - 1e-9)
            self.clock.sleep_until(target)
            now = self.clock.sim_minutes

            self._advance_fire_to(now)
            if now + 1e-9 >= self._next_fire_push:
                self._push_fire()
                step = max(1e-3, self.settings.fire_push_interval_sim_s / 60.0)
                while self._next_fire_push <= now:
                    self._next_fire_push += step
            while idx < len(sc.timeline) and sc.timeline[idx].at_min <= now + 1e-9:
                self.dispatch(sc.timeline[idx])
                idx += 1
            self._step_behaviours(now)
            self._expire_outages(now)

        self._advance_fire_to(end)
        self._push_fire(reason="estado final", force_log=True)
        self.console.banner("fin del escenario")
        self.console.write(f"    {self.client.summary()}")
        self.console.write(f"    fuego final: {self.field.describe()}")

    def _catch_up(self, from_min: float) -> int:
        """Arranca en `from_min`: aplica de golpe todo lo anterior. Ensayar la demo sin esperar."""
        self.console.event("catch-up", "fast_forward", f"pongo el mundo al dia hasta t+{from_min:g} min")
        self.prefix = "~ "
        self.clock.seek(0.0)
        self._fire_t = 0.0
        idx = 0
        tl = self.scenario.timeline
        while idx < len(tl) and tl[idx].at_min <= from_min + 1e-9:
            ev = tl[idx]
            self.clock.seek(ev.at_min)
            self._advance_fire_to(ev.at_min)
            self.dispatch(ev)
            idx += 1
        self.clock.seek(from_min)
        self._advance_fire_to(from_min)
        self.prefix = ""
        self.behaviours = [b for b in self.behaviours if b.until_min > from_min]
        self.outages = [o for o in self.outages if o.until_min > from_min]
        self._push_fire(reason="estado al empezar el ensayo", force_log=True)
        self.console.write("")
        return idx

    def _advance_fire_to(self, sim_min: float) -> None:
        dt = sim_min - self._fire_t
        if dt <= 0:
            return
        self.field.advance(dt)
        self._fire_t = sim_min
        spot = self.field.maybe_spot(dt, self.rng)
        if spot is not None:
            d = geo.haversine_m(
                self.field.primary.center_lat, self.field.primary.center_lon, spot.center_lat, spot.center_lon
            )
            self.console.event(
                self.clock.stamp(),
                "spot_fire",
                f"PAVESAS: foco secundario {spot.front_id} a {d / 1000:.1f} km a favor del viento "
                f"({spot.center_lat:.4f}, {spot.center_lon:.4f}). Hay fuego DETRAS de quien esta saliendo.",
                self.prefix,
            )
            self._push_fire(reason="foco secundario", force_log=True)

    # -- eventos -----------------------------------------------------------------------

    def dispatch(self, ev: ScenarioEvent) -> None:
        handler: Callable[[ScenarioEvent], None] | None = getattr(self, f"_ev_{ev.type}", None)
        if handler is None:  # imposible: el loader valida los tipos
            self.console.event(self.clock.stamp(), "error", f"sin handler para '{ev.type}'", self.prefix)
            return
        handler(ev)

    def _say(self, ev: ScenarioEvent, text: str) -> None:
        note = f"  \"{ev.note}\"" if ev.note else ""
        self.console.event(self.clock.stamp(), ev.type, f"{text}{note}", self.prefix)

    # fuego ---------------------------------------------------------------------------

    def _ev_fire_declared(self, ev: ScenarioEvent) -> None:
        self._say(ev, f"INCENDIO DECLARADO. {self.field.describe()}")
        self._push_fire(reason="perimetro inicial", force_log=False)

    def _ev_wind_shift(self, ev: ScenarioEvent) -> None:
        to = ev.get("to") or {}
        if not to:
            raise ValueError("wind_shift necesita `to: {direction_deg, speed_kmh}`")
        new_wind = Wind.from_dict(to)
        old_head = self.field.head_bearing_deg
        override = ev.get("head_bearing_deg")
        self.field.set_wind(new_wind, float(override) if override is not None else None)
        if ev.get("spread_rate_mh") is not None:
            self.field.set_spread_rate(float(ev.get("spread_rate_mh")))
        gust = f", rachas {new_wind.gusts_kmh:.0f} km/h" if new_wind.gusts_kmh else ""
        self._say(
            ev,
            f"el viento pasa a venir del {new_wind.direction_deg:.0f}deg a {new_wind.speed_kmh:.0f} km/h{gust}: "
            f"la cabeza gira de {old_head:.0f}deg a {self.field.head_bearing_deg:.0f}deg",
        )
        self._push_fire(reason="giro de viento", force_log=True)

    def _ev_spot_fire(self, ev: ScenarioEvent) -> None:
        distance = ev.get("distance_m")
        front = self.field.force_spot(
            distance_m=float(distance) if distance is not None else None,
            radius_m=float(ev.get("radius_m")) if ev.get("radius_m") is not None else None,
        )
        d = geo.haversine_m(
            self.field.primary.center_lat, self.field.primary.center_lon, front.center_lat, front.center_lon
        )
        self._say(
            ev,
            f"PAVESAS: foco secundario {front.front_id} a {d / 1000:.1f} km a favor del viento "
            f"({front.center_lat:.4f}, {front.center_lon:.4f})",
        )
        self._push_fire(reason="foco secundario", force_log=True)

    # carreteras y salidas -------------------------------------------------------------

    def _ev_road_closed(self, ev: ScenarioEvent) -> None:
        road = ev.get("road_name", "sin nombre")
        payload = {
            "road_name": road,
            "reason": ev.get("reason", "sin especificar"),
            "since": self.clock.iso(),
            "source": ev.get("source", "scenario-engine"),
        }
        if ev.get("geometry"):
            payload["geometry"] = ev.get("geometry")
        self._say(ev, f"CARRETERA CORTADA {road}: {payload['reason']}")
        self._post("/events/road-closure", payload, channel="roads")

    def _ev_road_reopened(self, ev: ScenarioEvent) -> None:
        road = ev.get("road_name", "sin nombre")
        self._say(ev, f"carretera reabierta {road}")
        self._post(
            "/human/override",
            {
                "subject_type": "road_closure",
                "subject_id": ev.get("closure_id", road),
                "field": "open",
                "value": True,
                "reason": ev.get("reason", "la via vuelve a ser practicable"),
                "operator": ev.get("source", "scenario-engine"),
            },
            channel="overrides",
        )

    def _ev_exit_threatened(self, ev: ScenarioEvent) -> None:
        exit_id = ev.get("exit_id")
        reason = ev.get("reason", "el cono de avance del fuego apunta a la zona de salida")
        self._say(ev, f"ZONA DE SALIDA AMENAZADA {exit_id}: {reason}")
        self._post("/events/exit-threatened", {"exit_id": exit_id, "reason": reason}, channel="exits")

    def _ev_exit_closed(self, ev: ScenarioEvent) -> None:
        exit_id = ev.get("exit_id")
        reason = ev.get("reason", "zona de salida perdida")
        self._say(ev, f"ZONA DE SALIDA CERRADA {exit_id}: {reason}. Todas las rutas hacia alli dejan de valer")
        self._post(
            "/human/override",
            {
                "subject_type": "safe_zone",
                "subject_id": exit_id,
                "field": "status",
                "value": "closed",
                "reason": reason,
                "operator": ev.get("source", "scenario-engine"),
            },
            channel="overrides",
        )

    # personas -------------------------------------------------------------------------

    def _person_position(self, ev: ScenarioEvent, person_id: str) -> tuple[float, float] | None:
        if ev.get("lat") is not None and ev.get("lon") is not None:
            return float(ev.get("lat")), float(ev.get("lon"))
        r = self.client.get(f"/people/{person_id}", channel="read")
        if r.ok and isinstance(r.body, dict) and r.body.get("lat") is not None:
            return float(r.body["lat"]), float(r.body["lon"])
        return None

    def _ev_person_stalled(self, ev: ScenarioEvent) -> None:
        pid = str(ev.get("person_id"))
        minutes = float(ev.get("minutes", 5.0))
        pos = self._person_position(ev, pid)
        if pos is None:
            self._say(ev, f"{pid} se para {minutes:g} min, pero no se su posicion (ni en el guion ni en la API)")
            return
        lat, lon = pos
        now = self.clock.sim_minutes
        self.behaviours.append(
            Behaviour(
                kind="stalled",
                person_id=pid,
                lat=lat,
                lon=lon,
                until_min=now + minutes,
                next_push_min=now,
                next_log_min=now,
            )
        )
        mins = self.field.primary.minutes_to_point(lat, lon)
        self._say(
            ev,
            f"{pid} SE PARA {minutes:g} min en ({lat:.4f}, {lon:.4f}); el frente lo alcanza en {mins:.0f} min",
        )

    def _ev_person_wrong_way(self, ev: ScenarioEvent) -> None:
        pid = str(ev.get("person_id"))
        minutes = float(ev.get("minutes", 6.0))
        speed = float(ev.get("speed_kmh", 34.0))
        pos = self._person_position(ev, pid)
        if pos is None:
            self._say(ev, f"{pid} va hacia el fuego, pero no se su posicion (ni en el guion ni en la API)")
            return
        lat, lon = pos
        now = self.clock.sim_minutes
        self.behaviours.append(
            Behaviour(
                kind="wrong_way",
                person_id=pid,
                lat=lat,
                lon=lon,
                until_min=now + minutes,
                next_push_min=now,
                next_log_min=now,
                # Sin esto el primer paso usaria dt = now - 0 y teletransportaria a la
                # persona decenas de km (el reloj llega al evento en t+66, no en t+0).
                last_move_min=now,
                speed_kmh=speed,
            )
        )
        self._say(
            ev,
            f"{pid} VA HACIA EL FUEGO a {speed:.0f} km/h desde ({lat:.4f}, {lon:.4f}); "
            f"el frente lo alcanza en {self.field.primary.minutes_to_point(lat, lon):.0f} min",
        )

    def _step_behaviours(self, now: float) -> None:
        alive: list[Behaviour] = []
        for b in self.behaviours:
            if now >= b.until_min:
                self.console.event(
                    self.clock.stamp(),
                    "behaviour_end",
                    f"{b.person_id} deja de {'estar parado' if b.kind == 'stalled' else 'ir hacia el fuego'}",
                    self.prefix,
                )
                continue
            if now + 1e-9 >= b.next_push_min:
                if b.kind == "wrong_way":
                    dt_min = max(0.0, now - b.last_move_min)
                    step_m = b.speed_kmh * 1000.0 / 60.0 * dt_min
                    head_lat, head_lon = self.field.primary.head_point()
                    bearing = geo.initial_bearing_deg(b.lat, b.lon, head_lat, head_lon)
                    b.lat, b.lon = geo.destination(b.lat, b.lon, bearing, step_m)
                b.last_move_min = now
                self._post(
                    "/positions",
                    {
                        "person_id": b.person_id,
                        "lat": round(b.lat, 6),
                        "lon": round(b.lon, 6),
                        "accuracy_m": 12,
                        "t": self.clock.iso(),
                    },
                    channel="positions",
                    quiet=True,
                )
                step = max(1e-3, self.settings.position_interval_sim_s / 60.0)
                while b.next_push_min <= now:
                    b.next_push_min += step
                if now + 1e-9 >= b.next_log_min:
                    b.next_log_min = now + self.settings.position_log_every_min
                    mins = self.field.primary.minutes_to_point(b.lat, b.lon)
                    in_cone = " DENTRO DEL CONO" if self.field.primary.is_in_head_cone(b.lat, b.lon) else ""
                    verb = "sigue parado en" if b.kind == "stalled" else "sigue acercandose al fuego en"
                    self.console.event(
                        self.clock.stamp(),
                        "position",
                        f"{b.person_id} {verb} ({b.lat:.4f}, {b.lon:.4f}); frente a {mins:.0f} min{in_cone}",
                        self.prefix,
                    )
            alive.append(b)
        self.behaviours = alive

    def _ev_person_answers(self, ev: ScenarioEvent) -> None:
        pid = str(ev.get("person_id"))
        extracted = {
            "people_at_home": int(ev.get("people_at_home", 2)),
            "declared_location": ev.get("declared_location"),
            "declared_lat": ev.get("lat"),
            "declared_lon": ev.get("lon"),
            "mobility": ev.get("mobility", "car"),
            "has_car": bool(ev.get("has_car", True)),
            "seats_free": int(ev.get("seats_free", 0)),
            "has_smartphone": bool(ev.get("has_smartphone", True)),
            "consent_position": bool(ev.get("consent_position", True)),
            "will_evacuate": bool(ev.get("will_evacuate", True)),
            "neighbors_mentioned": ev.get("neighbors_mentioned", []),
            "vulnerable_people": ev.get("vulnerable_people", []),
        }
        self._say(ev, f"CONTESTA {pid} (la casa que no cogia el telefono): {extracted['people_at_home']} en casa")
        self._post(
            "/calls/outcome",
            {
                "run_id": f"sim_{self.scenario.name}_{pid}_{int(self.clock.sim_minutes)}",
                "person_id": pid,
                "phone": ev.get("phone", f"{SYNTHETIC_PHONE_PREFIX}{abs(hash(pid)) % 10000:04d}"),
                "answered": True,
                "duration_s": int(ev.get("duration_s", 72)),
                "extracted": extracted,
                "agent_notes": ev.get("note") or "devuelve la llamada tras dos intentos",
                "transcript_url": None,
            },
            channel="calls",
        )

    def _ev_patrol_reports(self, ev: ScenarioEvent) -> None:
        house_id = str(ev.get("house_id"))
        result = str(ev.get("result", "empty"))
        patrol = str(ev.get("patrol_id", "pt-1"))
        self._say(ev, f"LA PATRULLA {patrol} informa de {house_id}: {result}")
        self._post(
            "/human/override",
            {
                "subject_type": "house",
                "subject_id": house_id,
                "field": "status",
                "value": result,
                "reason": ev.get("reason", f"parte de la patrulla {patrol} sobre el terreno"),
                "operator": f"patrol:{patrol}",
            },
            channel="overrides",
        )

    def _ev_new_people_appear(self, ev: ScenarioEvent) -> None:
        count = int(ev.get("count", 15))
        near = ev.get("near") or {}
        lat0 = float(near.get("lat", self.field.primary.center_lat))
        lon0 = float(near.get("lon", self.field.primary.center_lon))
        radius = float(near.get("radius_m", 2500.0))
        village = ev.get("village", "sin identificar")
        self._say(
            ev,
            f"APARECEN {count} PERSONAS MAS ({village}): llamadas entrantes al numero del ES-Alert. "
            f"La cola se reordena con {count} desconocidos dentro",
        )
        for _ in range(count):
            self._synthetic_seq += 1
            pid = f"p-{self._synthetic_seq}"
            b = self.rng.uniform(0, 360)
            d = radius * math.sqrt(self.rng.random())
            plat, plon = geo.destination(lat0, lon0, b, d)
            self._post(
                "/calls/outcome",
                {
                    "run_id": f"sim_inbound_{pid}",
                    "person_id": pid,
                    "phone": f"{SYNTHETIC_PHONE_PREFIX}{self._synthetic_seq:04d}",
                    "answered": True,
                    "duration_s": self.rng.randint(35, 120),
                    "extracted": {
                        "people_at_home": self.rng.randint(1, 4),
                        "declared_location": village,
                        "declared_lat": round(plat, 6),
                        "declared_lon": round(plon, 6),
                        "mobility": self.rng.choice(["car", "car", "walking", "reduced"]),
                        "has_car": True,
                        "seats_free": self.rng.randint(0, 3),
                        "has_smartphone": True,
                        "consent_position": True,
                        "will_evacuate": True,
                        "neighbors_mentioned": [],
                        "vulnerable_people": [],
                    },
                    "agent_notes": "inbound tras el ES-Alert (DATOS SINTETICOS)",
                    "transcript_url": None,
                },
                channel="calls",
                quiet=True,
            )
        self.console.sub(f"-> POST /calls/outcome x{count} (inbound sinteticos, telefonos {SYNTHETIC_PHONE_PREFIX}xxxx)")

    def _ev_integration_down(self, ev: ScenarioEvent) -> None:
        integration = str(ev.get("integration", "gps"))
        minutes = float(ev.get("minutes", 4.0))
        channels = INTEGRATION_CHANNELS.get(integration)
        if channels is None:
            channels = {integration}
        self.client.suppress(set(channels))
        self.outages.append(
            Outage(integration=integration, channels=set(channels), until_min=self.clock.sim_minutes + minutes)
        )
        detail = ", ".join(sorted(channels)) if channels else "ninguno en el motor (vive en api/)"
        self._say(
            ev,
            f"INTEGRACION CAIDA '{integration}' durante {minutes:g} min. Canales silenciados: {detail}. "
            f"El sistema tiene que decidir con datos que se congelan",
        )

    def _expire_outages(self, now: float) -> None:
        alive: list[Outage] = []
        for o in self.outages:
            if now >= o.until_min:
                self.client.unsuppress(o.channels)
                self.console.event(
                    self.clock.stamp(),
                    "integration_up",
                    f"la integracion '{o.integration}' vuelve; los datos retenidos empiezan a llegar",
                    self.prefix,
                )
                continue
            alive.append(o)
        self.outages = alive


def _preview(payload: dict | None, limit: int = 150) -> str:
    """Vista compacta del cuerpo para el `--dry-run` (lo que se enviaria)."""
    if payload is None:
        return "(sin cuerpo)"
    text = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    if len(text) <= limit:
        return text
    return f"{text[:limit]}... (+{len(text) - limit} caracteres)"
