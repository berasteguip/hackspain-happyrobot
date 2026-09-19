"""Resultado de las llamadas de HappyRobot: el canal por el que entra la información del mundo.

Una llamada es la única fuente que da datos que ningún sensor tiene: cuánta gente hay dentro,
si tienen coche, si se niegan a salir, y —lo más valioso— **qué vecinos mencionan**. Cada vecino
mencionado crea o actualiza una casa y entra en la cola de llamadas: es como el sistema descubre
gente que no estaba en ninguna lista.
"""

from __future__ import annotations

import logging

from datetime import timedelta

from fastapi import APIRouter, HTTPException, Query

import planner
from models import (
    Actor,
    CallLogEntry,
    CallLogWrite,
    CallOutcome,
    CallStarted,
    DecisionType,
    House,
    HouseStatus,
    Mobility,
    NeighborMention,
    Person,
    PersonStatus,
    PositionSource,
    VulnerablePerson,
    WriteResponse,
    parse_iso,
    utcnow_iso,
)
from routers._common import write_response
from settings import settings
from state import state

log = logging.getLogger("crisis.api.calls")

router = APIRouter(tags=["llamadas"])


def _resolve_person(outcome: CallOutcome) -> tuple[Person, list]:
    """Busca a la persona por id o por teléfono; si no existe, la crea.

    El motor de escenario genera gente que aparece a mitad de crisis (un hijo que llega al pueblo,
    alguien que llama al 112 sin estar en el censo). Rechazar esas llamadas sería perder justo la
    información que nadie más tiene.
    """
    decisiones = []
    person = None
    if outcome.person_id:
        person = state.people.get(outcome.person_id)
    if person is None:
        person = state.person_by_phone(outcome.phone)
    if person is not None:
        return person, decisiones

    # Persona nueva. Si el teléfono coincide con una casa conocida, se la cuelga de esa casa.
    house = state.house_by_phone(outcome.phone)
    nueva = Person(
        id=outcome.person_id or state.next_id("p"),
        house_id=house.id if house else None,
        phone=outcome.phone,
        lat=house.lat if house else None,
        lon=house.lon if house else None,
        position_source=PositionSource.declared if house else None,
        status=PersonStatus.contacted if outcome.answered else PersonStatus.unknown,
    )
    entrada = state.mutate(
        f"Persona nueva {nueva.id} descubierta por una llamada"
        + (f" (teléfono {outcome.phone})" if outcome.phone else "")
        + (f", asignada a {house.address or house.id}" if house else ", sin casa conocida")
        + ". Entra en la cola de prioridad.",
        # El contrato §2.6 no tiene un tipo "entidad creada"; `person_located` es el más cercano.
        type=DecisionType.person_located,
        subject_type="person",
        subject_id=nueva.id,
        entity=nueva,
        actor=Actor.agent,
    )
    if entrada:
        decisiones.append(entrada)
    return nueva, decisiones


