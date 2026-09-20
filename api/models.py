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

from pydantic import AliasChoices, BaseModel, ConfigDict, Field, model_validator

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


class TriageLevel(str, Enum):
    """El color con el que el agente de voz cerró la llamada.

    Es la clasificación que el agente de HappyRobot hace en el nodo `Observación` —en español,
    rojo/naranja/amarillo/verde— traducida a los valores en inglés que exige el contrato. NO es
    lo mismo que `minutes_to_front`: aquello es geometría (dónde está el frente), esto es lo que
    una persona dijo por teléfono. Cuando las dos discrepan, la llamada gana en el mapa y la
    geometría sigue mandando en la cola: por eso conviven en campos distintos.
    """

    red = "red"
    orange = "orange"
    yellow = "yellow"
    green = "green"
    unknown = "unknown"

    @classmethod
    def from_text(cls, raw: str | None) -> "TriageLevel":
        """`"Naranja"` → `orange`. Tolera el inglés y el ruido; lo que no reconoce es `unknown`."""
        clave = (raw or "").strip().lower()
        return _TRIAGE_ALIASES.get(clave, cls.unknown)


_TRIAGE_ALIASES: dict[str, TriageLevel] = {
    "rojo": TriageLevel.red,
    "red": TriageLevel.red,
    "naranja": TriageLevel.orange,
    "orange": TriageLevel.orange,
    "amarillo": TriageLevel.yellow,
    "yellow": TriageLevel.yellow,
    "verde": TriageLevel.green,
    "green": TriageLevel.green,
}


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


class Triage(Base):
    """El veredicto con el que el agente de voz cerró la llamada.

    Es lo único del sistema que viene de haber hablado con la persona: el resto del estado lo
    calcula la geometría. Vive colgado de `Person` y NO se pisa con cada pasada del planner —
    solo lo reescribe otra llamada. Por eso `at` y `run_id` importan: el mando tiene que poder
    decir «esto lo dijo ella hace cuatro minutos, en la llamada tal».
    """

    level: TriageLevel = TriageLevel.unknown
    prior_level: TriageLevel | None = None  # el color que el agente llevaba AL DESCOLGAR
    confidence: str | None = None  # alta | media | baja, según lo clara que fue la conversación
    # ninguna | prior_alto_obs_baja | prior_bajo_obs_alta. Es la señal de que el mapa mentía:
    # `prior_bajo_obs_alta` significa que la persona está peor de lo que decía la geometría.
    discrepancy: str | None = None
    call_result: str | None = None  # completada | cortada | no_contactado
    declared_zone: str | None = None  # el paraje que dijo, que puede no ser donde la ubicamos
    place_type: str | None = None  # edificio | exterior | vehiculo
    flames: bool | None = None  # afirmó ver llamas o humo
    notes: str | None = None  # lo que no cabía en los campos anteriores
    reason: str | None = None  # la frase en español que lee el mando, ya redactada
    run_id: str | None = None
    run_url: str | None = None  # el run de HappyRobot: ahí está la grabación y el transcript
    at: str = Field(default_factory=utcnow_iso)


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
    # Lo que el agente de voz concluyó en la última llamada. `None` = nadie ha hablado con ella.
    triage: Triage | None = None


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


class RegisterPerson(Base):
    """Alguien que abre el enlace y se apunta él mismo: teléfono con prefijo y su GPS."""

    name: str | None = None
    phone: str
    lat: float
    lon: float
    accuracy_m: float | None = None
    # Desplazar el escenario entero (fuego, vecinos, salidas, patrullas) alrededor de esta persona.
    anchor: bool = False


class RegisterResponse(Base):
    ok: bool = True
    person_id: str
    name: str | None = None
    phone: str | None = None
    created: bool
    map_url: str
    gps_url: str
    anchor: dict[str, float] | None = None


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


# `no_contactado` en el extract del agente, y sus variantes razonables. Un `resultado` que no
# esté aquí se lee como "hubo conversación": preferimos dar por contestada una llamada que no
# lo fue antes que dar por perdida a alguien con quien sí se habló.
NO_CONTACT_RESULTS = {"no_contactado", "no contactado", "no_contacted", "sin_contacto", "buzon"}


