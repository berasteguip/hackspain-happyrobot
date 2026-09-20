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

from pydantic import BaseModel, ConfigDict, Field, field_validator

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


class LogTopic(str, Enum):
    """De qué habla una entrada del log de llamadas.

    Cerrado a propósito: es lo que hace la consulta indexable. Buscar «¿está cortada la
    ZA-P-2551?» por texto libre no funciona porque nadie repite la misma frase dos veces;
    buscar `topic='road_status' and road='ZA-P-2551'` es igualdad contra índice.
    """

    road_status = "road_status"  # ¿está cortada la carretera X?
    evacuation_order = "evacuation_order"  # ¿han mandado evacuar el pueblo Y?
    shelter_capacity = "shelter_capacity"  # ¿cabe alguien en el refugio Z?
    fire_observed = "fire_observed"  # humo, llamas, lo que alguien ve
    person_situation = "person_situation"  # lo que un vecino cuenta de sí mismo
    other = "other"


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


class CallLogEntry(Base):
    """Una afirmación: qué se sabe sobre un tema, quién lo dice y hasta cuándo es fiable.

    NO es un log de intervenciones ni el `decision_log` (contrato §2.6). El `decision_log`
    registra decisiones del sistema; esto registra **conocimiento dicho por personas**, y es lo
    que una llamada aprende y las otras 299 pueden consultar sin volver a preguntar.

    Espejo de la tabla `call_log` de Twin: el agente lee y escribe allí (nativo, sin salir de la
    plataforma) y la misma fila llega aquí por webhook para que el puesto de mando la vea llegar
    en vivo. Twin es la fuente para el agente; esto es la copia para la pantalla.
    """

    id: str
    created_at: str = Field(default_factory=utcnow_iso)

    # De qué habla. `locality_id` cuando el sitio existe en el padrón, `place_text` cuando es un
    # paraje sin entidad («la pista de La Cernada»), `road` aparte porque una carretera no
    # pertenece a un núcleo: la ZA-P-2434 es la salida de Sesnández Y la de Ferreruela.
    topic: LogTopic = LogTopic.other
    locality_id: str | None = None
    road: str | None = None
    place_text: str | None = None

    # Quién habla. `person_id` puede ser nulo: quien llama puede no estar en el padrón, y eso
    # mismo es la señal de que hay un vecino nuevo que registrar.
    person_id: str | None = None
    phone: str | None = None
    source_id: str = "desconocido"
    source_detail: str | None = None  # la unidad concreta: «bomberos de Zamora»

    # Qué se dijo. `answer` nulo = pendiente; no hace falta un tipo «pendiente» aparte.
    question: str
    answer: str | None = None
    answered_at: str | None = None
    valid_until: str | None = None  # None = no caduca

    # Bucle abierto: «a las tres me dicen algo».
    callback_to: str | None = None
    callback_at: str | None = None

    run_id: str | None = None
    answer_run_id: str | None = None
    # Si la contraparte era una centralita simulada. Se declara, no se esconde: el puesto de
    # mando lo pinta distinto, igual que una posición `declared` no se pinta como una `gps`.
    simulated: bool = True

    @property
    def resolved(self) -> bool:
        return self.answer is not None


class CallLogWrite(Base):
    """Lo que manda el workflow al anotar algo.

    `id` es opcional y conviene mandarlo: es el uuid que generó Twin al insertar la fila allí.
    Compartir el id hace que las dos copias —la de Twin, que es la fuente, y esta, que es para la
    pantalla— sean la misma anotación y no dos. Si no viene, la API se inventa uno.
    """

    id: str | None = None
    topic: LogTopic = LogTopic.other
    locality_id: str | None = None
    road: str | None = None
    place_text: str | None = None
    person_id: str | None = None
    phone: str | None = None
    source_id: str = "desconocido"
    source_detail: str | None = None
    question: str
    answer: str | None = None
    valid_until: str | None = None
    validity_min: int | None = None  # alternativa a `valid_until`: la API calcula la fecha
    callback_to: str | None = None
    callback_at: str | None = None
    run_id: str | None = None
    answer_run_id: str | None = None
    simulated: bool = True

    @field_validator("*", mode="before")
    @classmethod
    def _vacio_es_nulo(cls, valor):
        """Una cadena vacía es un campo sin rellenar, no un valor.

        El cuerpo del webhook va en JSON crudo con plantillas, así que un parámetro que el
        agente no rellenó llega como `""`. Sin esto, `validity_min: ""` devuelve un 422 en
        mitad de una llamada de voz, y `locality_id: ""` guardaría una cadena vacía que no
        casa con ninguna zona. Los dos fallos son silenciosos para quien está al teléfono.
        """
        return None if isinstance(valor, str) and not valor.strip() else valor


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