@router.post("/calls/outcome", response_model=WriteResponse)
def post_call_outcome(outcome: CallOutcome) -> WriteResponse:
    """Lo que la llamada dejó: datos extraídos, negativa a salir, o silencio."""
    person, decisiones = _resolve_person(outcome)
    house = state.houses.get(person.house_id or "")
    ex = outcome.extracted
    ahora = utcnow_iso()

    if not outcome.answered:
        decisiones.extend(_no_answer(person, house, outcome))
        state.last_event_id = decisiones[0].id if decisiones else state.last_event_id
        decisiones.extend(planner.run_planner(state, trigger_event_id=state.last_event_id))
        return write_response(decisiones, event="call-outcome(sin respuesta)")

    # ---------------------------------------------------------------- contestó
    cambios: dict = {"call_attempts": (person.call_attempts or 0) + 1}
    detalles: list[str] = []

    if ex.people_at_home is not None:
        cambios["household_size"] = ex.people_at_home
        detalles.append(f"{ex.people_at_home} personas en casa")
    movilidad = ex.mobility or (Mobility.car if ex.has_car else None)
    if movilidad is not None:
        cambios["mobility"] = movilidad
        detalles.append(f"movilidad {movilidad.value}")
    if ex.has_smartphone is not None:
        cambios["has_smartphone"] = ex.has_smartphone
    if ex.consent_position is not None:
        cambios["consent_position"] = ex.consent_position
        detalles.append("acepta compartir posición" if ex.consent_position else "NO comparte posición")

    # Posición declarada: vale menos que el GPS y el factor de incertidumbre lo castiga, pero es
    # infinitamente mejor que nada.
    if ex.declared_lat is not None and ex.declared_lon is not None:
        cambios.update(
            {
                "lat": ex.declared_lat,
                "lon": ex.declared_lon,
                "position_source": PositionSource.declared,
                "position_updated_at": ahora,
            }
        )
        detalles.append("posición declarada por teléfono")
    elif ex.declared_location and person.lat is None and house is not None:
        # No geocodificamos texto libre: se usa la casa como aproximación y se deja constancia.
        cambios.update(
            {
                "lat": house.lat,
                "lon": house.lon,
                "position_source": PositionSource.declared,
                "position_updated_at": ahora,
            }
        )
        detalles.append(f"dice estar en «{ex.declared_location}» (se usa la casa como aproximación)")

    if ex.will_evacuate is False:
        cambios["status"] = PersonStatus.refusing
        detalles.append("SE NIEGA a salir")
    elif person.status in {PersonStatus.unknown, PersonStatus.no_answer, PersonStatus.unreachable}:
        cambios["status"] = PersonStatus.contacted
    if outcome.agent_notes:
        cambios["notes"] = outcome.agent_notes

    nombre = person.name or person.id
    razon = f"{nombre} CONTESTÓ" + (": " + ", ".join(detalles) if detalles else "")
    entrada = state.mutate(
        razon,
        type=DecisionType.person_status_changed,
        subject_type="person",
        subject_id=person.id,
        changes=cambios,
        actor=Actor.agent,
        force=True,  # la llamada se registra aunque no cambie ningún campo
        root_event=True,  # la llamada ES la causa: lo que venga detrás cuelga de ella
    )
    if entrada:
        decisiones.append(entrada)
        state.last_event_id = entrada.id

    # Plazas libres declaradas: no es campo de `Person` en el contrato, vive en el estado.
    if ex.seats_free is not None:
        state.seats_free[person.id] = int(ex.seats_free)

    if house is not None:
        decisiones.extend(_update_house_after_answer(house, ex))
    decisiones.extend(_absorb_neighbors(ex.neighbors_mentioned, person))

    # Contestar cambia los datos con los que se eligió la salida: se revisa.
    state.mark_exit_dirty([person.id])
    state.mark_route_dirty([person.id])
    decisiones.extend(planner.run_planner(state, trigger_event_id=state.last_event_id))
    return write_response(decisiones, event="call-outcome")


def _no_answer(person: Person, house: House | None, outcome: CallOutcome) -> list:
    """Nadie coge el teléfono: sube el contador y prepara la escalada a la patrulla."""
    decisiones = []
    intentos = (person.call_attempts or 0) + 1
    entrada = state.mutate(
        f"{person.name or person.id} NO contesta (intento {intentos}).",
        type=DecisionType.person_status_changed,
        subject_type="person",
        subject_id=person.id,
        changes={"call_attempts": intentos, "status": PersonStatus.no_answer},
        actor=Actor.agent,
        force=True,
        root_event=True,
    )
    if entrada:
        decisiones.append(entrada)
        state.last_event_id = entrada.id
    if house is not None:
        h_intentos = (house.call_attempts or 0) + 1
        estado = (
            HouseStatus.no_answer
            if h_intentos >= settings.escalate_after_attempts
            else HouseStatus.calling
        )
        sub = state.mutate(
            f"{house.address or house.id}: {h_intentos} intento(s) sin respuesta.",
            type=DecisionType.person_status_changed,
            subject_type="house",
            subject_id=house.id,
            changes={
                "call_attempts": h_intentos,
                "last_call_at": utcnow_iso(),
                "answered": False,
                "status": estado,
            },
            actor=Actor.agent,
            force=True,
        )
        if sub:
            decisiones.append(sub)
    return decisiones