class CallObservation(Base):
    """Lo que el nodo `Observación` del workflow manda al colgar: el círculo que se cierra.

    La app dispara la llamada (`POST /calls/dispatch` → webhook del workflow) y hasta ahora ahí
    se acababa todo: el AI Extract del agente se quedaba dentro de HappyRobot y el mapa nunca se
    enteraba de lo que la persona había dicho. Este es el camino de vuelta.

    **Los nombres llegan en español** porque son los del nodo tal y como está desplegado
    (`nivel`, `zona_declarada`, `discrepancia`...). No los renombramos en la plataforma para no
    tocar un workflow que ya está en vivo: se aceptan como alias y el contrato sigue en inglés
    puertas adentro. Los dos juegos valen.

    **Todo llega como texto.** El cuerpo del nodo webhook es una plantilla JSON, así que un campo
    vacío viaja como `""` y un booleano como `"true"`. El validador de abajo limpia eso antes de
    que Pydantic se queje de un `""` donde esperaba un entero.
    """

    person_id: str | None = Field(default=None, validation_alias=AliasChoices("person_id", "PERSONA_ID", "persona_id"))
    phone: str | None = Field(default=None, validation_alias=AliasChoices("phone", "NUMERO_TELEFONO", "telefono"))
    run_id: str | None = None
    run_url: str | None = None
    duration_s: int | None = Field(default=None, validation_alias=AliasChoices("duration_s", "duration", "duracion_s"))
    # El color al que concluyó el agente y el que llevaba de partida. La pareja es lo que hace
    # legible la discrepancia: «iba como naranja y resultó rojo» dice más que cualquiera de los dos.
    level: str | None = Field(default=None, validation_alias=AliasChoices("level", "nivel"))
    prior_level: str | None = Field(default=None, validation_alias=AliasChoices("prior_level", "PRIOR_NIVEL", "nivel_previo"))
    declared_zone: str | None = Field(default=None, validation_alias=AliasChoices("declared_zone", "zona_declarada"))
    place_type: str | None = Field(default=None, validation_alias=AliasChoices("place_type", "tipo_lugar"))
    flames: bool | None = Field(default=None, validation_alias=AliasChoices("flames", "llamas"))
    discrepancy: str | None = Field(default=None, validation_alias=AliasChoices("discrepancy", "discrepancia"))
    confidence: str | None = Field(default=None, validation_alias=AliasChoices("confidence", "confianza"))
    call_result: str | None = Field(default=None, validation_alias=AliasChoices("call_result", "resultado"))
    notes: str | None = Field(default=None, validation_alias=AliasChoices("notes", "nota_libre", "agent_notes"))
    # Si el workflow lo manda explícito, manda sobre lo que se deduzca de `call_result`.
    answered: bool | None = None

    @model_validator(mode="before")
    @classmethod
    def _vacios_son_nulos(cls, data: Any) -> Any:
        """`""`, `"null"` y el nombre de una variable sin resolver valen lo mismo: nada.

        Sin esto, una llamada en la que el agente no llegó a determinar el nivel manda
        `"duration_s": ""` y la API responde 422 — o sea, se pierde entera la única información
        que teníamos de esa persona por culpa de un campo que ni siquiera importaba.
        """
        if not isinstance(data, dict):
            return data
        vacios = {"", "null", "none", "undefined", "n/a"}
        return {
            k: (None if isinstance(v, str) and v.strip().lower() in vacios else v)
            for k, v in data.items()
        }

    def answered_call(self) -> bool:
        """¿Hubo alguien al otro lado? `answered` explícito gana; si no, lo dice `resultado`."""
        if self.answered is not None:
            return self.answered
        return (self.call_result or "").strip().lower() not in NO_CONTACT_RESULTS


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
    blocked = "blocked"  # el cerrojo lo paró: fuera de CALL_ALLOWLIST
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
    # El color del triaje y su porqué. Es lo que tiñe el punto en el mapa: sin llamada llega
    # `None` y el punto se queda del azul de "nadie ha hablado con esta persona".
    triage_level: TriageLevel | None = None
    triage_reason: str | None = None
    triage_confidence: str | None = None
    triage_at: str | None = None


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
