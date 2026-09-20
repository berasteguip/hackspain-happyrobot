"""Modelos Pydantic de las entidades del contrato (`docs/06-producto/03-contrato-de-datos.md`).

Reglas del contrato respetadas aquí:
- nombres de campo en inglés, comentarios en español;
- tiempos ISO-8601 en UTC (`str`, no `datetime`, para que el JSON viaje literal);
- geometrías GeoJSON con orden `[lon, lat]`; los campos `lat`/`lon` sueltos van en ese orden;
- un campo no calculado todavía es `None`, nunca `0`.
"""

from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

# --------------------------------------------------------------------------------------
# Utilidades de tiempo
# --------------------------------------------------------------------------------------


def utcnow_iso() -> str:
    """`2026-09-19T17:52:00Z` — el formato del contrato."""
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def parse_iso(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


class Base(BaseModel):
    """Base tolerante: los ficheros de escenario pueden traer campos extra sin romper la API."""

    model_config = ConfigDict(extra="ignore", populate_by_name=True)


# --------------------------------------------------------------------------------------
# Enums (todos `str, Enum` para que serialicen como el string del contrato)
# --------------------------------------------------------------------------------------


class PositionSource(str, Enum):
    declared = "declared"  # dicho por teléfono
    gps = "gps"  # página del enlace
    inferred = "inferred"  # última conocida + rumbo


class Mobility(str, Enum):
    car = "car"
    walking = "walking"
    reduced = "reduced"  # anda despacio, necesita que alguien la lleve
    immobile = "immobile"  # no sale sin ambulancia o vecino


class PersonStatus(str, Enum):
    unknown = "unknown"
    no_answer = "no_answer"
    unreachable = "unreachable"
    contacted = "contacted"
    moving = "moving"
    safe = "safe"
    refusing = "refusing"
    at_risk = "at_risk"


class HouseStatus(str, Enum):
    pending = "pending"
    calling = "calling"
    answered = "answered"
    no_answer = "no_answer"
    cleared_by_patrol = "cleared_by_patrol"
    empty = "empty"  # la patrulla confirma que no vive nadie
    occupants_refuse = "occupants_refuse"


class SafeZoneStatus(str, Enum):
    open = "open"
    filling = "filling"  # >80% capacidad
    threatened = "threatened"  # fuego a <3 km o el cono apunta a ella
    closed = "closed"


class ConvoyStatus(str, Enum):
    forming = "forming"
    moving = "moving"
    arrived = "arrived"
    broken = "broken"  # el guía se desvió o se paró


class ConvoyRole(str, Enum):
    leader = "leader"
    follower = "follower"


class PatrolStatus(str, Enum):
    """El contrato solo muestra `en_route` en el ejemplo; el resto es nuestra extensión mínima.

    `standby` es el valor que genera `data/generate.py`: se acepta como sinónimo de `available`.
    """

    standby = "standby"
    available = "available"
    en_route = "en_route"
    on_site = "on_site"
    unavailable = "unavailable"


class Channel(str, Enum):
    call = "call"
    sms = "sms"
    whatsapp = "whatsapp"


class Actor(str, Enum):
    system = "system"
    human = "human"
    agent = "agent"  # el agente de voz decidió en conversación


class DecisionType(str, Enum):
    """Lista CERRADA del contrato §2.6. No se añaden tipos sin tocar el contrato."""

    fire_updated = "fire_updated"
    road_closed = "road_closed"
    person_located = "person_located"
    person_status_changed = "person_status_changed"
    route_recalculated = "route_recalculated"
    exit_reassigned = "exit_reassigned"
    convoy_formed = "convoy_formed"
    convoy_broken = "convoy_broken"
    convoy_regrouped = "convoy_regrouped"
    house_escalated_to_patrol = "house_escalated_to_patrol"
    patrol_assigned = "patrol_assigned"
    air_priority_changed = "air_priority_changed"
    call_placed = "call_placed"
    sms_sent = "sms_sent"
    human_override = "human_override"
    approval_requested = "approval_requested"
    approval_granted = "approval_granted"
    plan_discarded = "plan_discarded"


class Urgency(str, Enum):
    """Etiqueta que consume el agente de voz (`/instructions`). El contrato pide el campo
    `urgency` sin fijar valores."""

    critical = "critical"
    high = "high"
    medium = "medium"
    low = "low"
    unknown = "unknown"


# --------------------------------------------------------------------------------------
# Geometrías GeoJSON — coordenadas SIEMPRE [lon, lat]
# --------------------------------------------------------------------------------------


class Polygon(Base):
    type: Literal["Polygon"] = "Polygon"
    coordinates: list[list[list[float]]]

    def ring(self) -> list[list[float]]:
        """Anillo exterior, `[[lon, lat], ...]`."""
        return self.coordinates[0] if self.coordinates else []


class LineString(Base):
    type: Literal["LineString"] = "LineString"
    coordinates: list[list[float]]


# --------------------------------------------------------------------------------------
# Sub-objetos
# --------------------------------------------------------------------------------------


class TrajectoryPoint(Base):
    lat: float
    lon: float
    t: str


class Route(Base):
    polyline: str | None = None  # encoded polyline (precisión 5)
    distance_m: float | None = None
    duration_s: int | None = None
    updated_at: str | None = None
    source: str | None = None  # straight | osrm | valhalla


class Instruction(Base):
    text: str
    sent_at: str
    channel: Channel = Channel.sms


class Wind(Base):
    direction_deg: float | None = None  # DE DÓNDE viene (convención meteorológica)
    speed_kmh: float | None = None
    gusts_kmh: float | None = None


class Notified(Base):
    person_id: str
    channel: Channel
    at: str


class NeighborMention(Base):
    name: str | None = None
    phone: str | None = None
    address: str | None = None
    at_home: bool | None = None


class VulnerablePerson(Base):
    description: str | None = None
    needs: str | None = None


# --------------------------------------------------------------------------------------
# Entidades
# --------------------------------------------------------------------------------------


class Person(Base):
    id: str
    house_id: str | None = None
    name: str | None = None
    phone: str | None = None
    lat: float | None = None
    lon: float | None = None
    position_source: PositionSource | None = None
    position_updated_at: str | None = None
    trajectory: list[TrajectoryPoint] = Field(default_factory=list)
    heading_deg: float | None = None
    speed_kmh: float | None = None
    household_size: int | None = None
    mobility: Mobility | None = None
    has_smartphone: bool | None = None
    status: PersonStatus = PersonStatus.unknown
    sector_id: str | None = None
    assigned_exit_id: str | None = None
    assigned_route: Route | None = None
    convoy_id: str | None = None
    convoy_role: ConvoyRole | None = None
    minutes_to_front: float | None = None
    priority_score: float | None = None
    last_instruction: Instruction | None = None
    consent_position: bool | None = None
    call_attempts: int = 0
    notes: str | None = None


class House(Base):
    id: str
    address: str | None = None
    village: str | None = None
    lat: float | None = None
    lon: float | None = None
    phone: str | None = None
    residents_expected: int | None = None
    vulnerable: bool | None = None
    vulnerability_reason: str | None = None
    sector_id: str | None = None
    call_attempts: int = 0
    last_call_at: str | None = None
    answered: bool | None = None
    status: HouseStatus = HouseStatus.pending
    minutes_to_front: float | None = None
    assigned_patrol_id: str | None = None
    patrol_eta_min: float | None = None
    priority_rank: int | None = None


class FireHistoryEntry(Base):
    t: str
    perimeter: Polygon


class Fire(Base):
    perimeter: Polygon
    wind: Wind = Field(default_factory=Wind)
    spread_rate_mh: float | None = None  # metros/hora de la cabeza
    head_bearing_deg: float | None = None  # HACIA DÓNDE avanza la cabeza
    cone_half_angle_deg: float = 30.0
    updated_at: str | None = None
    history: list[FireHistoryEntry] = Field(default_factory=list)


class SafeZone(Base):
    id: str
    name: str | None = None
    lat: float | None = None
    lon: float | None = None
    capacity: int | None = None
    occupancy: int = 0
    status: SafeZoneStatus = SafeZoneStatus.open
    access_roads: list[str] = Field(default_factory=list)
    distance_to_fire_m: float | None = None


class RoadClosure(Base):
    id: str
    road_name: str | None = None
    geometry: LineString | None = None
    reason: str | None = None
    since: str | None = None
    source: str | None = None


class Sector(Base):
    id: str
    name: str | None = None
    polygon: Polygon | None = None
    people_inside: int = 0
    people_unknown: int = 0
    vulnerable_inside: int = 0
    minutes_to_front: float | None = None
    air_priority_rank: int | None = None
    air_priority_reason: str | None = None


class Convoy(Base):
    id: str
    exit_id: str | None = None
    leader_person_id: str | None = None
    member_ids: list[str] = Field(default_factory=list)
    vehicle_description: str | None = None
    route: Route | None = None
    status: ConvoyStatus = ConvoyStatus.forming
    formed_at: str | None = None
    cohesion_ok: bool = True


class Patrol(Base):
    id: str
    name: str | None = None
    lat: float | None = None
    lon: float | None = None
    assigned_house_ids: list[str] = Field(default_factory=list)
    status: PatrolStatus = PatrolStatus.available
    channel: str | None = None  # teléfono o canal de radio


class DecisionLogEntry(Base):
    id: str
    t: str
    type: DecisionType
    subject_type: str
    subject_id: str | None = None
    before: dict[str, Any] = Field(default_factory=dict)
    after: dict[str, Any] = Field(default_factory=dict)
    reason: str  # en español y legible: es lo que se enseña al jurado
    trigger_event_id: str | None = None
    actor: Actor = Actor.system
    approved_by: str | None = None
    notified: list[Notified] = Field(default_factory=list)


# --------------------------------------------------------------------------------------
# Cuerpos de petición (escritura) — contrato §3
# --------------------------------------------------------------------------------------


class FireEvent(Base):
    perimeter: Polygon
    wind: Wind | None = None
    spread_rate_mh: float | None = None
    head_bearing_deg: float | None = None
    cone_half_angle_deg: float | None = None
    t: str | None = None


class RoadClosureEvent(Base):
    """`RoadClosure` sin `id` (lo pone la API)."""

    road_name: str | None = None
    geometry: LineString | None = None
    reason: str | None = None
    since: str | None = None
    source: str | None = None


class ExitThreatenedEvent(Base):
    exit_id: str
    reason: str | None = None


class PositionEvent(Base):
    person_id: str
    lat: float
    lon: float
    accuracy_m: float | None = None
    t: str | None = None


class CallExtracted(Base):
    people_at_home: int | None = None
    declared_location: str | None = None
    declared_lat: float | None = None
    declared_lon: float | None = None
    mobility: Mobility | None = None
    has_car: bool | None = None
    seats_free: int | None = None
    has_smartphone: bool | None = None
    consent_position: bool | None = None
    will_evacuate: bool | None = None
    neighbors_mentioned: list[NeighborMention] = Field(default_factory=list)
    vulnerable_people: list[VulnerablePerson] = Field(default_factory=list)


class CallOutcome(Base):
    run_id: str | None = None
    person_id: str | None = None
    phone: str | None = None
    answered: bool = False
    duration_s: int | None = None
    extracted: CallExtracted = Field(default_factory=CallExtracted)
    agent_notes: str | None = None
    transcript_url: str | None = None


class CallStarted(Base):
    person_id: str
    run_id: str | None = None
    direction: str | None = None  # inbound | outbound


# --------------------------------------------------------------------------------------
# Reparto de llamadas: rodear un círculo en Vigía → N llamadas independientes
# --------------------------------------------------------------------------------------


class CallState(str, Enum):
    """Estado del INTENTO de llamada, que no es el estado de la persona.

    `Person.status` cuenta qué le pasa a alguien (contactado, moviéndose, en riesgo);
    esto cuenta qué le pasa al teléfono. Son cosas distintas y el tablero de Vigía necesita
    las dos: alguien puede estar `contacted` de una llamada de hace diez minutos mientras su
    nuevo intento está `ringing`.
    """

    queued = "queued"  # seleccionado, todavía no se ha lanzado el run
    dialing = "dialing"  # petición enviada a HappyRobot, sin confirmación de run
    ringing = "ringing"  # HappyRobot confirmó el run / la llamada está sonando
    answered = "answered"  # contestó (llega por /calls/outcome)
    no_answer = "no_answer"  # no contestó (llega por /calls/outcome)
    failed = "failed"  # ni siquiera se pudo marcar (sin teléfono, 4xx, red)
    blocked = "blocked"  # un cerrojo lo paró (hoy: la clave pública sin cambiar)
    simulated = "simulated"  # ALLOW_REAL_CALLS=false: nadie ha recibido nada
    # Se lanzó, pero nunca llegó el resultado. NO es `no_answer`: no sabemos si contestó o no,
    # y decir que no contestó sería inventarse un dato. Pasa siempre que HappyRobot no puede
    # alcanzar nuestra `/calls/outcome` — por ejemplo con la API en localhost.
    stale = "stale"


TERMINAL_CALL_STATES = {
    CallState.answered,
    CallState.no_answer,
    CallState.failed,
    CallState.blocked,
    CallState.simulated,
    CallState.stale,
}


class CallRun(Base):
    """Un intento de llamada a una persona. Vive en `state.calls`, no en `Person`."""

    id: str
    person_id: str
    name: str | None = None
    phone: str | None = None
    state: CallState = CallState.queued
    run_id: str | None = None  # el id que devuelve HappyRobot
    batch_id: str | None = None  # la ráfaga (un círculo) a la que pertenece
    reason: str | None = None
    detail: str | None = None  # por qué falló o por qué se bloqueó
    simulated: bool = False
    started_at: str = Field(default_factory=utcnow_iso)
    updated_at: str = Field(default_factory=utcnow_iso)
    answered: bool | None = None


class CallDispatch(Base):
    """Lo que manda Vigía al soltar el círculo.

    O una lista explícita de personas, o un círculo (centro + radio) que la API resuelve
    ella misma. Lo segundo es lo que hace el mapa; lo primero es lo que hace `curl`.
    """

    person_ids: list[str] = Field(default_factory=list)
    lat: float | None = None
    lon: float | None = None
    radius_m: float | None = None
    reason: str | None = None
    operator: str | None = None
    # Vuelve a llamar a quien ya tiene un intento vivo o ya contestó. Por defecto no.
    force: bool = False


class CallDispatchResponse(Base):
    ok: bool = True
    state_version: int
    batch_id: str
    requested: int = 0
    dispatched: int = 0
    skipped: int = 0
    calls: list[CallRun] = Field(default_factory=list)
    skipped_detail: list[dict[str, Any]] = Field(default_factory=list)
    decisions: list[dict[str, Any]] = Field(default_factory=list)


class RosterEntry(Base):
    """Lo mínimo que Vigía necesita para pintar a alguien y poder rodearlo.

    Es un subconjunto de `Person` con los nombres que ya usa el mapa (`lng`, no `lon`).
    """

    id: str
    name: str | None = None
    phone: str | None = None
    lng: float | None = None
    lat: float | None = None
    locality: str | None = None
    address: str | None = None
    vulnerable: bool = False
    dialable: bool = False  # ¿lo dejaría marcar el cerrojo tal y como está configurado?
    status: PersonStatus = PersonStatus.unknown
    call_state: CallState | None = None
    location_source: PositionSource | None = None


class HumanOverride(Base):
    subject_type: str  # person | house | safe_zone | convoy | patrol | sector | fire
    subject_id: str | None = None
    field: str
    value: Any = None
    reason: str | None = None
    operator: str | None = None


class HumanApproval(Base):
    decision_id: str
    approved: bool
    operator: str | None = None
    reason: str | None = None


class ResetRequest(Base):
    scenario: str | None = None


class WriteResponse(Base):
    """Respuesta estándar de escritura del contrato §3."""

    ok: bool = True
    state_version: int
    decisions: list[dict[str, Any]] = Field(default_factory=list)