def _update_house_after_answer(house: House, ex) -> list:
    """La casa hereda lo que dijo quien contestó: contestada, y vulnerable si lo declararon."""
    cambios: dict = {
        "answered": True,
        "last_call_at": utcnow_iso(),
        "status": HouseStatus.answered,
        "call_attempts": (house.call_attempts or 0) + 1,
    }
    detalles = []
    if ex.people_at_home is not None:
        cambios["residents_expected"] = ex.people_at_home
    if ex.will_evacuate is False:
        cambios["status"] = HouseStatus.occupants_refuse
        detalles.append("sus ocupantes se niegan a salir")
    if ex.vulnerable_people:
        cambios["vulnerable"] = True
        cambios["vulnerability_reason"] = "; ".join(
            _describe_vulnerable(v) for v in ex.vulnerable_people
        )
        detalles.append(f"{len(ex.vulnerable_people)} persona(s) vulnerable(s) declarada(s)")
    razon = f"{house.address or house.id} contestó" + (": " + ", ".join(detalles) if detalles else "")
    entrada = state.mutate(
        razon,
        type=DecisionType.person_status_changed,
        subject_type="house",
        subject_id=house.id,
        changes=cambios,
        actor=Actor.agent,
    )
    return [entrada] if entrada else []


def _describe_vulnerable(v: VulnerablePerson) -> str:
    partes = [p for p in (v.description, v.needs) if p]
    return " — ".join(partes) if partes else "persona vulnerable sin detalle"


def _absorb_neighbors(mentions: list[NeighborMention], source: Person) -> list:
    """Cada vecino mencionado entra en el sistema: casa + persona + cola de llamadas.

    Es la pieza que convierte una llamada en inteligencia: "en la casa de al lado está Manuela,
    que no oye el teléfono" es un dato que ninguna base de datos tenía.
    """
    decisiones: list = []
    for m in mentions:
        if not (m.name or m.phone or m.address):
            continue
        casa = _find_or_create_house(m, source, decisiones)
        persona = _find_or_create_neighbor_person(m, casa, source, decisiones)
        if persona is None or casa is None:
            continue
    return decisiones


def _find_or_create_house(m: NeighborMention, source: Person, decisiones: list) -> House | None:
    existente = state.house_by_phone(m.phone)
    if existente is None and m.address:
        existente = next(
            (h for h in state.houses.values() if (h.address or "").lower() == m.address.lower()),
            None,
        )
    if existente is not None:
        if m.phone and not existente.phone:
            entrada = state.mutate(
                f"{existente.address or existente.id}: teléfono aportado por "
                f"{source.name or source.id}.",
                type=DecisionType.person_located,
                subject_type="house",
                subject_id=existente.id,
                changes={"phone": m.phone},
                actor=Actor.agent,
            )
            if entrada:
                decisiones.append(entrada)
        return existente

    origen = state.houses.get(source.house_id or "")
    nueva = House(
        id=state.next_id("h"),
        address=m.address or (f"casa vecina de {origen.address}" if origen else "dirección sin confirmar"),
        village=origen.village if origen else None,
        # Sin geocodificación: se hereda la posición de quien la menciona (vecino = al lado).
        lat=origen.lat if origen else source.lat,
        lon=origen.lon if origen else source.lon,
        phone=m.phone,
        residents_expected=1,
        sector_id=origen.sector_id if origen else source.sector_id,
        status=HouseStatus.pending if m.phone else HouseStatus.no_answer,
    )
    entrada = state.mutate(
        f"Casa NUEVA {nueva.id} ({nueva.address}) descubierta porque "
        f"{source.name or source.id} mencionó a un vecino"
        + (". Tiene teléfono: entra en la cola de llamadas." if m.phone else
           ". Sin teléfono: va directa a la lista de la patrulla."),
        type=DecisionType.person_located,
        subject_type="house",
        subject_id=nueva.id,
        entity=nueva,
        actor=Actor.agent,
    )
    if entrada:
        decisiones.append(entrada)
        state.last_event_id = entrada.id
    return nueva


