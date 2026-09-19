"""Resultado de las llamadas de HappyRobot: el canal por el que entra la información del mundo.

Una llamada es la única fuente que da datos que ningún sensor tiene: cuánta gente hay dentro,
si tienen coche, si se niegan a salir, y —lo más valioso— **qué vecinos mencionan**. Cada vecino
mencionado crea o actualiza una casa y entra en la cola de llamadas: es como el sistema descubre
gente que no estaba en ninguna lista.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException

import dispatcher
import planner
from models import (
    TERMINAL_CALL_STATES,
    Actor,
    CallDispatch,
    CallDispatchResponse,
    CallOutcome,
    CallRun,
    CallStarted,
    CallState,
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

    _close_call_run(outcome, person)

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
    call = state.call_by_run_id(body.run_id) or state.active_call(person.id)
    if call is not None and call.state not in {CallState.answered, CallState.no_answer}:
        state.set_call_state(call.id, CallState.ringing, run_id=body.run_id)
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


def _close_call_run(outcome: CallOutcome, person: Person) -> None:
    """Cierra el intento que originó esta llamada, si lo encontramos.

    Se busca primero por `run_id` —el id que HappyRobot nos devolvió al arrancar el run— y solo
    si no hay, por la persona. Ese orden importa cuando dos intentos de la misma ráfaga se
    solapan: sin `run_id` cerraríamos el intento equivocado y el tablero mentiría.

    El respaldo mira el ÚLTIMO intento, no solo uno vivo. Con `ALLOW_REAL_CALLS=false` el intento
    nace ya `simulated` (nadie descolgó nada), y sin este respaldo el resultado que manda el
    simulador —o el propio HappyRobot en un ensayo sin `run_id`— no cerraría ninguna fila: el
    tablero se quedaría lleno de llamadas que contestaron y siguen pintadas como "simulada".
    """
    call = state.call_by_run_id(outcome.run_id)
    if call is None:
        ultimo = state.last_call(person.id)
        # Un intento ya resuelto no se reabre: su resultado lo escribió otra llamada.
        if ultimo is not None and ultimo.state not in {CallState.answered, CallState.no_answer}:
            call = ultimo
    if call is None:
        return
    state.set_call_state(
        call.id,
        CallState.answered if outcome.answered else CallState.no_answer,
        run_id=outcome.run_id,
        answered=outcome.answered,
        detail=outcome.agent_notes,
    )


@router.post("/calls/dispatch", response_model=CallDispatchResponse)
def post_call_dispatch(body: CallDispatch) -> CallDispatchResponse:
    """Rodear una zona en el mapa → una llamada independiente por cada persona dentro.

    Acepta las dos formas: `person_ids` explícito (lo que usa `curl` y los tests) o el círculo
    `lat`/`lon`/`radius_m` que dibuja Vigía. Devuelve el tablero completo de la ráfaga, con el
    motivo de cada descarte, para que el operador vea de un vistazo por qué un punto que rodeó
    no ha sonado.
    """
    try:
        batch_id, intentos, descartados, decisiones = dispatcher.dispatch(state, body)
    except dispatcher.DispatchError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    # Una llamada lanzada cambia las condiciones del plan (intentos, estados): se repasa.
    if intentos:
        decisiones = list(decisiones) + planner.run_planner(
            state, trigger_event_id=state.last_event_id
        )
    return CallDispatchResponse(
        ok=True,
        state_version=state.state_version,
        batch_id=batch_id,
        requested=len(intentos) + len(descartados),
        dispatched=len(intentos),
        skipped=len(descartados),
        calls=intentos,
        skipped_detail=descartados,
        decisions=[d.model_dump(mode="json") for d in decisiones if d is not None],
    )


@router.get("/calls", response_model=list[CallRun])
def get_calls(batch_id: str | None = None, active: bool = False) -> list[CallRun]:
    """El tablero de llamadas. `batch_id` acota a una ráfaga; `active=true`, a las vivas."""
    # Que el tablero no enseñe «Llamando» eternamente a quien colgó hace veinte minutos.
    state.expire_stale_calls()
    filas = list(state.calls.values())
    if batch_id:
        filas = [c for c in filas if c.batch_id == batch_id]
    if active:
        filas = [c for c in filas if c.state not in TERMINAL_CALL_STATES]
    return sorted(filas, key=lambda c: c.started_at, reverse=True)


@router.post("/calls/reset", response_model=WriteResponse)
def post_calls_reset(batch_id: str | None = None, operator: str | None = None) -> WriteResponse:
    """Vacía el tablero de llamadas **sin tocar nada más**.

    Existe porque lo único que había para «empezar otra tanda» era `POST /reset`, que recarga
    el escenario entero: se lleva por delante el decision_log, las posiciones compartidas por
    GPS y todo lo ocurrido. Entre ensayos da igual; con el jurado delante es un botón de
    pánico. Esto solo borra los intentos de llamada, que es lo que de verdad estorba cuando
    quieres volver a llamar a alguien.

    Queda registrado en el decision_log: borrar el tablero es una intervención del mando, y
    el timeline no puede tener un agujero donde desaparecieron doce llamadas.

    `batch_id` acota a una sola ráfaga. Sin él, se vacía entero.
    """
    quien = operator or "puesto de mando"
    with state.lock:
        a_borrar = [
            c.id for c in state.calls.values() if batch_id is None or c.batch_id == batch_id
        ]
        for call_id in a_borrar:
            state.calls.pop(call_id, None)
        if a_borrar:
            state.state_version += 1
            state.t = utcnow_iso()

    if not a_borrar:
        log.info("tablero de llamadas ya vacío%s", f" (ráfaga {batch_id})" if batch_id else "")
        return write_response([], event="calls-reset(vacío)")

    entrada = state.log_action(
        f"{quien} vacía el tablero de llamadas: {len(a_borrar)} intento(s) retirados"
        + (f" de la ráfaga {batch_id}" if batch_id else "")
        + ". El escenario, las posiciones y el resto del historial NO se tocan.",
        type=DecisionType.human_override,
        actor=Actor.human,
        approved_by=quien,
        after={"calls_cleared": len(a_borrar)},
    )
    decisiones = [entrada] if entrada else []
    if entrada:
        state.last_event_id = entrada.id
    return write_response(decisiones, event=f"calls-reset({len(a_borrar)})")
