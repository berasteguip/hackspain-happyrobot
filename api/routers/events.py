"""Eventos del mundo: el fuego se mueve, se corta una carretera, una salida deja de valer, llega
una posición GPS. Los llama el motor de escenario (`engine/`) y la página GPS.

Patrón de todos: (1) se registra el hecho con su propia entrada de decision_log, (2) se pasa el id
de esa entrada como `trigger_event_id` al planner, (3) se devuelven todas las decisiones juntas.
Así el timeline enseña causa → consecuencias.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException

import planner
from fire import head_bearing, minutes_to_front
from geo import haversine_m, bearing_deg
from loader import load_scenario
from models import (
    DecisionType,
    Fire,
    FireEvent,
    FireHistoryEntry,
    PersonStatus,
    PositionEvent,
    PositionSource,
    ResetRequest,
    RoadClosure,
    RoadClosureEvent,
    ExitThreatenedEvent,
    SafeZoneStatus,
    TrajectoryPoint,
    Wind,
    WriteResponse,
    parse_iso,
    utcnow_iso,
)
from routers._common import write_response
from settings import settings
from state import state

log = logging.getLogger("crisis.api.events")

router = APIRouter(tags=["eventos"])

ARRIVED_RADIUS_M = 400.0  # a menos de esto de la zona de salida se considera llegada
MAX_HISTORY = 20


@router.post("/events/fire", response_model=WriteResponse)
def post_fire(event: FireEvent) -> WriteResponse:
    """Nuevo perímetro del incendio. Es el evento que lo mueve todo."""
    anterior = state.fire
    history = list(anterior.history) if anterior else []
    if anterior is not None:
        history.append(
            FireHistoryEntry(t=anterior.updated_at or utcnow_iso(), perimeter=anterior.perimeter)
        )
        history = history[-MAX_HISTORY:]

    # Lo que el evento no trae se hereda del perímetro anterior: el motor de escenario manda
    # perímetros cada 30 s y no tiene por qué repetir viento y tasa en cada uno.
    def heredado(campo: str, valor, por_defecto=None):
        if valor is not None:
            return valor
        return getattr(anterior, campo) if anterior is not None else por_defecto

    fuego = Fire(
        perimeter=event.perimeter,
        wind=heredado("wind", event.wind) or Wind(),
        spread_rate_mh=heredado("spread_rate_mh", event.spread_rate_mh),
        head_bearing_deg=heredado("head_bearing_deg", event.head_bearing_deg),
        cone_half_angle_deg=heredado("cone_half_angle_deg", event.cone_half_angle_deg, 30.0),
        updated_at=event.t or utcnow_iso(),
        history=history,
    )

    # Cuánta gente entra en los próximos 20 min con el perímetro nuevo (para el motivo legible).
    apurados = [
        p
        for p in state.people.values()
        if p.status != PersonStatus.safe
        and p.lat is not None
        and (minutes_to_front(p, fuego) or 9_999) <= 20
    ]
    rumbo = head_bearing(fuego)
    razon = (
        f"Perímetro actualizado: cabeza rumbo {rumbo:.0f}° a {fuego.spread_rate_mh or 0:.0f} m/h"
        if rumbo is not None
        else "Perímetro actualizado"
    )
    razon += f". {len(apurados)} personas a 20 min o menos del frente."

    primera = state.mutate(
        razon,
        type=DecisionType.fire_updated,
        subject_type="fire",
        entity=fuego,
    )
    state.last_event_id = primera.id if primera else None
    # Un perímetro nuevo puede invalidar rutas: se revisan TODAS, pero solo se recalculan las que
    # de verdad cruzan la zona prohibida (contrato: "solo recalcula a quien le cambia algo").
    state.dirty_all_routes = True
    decisiones = [primera] + planner.run_planner(state, trigger_event_id=state.last_event_id)
    return write_response(decisiones, event="fire")


@router.post("/events/road-closure", response_model=WriteResponse)
def post_road_closure(event: RoadClosureEvent) -> WriteResponse:
    """Carretera cortada: invalida las rutas que la usaban."""
    closure = RoadClosure(
        id=state.next_id("rc", width=1),
        road_name=event.road_name,
        geometry=event.geometry,
        reason=event.reason,
        since=event.since or utcnow_iso(),
        source=event.source,
    )
    razon = (
        f"Carretera {closure.road_name or closure.id} CORTADA"
        + (f": {closure.reason}" if closure.reason else "")
        + ". Se revisan las rutas que la usaban."
    )
    primera = state.mutate(
        razon,
        type=DecisionType.road_closed,
        subject_type="road_closure",
        subject_id=closure.id,
        entity=closure,
    )
    state.last_event_id = primera.id if primera else None
    state.dirty_all_routes = True
    decisiones = [primera] + planner.run_planner(state, trigger_event_id=state.last_event_id)
    return write_response(decisiones, event="road-closure")


@router.post("/events/exit-threatened", response_model=WriteResponse)
def post_exit_threatened(event: ExitThreatenedEvent) -> WriteResponse:
    """Una zona de salida deja de valer. Invalida de golpe todas las rutas que iban allí:
    es el evento que fuerza a tirar el plan (criterio "Adaptación")."""
    zone = state.safe_zones.get(event.exit_id)
    if zone is None:
        raise HTTPException(status_code=404, detail=f"zona {event.exit_id} desconocida")
    afectados = [p.id for p in state.people.values() if p.assigned_exit_id == zone.id]
    razon = (
        f"{zone.name or zone.id} queda AMENAZADA"
        + (f": {event.reason}" if event.reason else "")
        + f". {len(afectados)} personas iban allí: se les busca otra salida."
    )
    primera = state.mutate(
        razon,
        type=DecisionType.plan_discarded,
        subject_type="safe_zone",
        subject_id=zone.id,
        changes={"status": SafeZoneStatus.threatened},
        force=True,
    )
    state.last_event_id = primera.id if primera else None
    # La amenaza la reporta alguien de fuera (patrulla, CECOPI) y el planner no la puede deducir
    # del perímetro: sin esto, `_refresh_safe_zones` la devolvería a `open` en la misma pasada.
    # Se quita con un override humano (`POST /human/override` safe_zone.status = open).
    state.set_override("safe_zone", zone.id, "status", SafeZoneStatus.threatened, "informe externo")
    state.mark_exit_dirty(afectados)
    state.mark_route_dirty(afectados)
    decisiones = [primera] + planner.run_planner(state, trigger_event_id=state.last_event_id)
    return write_response(decisiones, event="exit-threatened")


@router.post("/positions", response_model=WriteResponse)
def post_position(event: PositionEvent) -> WriteResponse:
    """Posición GPS (la página del enlace la manda cada 5 s).

    Convierte un punto en una trayectoria: con dos puntos ya hay rumbo y velocidad, y con rumbo
    se puede saber si alguien va hacia el fuego. Solo genera decisión si el movimiento es
    significativo: 120 personas cada 5 s no pueden inundar el timeline.
    """
    person = state.people.get(event.person_id)
    if person is None:
        raise HTTPException(status_code=404, detail=f"persona {event.person_id} desconocida")

    t = event.t or utcnow_iso()
    movido = (
        haversine_m(person.lat, person.lon, event.lat, event.lon)
        if person.lat is not None and person.lon is not None
        else None
    )
    rumbo = (
        bearing_deg(person.lat, person.lon, event.lat, event.lon)
        if movido is not None and movido > 10
        else person.heading_deg
    )
    velocidad = _speed_kmh(person, event, movido, t)

    trayectoria = list(person.trajectory)[-59:] + [
        TrajectoryPoint(lat=event.lat, lon=event.lon, t=t)
    ]
    cambios = {
        "lat": event.lat,
        "lon": event.lon,
        "position_source": PositionSource.gps,
        "position_updated_at": t,
        "trajectory": trayectoria,
        "heading_deg": rumbo,
        "speed_kmh": velocidad,
    }
    significativo = movido is None or movido >= settings.position_significant_move_m
    razon = (
        f"{person.name or person.id} localizado por GPS"
        if movido is None
        else f"{person.name or person.id} se ha movido {movido:.0f} m"
        + (f" a {velocidad:.0f} km/h" if velocidad else "")
        + (f", rumbo {rumbo:.0f}°" if rumbo is not None else "")
    )
    primera = state.mutate(
        razon,
        type=DecisionType.person_located,
        subject_type="person",
        subject_id=person.id,
        changes=cambios,
        log_decision=significativo,
    )
    state.last_event_id = primera.id if primera else state.last_event_id
    decisiones = [primera] if primera else []

    # Primer contacto por GPS: si estaba sin localizar, ya está en el mapa y en movimiento.
    if person.status in {PersonStatus.unknown, PersonStatus.no_answer, PersonStatus.unreachable}:
        decisiones.append(
            state.mutate(
                f"{person.name or person.id} aparece en el mapa por GPS: sale de la lista de "
                "desconocidos.",
                type=DecisionType.person_status_changed,
                subject_type="person",
                subject_id=person.id,
                changes={"status": PersonStatus.moving},
                trigger_event_id=state.last_event_id,
            )
        )
    elif person.status == PersonStatus.contacted and (
        (velocidad or 0) > 2
        # Con el primer punto GPS todavía no hay velocidad (falta el punto anterior), pero si se
        # ha separado de donde decía estar, ya ha salido de casa: eso es ponerse en marcha.
        or (movido is not None and movido >= settings.position_significant_move_m)
    ):
        cuanto = f"{velocidad:.0f} km/h" if velocidad else f"{movido:.0f} m desde donde estaba"
        decisiones.append(
            state.mutate(
                f"{person.name or person.id} se ha puesto en marcha ({cuanto}).",
                type=DecisionType.person_status_changed,
                subject_type="person",
                subject_id=person.id,
                changes={"status": PersonStatus.moving},
                trigger_event_id=state.last_event_id,
            )
        )

    decisiones.extend(_check_arrival(person))

    if movido is None or movido >= 3 * settings.position_significant_move_m:
        state.mark_route_dirty([person.id])  # la ruta sale de donde está, no de donde estaba
    decisiones.extend(planner.run_planner(state, trigger_event_id=state.last_event_id))
    return write_response(decisiones, event="position")


def _speed_kmh(person, event, movido, t) -> float | None:
    """Velocidad a partir del punto anterior de la trayectoria (o `speed_kmh` previo si no hay)."""
    if movido is None or not person.position_updated_at:
        return person.speed_kmh
    antes = parse_iso(person.position_updated_at)
    ahora = parse_iso(t)
    if antes is None or ahora is None:
        return person.speed_kmh
    dt_h = (ahora - antes).total_seconds() / 3600.0
    if dt_h <= 0:
        return person.speed_kmh
    return round((movido / 1000.0) / dt_h, 1)


def _check_arrival(person) -> list:
    """¿Ha llegado a su zona de salida? Entonces está a salvo y libera atención."""
    zone = state.safe_zones.get(person.assigned_exit_id or "")
    if zone is None or zone.lat is None or person.lat is None:
        return []
    if haversine_m(person.lat, person.lon, zone.lat, zone.lon) > ARRIVED_RADIUS_M:
        return []
    if person.status == PersonStatus.safe:
        return []
    entrada = state.mutate(
        f"{person.name or person.id} ha LLEGADO a {zone.name or zone.id}: a salvo.",
        type=DecisionType.person_status_changed,
        subject_type="person",
        subject_id=person.id,
        changes={"status": PersonStatus.safe},
        trigger_event_id=state.last_event_id,
    )
    state.mutate(
        f"ocupación de {zone.name or zone.id}",
        type=DecisionType.person_status_changed,
        subject_type="safe_zone",
        subject_id=zone.id,
        changes={"occupancy": (zone.occupancy or 0) + max(1, person.household_size or 1)},
        log_decision=False,
    )
    return [entrada] if entrada else []


@router.post("/reset", response_model=WriteResponse)
def post_reset(body: ResetRequest | None = None) -> WriteResponse:
    """Rearranca el escenario desde cero. El estado vive en memoria: reiniciar es gratis."""
    nombre = (body.scenario if body else None) or settings.scenario
    resumen = load_scenario(state, nombre)
    razon = (
        f"Escenario '{nombre}' cargado ({resumen.get('people', 0)} personas, "
        f"{resumen.get('houses', 0)} casas, fuente: {resumen.get('source')})."
    )
    primera = state.mutate(
        razon,
        type=DecisionType.fire_updated,
        subject_type="fire",
        entity=state.fire,
    ) if state.fire else None
    state.last_event_id = primera.id if primera else None
    decisiones = ([primera] if primera else []) + planner.run_planner(
        state, trigger_event_id=state.last_event_id
    )
    return write_response(decisiones, event=f"reset({nombre})")