def _find_or_create_neighbor_person(
    m: NeighborMention, casa: House | None, source: Person, decisiones: list
) -> Person | None:
    if casa is None:
        return None
    existente = state.person_by_phone(m.phone)
    if existente is None and m.name:
        existente = next(
            (
                p
                for p in state.people.values()
                if (p.name or "").lower() == m.name.lower() and p.house_id == casa.id
            ),
            None,
        )
    if existente is not None:
        return existente
    if m.at_home is False:
        return None  # el vecino no está en casa: no hay a quién evacuar ahí

    nueva = Person(
        id=state.next_id("p"),
        house_id=casa.id,
        name=m.name,
        phone=m.phone,
        lat=casa.lat,
        lon=casa.lon,
        position_source=PositionSource.declared,
        position_updated_at=utcnow_iso(),
        household_size=1,
        status=PersonStatus.unknown,
        notes=f"mencionada por {source.name or source.id}",
    )
    entrada = state.mutate(
        f"{m.name or nueva.id} entra en la cola: mencionada por {source.name or source.id}"
        + (f" ({m.phone})" if m.phone else " sin teléfono")
        + ". Estado desconocido, así que la incertidumbre le SUBE la prioridad.",
        type=DecisionType.person_located,
        subject_type="person",
        subject_id=nueva.id,
        entity=nueva,
        actor=Actor.agent,
    )
    if entrada:
        decisiones.append(entrada)
        state.last_event_id = entrada.id
    return nueva


@router.post("/calls/started", response_model=WriteResponse)
def post_call_started(body: CallStarted) -> WriteResponse:
    """HappyRobot avisa de que la llamada está en curso (o de que entra una llamada al 112)."""
    person = state.people.get(body.person_id)
    if person is None:
        raise HTTPException(status_code=404, detail=f"persona {body.person_id} desconocida")
    direccion = "entrante" if (body.direction or "outbound") == "inbound" else "saliente"
    entrada = state.mutate(
        f"Llamada {direccion} en curso con {person.name or person.id}"
        + (f" (run {body.run_id})" if body.run_id else "")
        + ".",
        type=DecisionType.call_placed,
        subject_type="person",
        subject_id=person.id,
        changes={},
        actor=Actor.agent,
        force=True,
        root_event=True,
    )
    decisiones = [entrada] if entrada else []
    casa = state.houses.get(person.house_id or "")
    if casa is not None and casa.status == HouseStatus.pending:
        sub = state.mutate(
            f"{casa.address or casa.id}: llamada en curso.",
            type=DecisionType.person_status_changed,
            subject_type="house",
            subject_id=casa.id,
            changes={"status": HouseStatus.calling},
            actor=Actor.agent,
        )
        if sub:
            decisiones.append(sub)
    return write_response(decisiones, event="call-started")


# ======================================================================================
# El log de llamadas: lo que una llamada aprende y las otras 299 pueden consultar
# ======================================================================================
#
# La fuente para el agente es la tabla `call_log` de Twin: escribe y lee allí sin salir de la
# plataforma, que es lo que hace que la lectura en mitad de una conversación sea barata.
# Estos dos endpoints son el espejo para la pantalla: el mismo apunte llega aquí y sube
# `state_version`, así que el puesto de mando lo ve aparecer por el long-poll de `/state/diff`
# que ya usa, sin tocar Twin desde el navegador (contrato §0: el dashboard nunca lee de Twin).
#
# Si el webhook a esta API falla, el log sigue funcionando y solo se retrasa la pantalla. Ese es
# el lado correcto del fallo.


@router.post("/calls/log", response_model=WriteResponse)
def post_call_log(payload: CallLogWrite) -> WriteResponse:
    """Anota una afirmación. Pensado para llamarse **en cada interacción**, no solo al colgar.

    `validity_min` es la alternativa cómoda a `valid_until`: el workflow dice «esto vale 20
    minutos» y la fecha la calcula la API, que es quien tiene el reloj bueno.
    """
    ahora = utcnow_iso()
    valid_until = payload.valid_until
    if valid_until is None and payload.validity_min is not None:
        base = parse_iso(ahora)
        if base is not None:
            valid_until = (base + timedelta(minutes=payload.validity_min)).isoformat()

    # Si viene teléfono pero no persona, se resuelve contra el padrón que ya tenemos en memoria.
    # Que NO resuelva es información: es un número que nadie tenía en la lista.
    person_id = payload.person_id
    if person_id is None and payload.phone:
        encontrada = state.person_by_phone(payload.phone)
        if encontrada is not None:
            person_id = encontrada.id

    entrada = CallLogEntry(
        id=payload.id or state.next_id("log", width=6),
        created_at=ahora,
        topic=payload.topic,
        locality_id=payload.locality_id,
        road=payload.road,
        place_text=payload.place_text,
        person_id=person_id,
        phone=payload.phone,
        source_id=payload.source_id,
        source_detail=payload.source_detail,
        question=payload.question,
        answer=payload.answer,
        answered_at=ahora if payload.answer is not None else None,
        valid_until=valid_until,
        callback_to=payload.callback_to,
        callback_at=payload.callback_at,
        run_id=payload.run_id,
        answer_run_id=payload.answer_run_id,
        simulated=payload.simulated,
    )
    state.append_call_log(entrada)
    log.info(
        "log %s · %s · %s · %s",
        entrada.id,
        entrada.topic.value,
        entrada.source_id,
        entrada.question[:60],
    )
    # Anotar algo no es decidir nada: la lista de decisiones va vacía a propósito.
    return write_response([], event="call-log")


@router.get("/calls/log")
def get_call_log(
    limit: int = Query(50, ge=1, le=500),
    topic: str | None = None,
    locality_id: str | None = None,
    road: str | None = None,
    person_id: str | None = None,
    only_open: bool = False,
    vigentes: bool = False,
) -> dict:
    """Lo que se sabe, de lo más reciente a lo más antiguo.

    `only_open` deja las dudas sin respuesta (la cola de lo que hay que preguntar) y `vigentes`
    descarta lo que ya ha caducado. Se ordena por fiabilidad de la fuente y luego por reciente:
    si dos vecinos se contradicen sobre la misma carretera, gana el que tenga mejor `rank` —el
    orden lo aplica el agente con la tabla `source` de Twin; aquí es solo por fecha.
    """
    ahora = parse_iso(utcnow_iso())
    filas = [e for _, e in state.call_log]
    if topic:
        filas = [e for e in filas if e.topic.value == topic]
    if locality_id:
        filas = [e for e in filas if e.locality_id == locality_id]
    if road:
        filas = [e for e in filas if e.road == road]
    if person_id:
        filas = [e for e in filas if e.person_id == person_id]
    if only_open:
        filas = [e for e in filas if e.answer is None]
    if vigentes and ahora is not None:
        def sigue_valiendo(e: CallLogEntry) -> bool:
            if e.valid_until is None:
                return True
            hasta = parse_iso(e.valid_until)
            return hasta is None or hasta > ahora

        filas = [e for e in filas if sigue_valiendo(e)]

    filas = list(reversed(filas))[:limit]
    return {
        "state_version": state.state_version,
        "count": len(filas),
        "entries": [e.model_dump(mode="json") for e in filas],
    }
