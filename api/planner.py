"""El cerebro: cada función decide una cosa y **devuelve las decisiones que ha generado**.

Contrato de cada función del planner:
- es **idempotente**: llamarla dos veces sin que cambie nada no genera decisiones;
- es **barata**: no recalcula 120 rutas porque se haya movido un GPS 30 metros;
- cada `DecisionLogEntry` lleva un `reason` en español legible por una persona. Ese texto es lo que
  se ve en el dashboard y es lo que defiende el criterio "Adaptación" delante del jurado.
"""

from __future__ import annotations

import logging
from typing import Any, Iterable

import notify
from fire import (
    distance_to_fire_m,
    fire_threatens_point,
    haversine_between,
    is_in_advance_cone,
    minutes_to_front,
    trajectory_enters_cone,
)
from geo import haversine_m, point_in_polygon, polygon_centroid
from models import (
    Actor,
    Convoy,
    ConvoyRole,
    ConvoyStatus,
    DecisionLogEntry,
    DecisionType,
    House,
    HouseStatus,
    Mobility,
    Patrol,
    PatrolStatus,
    Person,
    PersonStatus,
    PositionSource,
    Route,
    SafeZone,
    SafeZoneStatus,
    Urgency,
    parse_iso,
    utcnow_iso,
)
from priority import (
    house_margin_min,
    house_reason,
    priority_score,
    ranked_no_answer_houses,
)
from routing import avoid_zones_from_state, route_between
from settings import settings

log = logging.getLogger("crisis.planner")

Decisions = list[DecisionLogEntry]

# Estados de los que hay que sacar a alguien (los demás ya no consumen decisiones de ruta).
ACTIVE_STATUSES = {
    PersonStatus.contacted,
    PersonStatus.moving,
    PersonStatus.at_risk,
    PersonStatus.refusing,
}
UNKNOWN_STATUSES = {PersonStatus.unknown, PersonStatus.no_answer, PersonStatus.unreachable}
# Quien puede ir en un convoy de coches.
CONVOY_MOBILITY = {Mobility.car, None}


def _add(decisions: Decisions, entry: DecisionLogEntry | None) -> None:
    if entry is not None:
        decisions.append(entry)


def _first_name(person: Person | None) -> str:
    if person is None or not person.name:
        return ""
    return person.name.strip().split(" ")[0]


def _has_position(entity: Any) -> bool:
    return getattr(entity, "lat", None) is not None and getattr(entity, "lon", None) is not None


def _zone_name(zone: SafeZone | None) -> str:
    if zone is None:
        return "la zona de salida"
    return zone.name or zone.id


def _zone_road(zone: SafeZone | None) -> str | None:
    if zone and zone.access_roads:
        return zone.access_roads[0]
    return None


def _closed_road_names(state) -> list[str]:
    return [rc.road_name for rc in state.road_closures.values() if rc.road_name]


def _km(meters: float | None) -> str:
    if meters is None:
        return "?"
    return f"{meters / 1000:.1f} km".replace(".", ",")


def _min(seconds: float | int | None) -> str:
    if seconds is None:
        return "?"
    return f"{round(float(seconds) / 60)} min"


# ======================================================================================
# 1. Campos derivados (no son decisiones: son la aritmética de un evento ya registrado)
# ======================================================================================


def refresh_derived(state, trigger_event_id: str | None = None) -> Decisions:
    """Recalcula `minutes_to_front`, `priority_score`, sectores, estado de zonas y ranking de casas.

    Los campos derivados se escriben con `log_decision=False`: suben `state_version` (el dashboard
    los ve en el diff) pero no ensucian el timeline con ruido que nadie decidió.
    """
    decisions: Decisions = []
    fire = state.fire

    for person in state.people.values():
        changes: dict[str, Any] = {}
        if _has_position(person):
            sector_id = _sector_for(state, person.lat, person.lon)
            if sector_id and sector_id != person.sector_id:
                changes["sector_id"] = sector_id
        mtf = minutes_to_front(person, fire) if _has_position(person) else None
        if mtf != person.minutes_to_front:
            changes["minutes_to_front"] = mtf
        if changes:
            state.mutate(
                "refresco de campos derivados",
                type=DecisionType.fire_updated,
                subject_type="person",
                subject_id=person.id,
                changes=changes,
                log_decision=False,
            )
        score, _breakdown = priority_score(person, state)
        if score != person.priority_score:
            state.mutate(
                "refresco de prioridad",
                type=DecisionType.fire_updated,
                subject_type="person",
                subject_id=person.id,
                changes={"priority_score": score},
                log_decision=False,
            )

    for house in state.houses.values():
        changes = {}
        if _has_position(house):
            sector_id = _sector_for(state, house.lat, house.lon)
            if sector_id and sector_id != house.sector_id:
                changes["sector_id"] = sector_id
            mtf = minutes_to_front(house, fire)
            if mtf != house.minutes_to_front:
                changes["minutes_to_front"] = mtf
        if changes:
            state.mutate(
                "refresco de campos derivados",
                type=DecisionType.fire_updated,
                subject_type="house",
                subject_id=house.id,
                changes=changes,
                log_decision=False,
            )

    _add_all(decisions, _refresh_safe_zones(state, trigger_event_id))
    _refresh_house_ranks(state)
    return decisions


def _add_all(decisions: Decisions, more: Iterable[DecisionLogEntry]) -> None:
    for entry in more:
        _add(decisions, entry)


def _sector_for(state, lat: float, lon: float) -> str | None:
    for sector in state.sectors.values():
        if sector.polygon and point_in_polygon(lat, lon, sector.polygon.ring()):
            return sector.id
    return None


def _refresh_safe_zones(state, trigger_event_id: str | None) -> Decisions:
    """Capacidad y amenaza. Que una zona pase a `threatened` invalida todas las rutas que van allí."""
    decisions: Decisions = []
    for zone in state.safe_zones.values():
        if not _has_position(zone):
            continue
        distancia = distance_to_fire_m(zone, state.fire)
        if distancia != zone.distance_to_fire_m:
            state.mutate(
                "refresco de distancia al fuego",
                type=DecisionType.fire_updated,
                subject_type="safe_zone",
                subject_id=zone.id,
                changes={"distance_to_fire_m": distancia},
                log_decision=False,
            )
        if zone.status == SafeZoneStatus.closed or state.is_overridden(
            "safe_zone", zone.id, "status"
        ):
            continue
        amenazada = state.fire is not None and fire_threatens_point(
            zone, state.fire, settings.safe_zone_threatened_m
        )
        if amenazada and zone.status != SafeZoneStatus.threatened:
            motivo = (
                f"Zona de salida {_zone_name(zone)} AMENAZADA: el frente a {_km(distancia)}"
                + (" y el cono de avance apunta a ella" if is_in_advance_cone(zone, state.fire) else "")
                + ". Invalida todas las rutas que iban allí."
            )
            _add(
                decisions,
                state.mutate(
                    motivo,
                    # El contrato §2.6 no tiene un tipo `exit_threatened`; `fire_updated` es el
                    # tipo honesto porque la causa es el movimiento del frente.
                    type=DecisionType.fire_updated,
                    subject_type="safe_zone",
                    subject_id=zone.id,
                    changes={"status": SafeZoneStatus.threatened},
                    trigger_event_id=trigger_event_id,
                ),
            )
            state.mark_exit_dirty(
                p.id for p in state.people.values() if p.assigned_exit_id == zone.id
            )
        elif not amenazada and zone.capacity:
            ratio = (zone.occupancy or 0) / max(1, zone.capacity)
            nuevo = (
                SafeZoneStatus.filling
                if ratio >= settings.safe_zone_filling_ratio
                else SafeZoneStatus.open
            )
            if zone.status in {SafeZoneStatus.open, SafeZoneStatus.filling, SafeZoneStatus.threatened}:
                if nuevo != zone.status:
                    state.mutate(
                        f"{_zone_name(zone)}: ocupación {ratio:.0%}",
                        type=DecisionType.fire_updated,
                        subject_type="safe_zone",
                        subject_id=zone.id,
                        changes={"status": nuevo},
                        log_decision=False,
                    )
    return decisions


def _refresh_house_ranks(state) -> None:
    for rank, house in enumerate(ranked_no_answer_houses(state), start=1):
        if house.priority_rank != rank:
            state.mutate(
                "refresco del puesto en la lista de casas sin contestar",
                type=DecisionType.house_escalated_to_patrol,
                subject_type="house",
                subject_id=house.id,
                changes={"priority_rank": rank},
                log_decision=False,
            )
    # Las casas que salieron de la lista pierden el puesto.
    en_lista = {h.id for h in ranked_no_answer_houses(state)}
    for house in state.houses.values():
        if house.id not in en_lista and house.priority_rank is not None:
            state.mutate(
                "fuera de la lista de casas sin contestar",
                type=DecisionType.house_escalated_to_patrol,
                subject_type="house",
                subject_id=house.id,
                changes={"priority_rank": None},
                log_decision=False,
            )


# ======================================================================================
# 2. Geofence: quién va hacia el fuego
# ======================================================================================


def detect_at_risk(state, trigger_event_id: str | None = None) -> Decisions:
    """Personas cuya trayectoria entra en el cono de avance → `at_risk` y llamada EN EL ACTO."""
    decisions: Decisions = []
    if state.fire is None:
        return decisions

    for person in state.people.values():
        if not _has_position(person) or person.status == PersonStatus.safe:
            continue
        if state.is_overridden("person", person.id, "status"):
            continue

        entra = trajectory_enters_cone(person, state.fire, settings.at_risk_horizon_min)
        parado = _is_stalled(person)

        if person.status in {PersonStatus.moving, PersonStatus.contacted} and (entra or parado):
            motivo = (
                "Su trayectoria entra en el cono de avance del fuego"
                if entra
                else f"Lleva más de {settings.stalled_minutes:.0f} min sin moverse"
            )
            razon = f"{person.name or person.id} pasa a at_risk: {motivo}. Se le llama en el acto."
            _add(
                decisions,
                state.mutate(
                    razon,
                    type=DecisionType.person_status_changed,
                    subject_type="person",
                    subject_id=person.id,
                    changes={"status": PersonStatus.at_risk},
                    trigger_event_id=trigger_event_id,
                ),
            )
            aviso = build_instruction(state, person)
            notify.place_call(
                person,
                motivo,
                state,
                say_this=aviso["say_this"],
                trigger_event_id=trigger_event_id,
            )
            state.mark_exit_dirty([person.id])
            state.mark_route_dirty([person.id])
        elif person.status == PersonStatus.at_risk and not entra and not parado:
            _add(
                decisions,
                state.mutate(
                    f"{person.name or person.id} vuelve a ruta segura: ya no va hacia el cono "
                    "de avance.",
                    type=DecisionType.person_status_changed,
                    subject_type="person",
                    subject_id=person.id,
                    changes={"status": PersonStatus.moving},
                    trigger_event_id=trigger_event_id,
                ),
            )
    return decisions


def _is_stalled(person: Person) -> bool:
    """Se ha parado: en `moving`, velocidad ~0 y sin posición nueva desde hace rato."""
    if person.status != PersonStatus.moving:
        return False
    if person.speed_kmh is None or person.speed_kmh > 2.0:
        return False
    last = parse_iso(person.position_updated_at)
    if last is None:
        return False
    from datetime import datetime, timezone

    minutos = (datetime.now(timezone.utc) - last).total_seconds() / 60.0
    return minutos >= settings.stalled_minutes


# ======================================================================================
# 3. Reparto por zonas de salida
# ======================================================================================


def assign_exits(state, trigger_event_id: str | None = None) -> Decisions:
    """Reparte personas a zonas seguras por proximidad, capacidad y seguridad de la ruta."""
    decisions: Decisions = []
    disponibles = [
        z
        for z in state.safe_zones.values()
        if z.status in {SafeZoneStatus.open, SafeZoneStatus.filling} and _has_position(z)
    ]
    if not disponibles:
        if state.safe_zones:
            log.warning("ninguna zona de salida disponible: todas amenazadas o cerradas")
        return decisions

    avoid = avoid_zones_from_state(state)
    # Ocupación proyectada: la gente ya asignada cuenta para la capacidad.
    proyectada: dict[str, int] = {z.id: (z.occupancy or 0) for z in state.safe_zones.values()}
    for p in state.people.values():
        if p.assigned_exit_id in proyectada and p.status != PersonStatus.safe:
            proyectada[p.assigned_exit_id] += max(1, p.household_size or 1)

    for person in _people_needing_exit(state, disponibles):
        candidatos = sorted(
            disponibles,
            key=lambda z: haversine_m(person.lat, person.lon, z.lat, z.lon),
        )[:2]  # solo enrutamos las dos más cercanas: el planner tiene que ser barato
        mejor = None
        for zone in candidatos:
            libre = (zone.capacity or 10**6) - proyectada.get(zone.id, 0)
            if libre <= 0:
                continue
            result = route_between((person.lat, person.lon), (zone.lat, zone.lon), avoid)
            coste = result.duration_s
            penalizaciones = []
            if result.crosses_avoid:
                coste += 1800
                penalizaciones.append("la ruta pisa zona prohibida")
            if zone.status == SafeZoneStatus.filling:
                coste += 300
                penalizaciones.append("zona casi llena")
            if mejor is None or coste < mejor[0]:
                mejor = (coste, zone, result, penalizaciones)
        if mejor is None:
            continue
        _coste, zone, result, penalizaciones = mejor
        if zone.id == person.assigned_exit_id:
            continue  # idempotencia

        anterior = state.safe_zones.get(person.assigned_exit_id or "")
        motivo_anterior = ""
        if anterior is not None:
            motivo_anterior = (
                f" La anterior ({_zone_name(anterior)}) está {anterior.status.value}."
            )
        razon = (
            f"{person.name or person.id} → {_zone_name(zone)} ({zone.id}): "
            f"{_km(result.distance_m)} por {_zone_road(zone) or 'la carretera de acceso'}, "
            f"{_min(result.duration_s)}.{motivo_anterior}"
        )
        if penalizaciones:
            razon += " Aviso: " + "; ".join(penalizaciones) + "."
        _add(
            decisions,
            state.mutate(
                razon,
                type=DecisionType.exit_reassigned,
                subject_type="person",
                subject_id=person.id,
                changes={"assigned_exit_id": zone.id},
                trigger_event_id=trigger_event_id,
            ),
        )
        proyectada[zone.id] = proyectada.get(zone.id, 0) + max(1, person.household_size or 1)
        state.mark_route_dirty([person.id])
        state.dirty_exits.discard(person.id)
    return decisions


def _people_needing_exit(state, disponibles: list[SafeZone]) -> list[Person]:
    ids_ok = {z.id for z in disponibles}
    salida: list[Person] = []
    for person in state.people.values():
        if person.status == PersonStatus.safe or not _has_position(person):
            continue
        if state.is_overridden("person", person.id, "assigned_exit_id"):
            continue  # un humano lo fijó: el planner no lo revierte
        if (
            person.assigned_exit_id is None
            or person.assigned_exit_id not in ids_ok
            or person.id in state.dirty_exits
        ):
            salida.append(person)
    return salida


# ======================================================================================
# 4. Rutas: solo a quien le cambia algo
# ======================================================================================


def recompute_routes(state, only_affected: bool = True, trigger_event_id: str | None = None) -> Decisions:
    """Recalcula rutas. Con `only_affected=True` (lo normal) solo toca a quien le cambia algo:
    sin ruta, con la salida cambiada, con la ruta pisando el fuego o una carretera cortada."""
    decisions: Decisions = []
    avoid = avoid_zones_from_state(state)
    afectados = _people_needing_route(state, only_affected, avoid)
    if not afectados:
        state.dirty_routes.clear()
        state.dirty_all_routes = False
        return decisions

    log.info(
        "recalculo de rutas: %d de %d personas (only_affected=%s)",
        len(afectados),
        len(state.people),
        only_affected,
    )
    for person, causa in afectados:
        zone = state.safe_zones.get(person.assigned_exit_id or "")
        if zone is None or not _has_position(zone):
            continue
        result = route_between((person.lat, person.lon), (zone.lat, zone.lon), avoid)
        antigua = person.assigned_route
        if antigua and antigua.polyline == result.polyline:
            continue  # misma ruta: nada que contar a nadie
        nueva: Route = result.to_route()
        razon = (
            f"Ruta a {_zone_name(zone)}: {_km(result.distance_m)} / {_min(result.duration_s)}"
            f" por {_zone_road(zone) or 'carretera de acceso'} ({result.source}). {causa}"
        )
        if result.notes:
            razon += " " + " ".join(result.notes) + "."
        entry = state.mutate(
            razon,
            type=DecisionType.route_recalculated,
            subject_type="person",
            subject_id=person.id,
            changes={"assigned_route": nueva},
            trigger_event_id=trigger_event_id,
        )
        _add(decisions, entry)
        state.dirty_routes.discard(person.id)
        # Solo se escribe a quien le cambia la instrucción (sección 3 del escenario).
        if person.status in ACTIVE_STATUSES and antigua is not None:
            aviso = build_instruction(state, person)
            if person.status == PersonStatus.at_risk or person.convoy_role == ConvoyRole.leader:
                notify.place_call(
                    person,
                    "cambio de ruta",
                    state,
                    say_this=aviso["say_this"],
                    trigger_event_id=trigger_event_id,
                )
            else:
                notify.send_sms(
                    person,
                    aviso["say_this"],
                    state,
                    reason="cambio de ruta",
                    trigger_event_id=trigger_event_id,
                )
    state.dirty_all_routes = False
    return decisions


def _people_needing_route(state, only_affected: bool, avoid) -> list[tuple[Person, str]]:
    afectados: list[tuple[Person, str]] = []
    for person in state.people.values():
        if person.status == PersonStatus.safe or not _has_position(person):
            continue
        if not person.assigned_exit_id:
            continue
        if state.is_overridden("person", person.id, "assigned_route"):
            continue
        if person.assigned_route is None:
            afectados.append((person, "No tenía ruta."))
            continue
        if not only_affected or state.dirty_all_routes:
            puntos = state.route_points(person)
            if puntos and avoid.path_is_blocked(puntos):
                afectados.append((person, "Su ruta anterior cruzaba la zona prohibida."))
            elif not only_affected:
                afectados.append((person, "Recálculo completo solicitado."))
            continue
        if person.id in state.dirty_routes:
            afectados.append((person, "Cambió su situación (posición o salida)."))
    return afectados


# ======================================================================================
# 5. Convoyes
# ======================================================================================


def form_convoys(state, trigger_event_id: str | None = None) -> Decisions:
    """Agrupa por zona de salida + corredor, nombra coche guía y pone al resto a seguirlo."""
    decisions: Decisions = []
    grupos: dict[tuple[str, str], list[Person]] = {}
    for person in state.people.values():
        if person.status not in {PersonStatus.contacted, PersonStatus.moving}:
            continue
        if not person.assigned_exit_id or not _has_position(person):
            continue
        if person.mobility not in CONVOY_MOBILITY:
            continue  # a pie, movilidad reducida o encamada no van en convoy de coches
        if state.is_overridden("person", person.id, "convoy_id"):
            continue
        clave = (person.assigned_exit_id, _corridor_key(person))
        grupos.setdefault(clave, []).append(person)

    for (exit_id, corridor), miembros in grupos.items():
        if len(miembros) < settings.convoy_min_members:
            continue
        guia = _pick_leader(miembros)
        seguidores = [p for p in miembros if p.id != guia.id]
        ids = [guia.id] + [p.id for p in seguidores]
        existente = _existing_convoy(state, exit_id, ids)
        zone = state.safe_zones.get(exit_id)
        vehiculo = _vehicle_description(guia)

        if existente is None:
            convoy = Convoy(
                id=state.next_id("c", width=1),
                exit_id=exit_id,
                leader_person_id=guia.id,
                member_ids=ids,
                vehicle_description=vehiculo,
                route=guia.assigned_route,
                status=ConvoyStatus.forming,
                formed_at=utcnow_iso(),
                cohesion_ok=True,
            )
            razon = (
                f"Convoy {convoy.id} formado: {len(ids)} vehículos salen juntos por "
                f"{_zone_road(zone) or 'la misma carretera'} hacia {_zone_name(zone)}. "
                f"Guía {guia.name or guia.id} ({vehiculo})"
                f"{' — tiene smartphone' if guia.has_smartphone else ''}. "
                f"Al resto se le dice a quién seguir en vez de darle 3 rutas distintas "
                f"(corredor {corridor})."
            )
            _add(
                decisions,
                state.mutate(
                    razon,
                    type=DecisionType.convoy_formed,
                    subject_type="convoy",
                    subject_id=convoy.id,
                    entity=convoy,
                    trigger_event_id=trigger_event_id,
                ),
            )
            _apply_convoy_roles(state, convoy, guia, seguidores, trigger_event_id)
        elif set(existente.member_ids) != set(ids) or existente.leader_person_id != guia.id:
            razon = (
                f"Convoy {existente.id} reagrupado: ahora son {len(ids)} vehículos "
                f"(guía {guia.name or guia.id}, {vehiculo})."
            )
            _add(
                decisions,
                state.mutate(
                    razon,
                    type=DecisionType.convoy_regrouped,
                    subject_type="convoy",
                    subject_id=existente.id,
                    changes={
                        "member_ids": ids,
                        "leader_person_id": guia.id,
                        "vehicle_description": vehiculo,
                        "cohesion_ok": True,
                        "status": ConvoyStatus.forming,
                    },
                    trigger_event_id=trigger_event_id,
                ),
            )
            _apply_convoy_roles(state, existente, guia, seguidores, trigger_event_id)
    return decisions


def _corridor_key(person: Person) -> str:
    """Corredor de salida: el sector si lo hay, y si no una celda de ~2 km."""
    if person.sector_id:
        return person.sector_id
    return f"g{round(person.lat / 0.02)}:{round(person.lon / 0.02)}"


def _pick_leader(miembros: list[Person]) -> Person:
    """Guía: prioriza `has_smartphone` y `mobility == car`, luego GPS real y menos prisa."""
    def clave(p: Person) -> tuple:
        return (
            1 if p.has_smartphone else 0,
            1 if p.mobility == Mobility.car else 0,
            1 if (p.position_source and p.position_source.value == "gps") else 0,
            -(p.minutes_to_front if p.minutes_to_front is not None else 9999.0),
        )

    return max(miembros, key=clave)


def _vehicle_description(leader: Person) -> str:
    """El contrato no da un campo de vehículo en `Person`: si las notas del escenario traen
    `vehículo: ...` lo usamos, y si no describimos el coche por su dueño."""
    notas = (leader.notes or "").strip()
    for marca in ("vehículo:", "vehiculo:", "coche:"):
        if marca in notas.lower():
            idx = notas.lower().index(marca) + len(marca)
            return notas[idx:].split(".")[0].strip() or f"el coche de {_first_name(leader)}"
    nombre = _first_name(leader)
    return f"el coche de {nombre}" if nombre else "el coche del guía"


def _existing_convoy(state, exit_id: str, ids: list[str]) -> Convoy | None:
    for convoy in state.convoys.values():
        if convoy.status == ConvoyStatus.arrived:
            continue
        if convoy.exit_id != exit_id:
            continue
        if set(convoy.member_ids) & set(ids):
            return convoy
    return None


def _apply_convoy_roles(
    state, convoy: Convoy, guia: Person, seguidores: list[Person], trigger_event_id: str | None
) -> None:
    state.mutate(
        f"guía del convoy {convoy.id}",
        type=DecisionType.convoy_formed,
        subject_type="person",
        subject_id=guia.id,
        changes={"convoy_id": convoy.id, "convoy_role": ConvoyRole.leader},
        log_decision=False,
    )
    for seguidor in seguidores:
        state.mutate(
            f"sigue al guía del convoy {convoy.id}",
            type=DecisionType.convoy_formed,
            subject_type="person",
            subject_id=seguidor.id,
            changes={"convoy_id": convoy.id, "convoy_role": ConvoyRole.follower},
            log_decision=False,
        )
        aviso = build_instruction(state, seguidor)
        notify.send_sms(
            seguidor,
            aviso["say_this"],
            state,
            reason=f"convoy {convoy.id}: a quién seguir",
            trigger_event_id=trigger_event_id,
        )


def check_convoy_cohesion(state, trigger_event_id: str | None = None) -> Decisions:
    """`cohesion_ok=False` cuando un miembro se separa más de 1,5 km del guía (contrato §2.5)."""
    decisions: Decisions = []
    for convoy in list(state.convoys.values()):
        if convoy.status == ConvoyStatus.arrived:
            continue
        guia = state.people.get(convoy.leader_person_id or "")
        if guia is None or not _has_position(guia):
            continue
        separados: list[tuple[Person, float]] = []
        for member_id in convoy.member_ids:
            if member_id == guia.id:
                continue
            miembro = state.people.get(member_id)
            if miembro is None or not _has_position(miembro):
                continue
            d = haversine_between(miembro, guia) or 0.0
            if d > settings.convoy_cohesion_m:
                separados.append((miembro, d))

        guia_parado = _is_stalled(guia)
        roto = bool(separados) or guia_parado

        if roto and convoy.cohesion_ok:
            if guia_parado:
                razon = (
                    f"Convoy {convoy.id} ROTO: el guía {guia.name or guia.id} lleva parado "
                    f"más de {settings.stalled_minutes:.0f} min. Se le llama."
                )
            else:
                detalle = ", ".join(
                    f"{p.name or p.id} a {_km(d)}" for p, d in separados
                )
                razon = (
                    f"Convoy {convoy.id} ROTO: se ha separado más de "
                    f"{settings.convoy_cohesion_m / 1000:.1f} km ({detalle}). Se llama al que se "
                    "quedó atrás."
                )
            _add(
                decisions,
                state.mutate(
                    razon,
                    type=DecisionType.convoy_broken,
                    subject_type="convoy",
                    subject_id=convoy.id,
                    changes={"cohesion_ok": False, "status": ConvoyStatus.broken},
                    trigger_event_id=trigger_event_id,
                ),
            )
            objetivo = guia if guia_parado else separados[0][0]
            aviso = build_instruction(state, objetivo)
            notify.place_call(
                objetivo,
                f"convoy {convoy.id} roto",
                state,
                say_this=aviso["say_this"],
                trigger_event_id=trigger_event_id,
            )
        elif not roto and not convoy.cohesion_ok:
            _add(
                decisions,
                state.mutate(
                    f"Convoy {convoy.id} reagrupado: todos los vehículos vuelven a estar a menos "
                    f"de {settings.convoy_cohesion_m / 1000:.1f} km del guía.",
                    type=DecisionType.convoy_regrouped,
                    subject_type="convoy",
                    subject_id=convoy.id,
                    changes={"cohesion_ok": True, "status": ConvoyStatus.moving},
                    trigger_event_id=trigger_event_id,
                ),
            )

        miembros = [state.people.get(m) for m in convoy.member_ids]
        if miembros and all(m is not None and m.status == PersonStatus.safe for m in miembros):
            state.mutate(
                f"Convoy {convoy.id}: todos sus miembros están a salvo.",
                type=DecisionType.convoy_regrouped,
                subject_type="convoy",
                subject_id=convoy.id,
                changes={"status": ConvoyStatus.arrived},
                log_decision=False,
            )
    return decisions


# ======================================================================================
# 6. Casas sin contestar y patrullas
# ======================================================================================


def escalate_houses_to_patrol(state, trigger_event_id: str | None = None) -> Decisions:
    """Casa llamada dos veces sin respuesta → lista viva de la patrulla. Y al revés: quien
    contesta o aparece en el mapa sale de la lista."""
    decisions: Decisions = []
    for house in state.houses.values():
        habitantes = [p for p in state.people.values() if p.house_id == house.id]
        # "Localizado" = o su estado ya no es de desconocido, o hay un punto GPS real. Una posición
        # `declared` NO cuenta: es justo el caso de "creemos que está en casa" que la patrulla va a
        # comprobar (si valiera, un vecino diciendo "Josefa está en su casa" sacaría la casa de la
        # lista sin que nadie la haya visto).
        localizados = [
            p
            for p in habitantes
            if p.status not in UNKNOWN_STATUSES
            or (_has_position(p) and p.position_source == PositionSource.gps)
        ]

        if (
            house.status in {HouseStatus.pending, HouseStatus.calling}
            and house.answered is not True
            and (house.call_attempts or 0) >= settings.escalate_after_attempts
            and not localizados
        ):
            razon = (
                f"{house.address or house.id}: {house.call_attempts} llamadas sin respuesta. "
                f"Entra en la lista de la patrulla ({house_reason(house)})."
            )
            _add(
                decisions,
                state.mutate(
                    razon,
                    type=DecisionType.house_escalated_to_patrol,
                    subject_type="house",
                    subject_id=house.id,
                    changes={"status": HouseStatus.no_answer},
                    trigger_event_id=trigger_event_id,
                ),
            )
        elif house.status == HouseStatus.no_answer and localizados:
            quien = localizados[0]
            razon = (
                f"{house.address or house.id} sale de la lista de la patrulla: "
                f"{quien.name or quien.id} ya está localizado ({quien.status.value}). "
                "La patrulla no tiene que ir."
            )
            _add(
                decisions,
                state.mutate(
                    razon,
                    # El contrato §2.6 no tiene un tipo para "sale de la lista";
                    # `person_status_changed` es la causa real del cambio.
                    type=DecisionType.person_status_changed,
                    subject_type="house",
                    subject_id=house.id,
                    changes={
                        "status": HouseStatus.answered,
                        "assigned_patrol_id": None,
                        "patrol_eta_min": None,
                    },
                    trigger_event_id=trigger_event_id,
                ),
            )
            patrulla = state.patrols.get(house.assigned_patrol_id or "")
            if patrulla and house.id in patrulla.assigned_house_ids:
                state.mutate(
                    f"{house.id} fuera de la lista de {patrulla.id}",
                    type=DecisionType.patrol_assigned,
                    subject_type="patrol",
                    subject_id=patrulla.id,
                    changes={
                        "assigned_house_ids": [
                            h for h in patrulla.assigned_house_ids if h != house.id
                        ]
                    },
                    log_decision=False,
                )
    _refresh_house_ranks(state)
    return decisions


def assign_patrols(state, trigger_event_id: str | None = None) -> Decisions:
    """Reparte las casas sin contestar entre las patrullas, por orden de la lista viva.

    Si el frente llega antes que la patrulla (margen negativo) **no se asigna**: se pide
    aprobación humana, porque mandar allí a la patrulla es matarla (contrato §2.2).
    """
    decisions: Decisions = []
    patrullas = [p for p in state.patrols.values() if p.status != PatrolStatus.unavailable]
    if not patrullas:
        return decisions

    # El puesto se toma de esta misma pasada: `house.priority_rank` puede estar sin refrescar si
    # la casa acabó en la lista por otra vía, y el motivo lo lee un humano ("puesto None" no vale).
    for puesto, house in enumerate(ranked_no_answer_houses(state), start=1):
        if house.assigned_patrol_id:
            continue
        if not _has_position(house):
            continue
        candidatas = [
            p
            for p in patrullas
            if len(p.assigned_house_ids) < settings.max_houses_per_patrol and _has_position(p)
        ]
        if not candidatas:
            break
        patrulla = min(candidatas, key=lambda p: _patrol_eta_min(p, house))
        eta = _patrol_eta_min(patrulla, house)
        state.mutate(
            "ETA de patrulla recalculada",
            type=DecisionType.patrol_assigned,
            subject_type="house",
            subject_id=house.id,
            changes={"patrol_eta_min": eta},
            log_decision=False,
        )
        margen = house_margin_min(house)
        if margen is not None and margen < 0:
            _add(decisions, _request_patrol_approval(state, house, patrulla, trigger_event_id))
            continue
        razon = (
            f"{patrulla.name or patrulla.id} → {house.address or house.id} "
            f"(puesto {house.priority_rank or puesto} de la lista). {house_reason(house)}"
        )
        _add(
            decisions,
            state.mutate(
                razon,
                type=DecisionType.patrol_assigned,
                subject_type="house",
                subject_id=house.id,
                changes={"assigned_patrol_id": patrulla.id},
                trigger_event_id=trigger_event_id,
            ),
        )
        state.mutate(
            f"{house.id} asignada a {patrulla.id}",
            type=DecisionType.patrol_assigned,
            subject_type="patrol",
            subject_id=patrulla.id,
            changes={
                "assigned_house_ids": patrulla.assigned_house_ids + [house.id],
                "status": PatrolStatus.en_route,
            },
            log_decision=False,
        )
    return decisions


def _patrol_eta_min(patrol: Patrol, house: House) -> float:
    """ETA por carretera aproximada: distancia recta × 1,3 a la velocidad de patrulla."""
    d = haversine_m(patrol.lat, patrol.lon, house.lat, house.lon) * 1.3
    return round((d / 1000.0) / max(1.0, settings.patrol_speed_kmh) * 60.0, 1)


def _request_patrol_approval(
    state, house: House, patrulla: Patrol, trigger_event_id: str | None
) -> DecisionLogEntry | None:
    """Mandar una patrulla a una casa que el fuego alcanza antes exige visto bueno humano."""
    ya_pedida = any(
        a.action == "assign_patrol" and a.payload.get("house_id") == house.id
        for a in state.pending_approvals.values()
    )
    if ya_pedida:
        return None
    razon = (
        f"APROBACIÓN NECESARIA para mandar a {patrulla.name or patrulla.id} a "
        f"{house.address or house.id}: {house_reason(house)}"
    )
    entry = state.mutate(
        razon,
        type=DecisionType.approval_requested,
        subject_type="house",
        subject_id=house.id,
        changes={},
        force=True,
        trigger_event_id=trigger_event_id,
    )
    if entry is not None:
        from state import PendingApproval

        state.pending_approvals[entry.id] = PendingApproval(
            decision_id=entry.id,
            action="assign_patrol",
            payload={"house_id": house.id, "patrol_id": patrulla.id},
            reason=razon,
        )
    return entry


# ======================================================================================
# 7. Prioridad de medios aéreos
# ======================================================================================


def recompute_air_priority(state, trigger_event_id: str | None = None) -> Decisions:
    """Ordena los sectores por personas dentro, vulnerables y minutos al frente.

    Es el enlace entre el censo civil y la táctica de extinción (sección 4.3 del escenario).
    """
    decisions: Decisions = []
    if not state.sectors:
        return decisions

    metricas: dict[str, dict] = {}
    for sector in state.sectors.values():
        ring = sector.polygon.ring() if sector.polygon else []
        dentro = [
            p
            for p in state.people.values()
            if _has_position(p)
            and p.status != PersonStatus.safe
            and ring
            and point_in_polygon(p.lat, p.lon, ring)
        ]
        desconocidas = [
            h
            for h in state.houses.values()
            if h.sector_id == sector.id
            and h.status in {HouseStatus.no_answer, HouseStatus.pending, HouseStatus.calling}
        ]
        vulnerables = len(
            [p for p in dentro if p.mobility in {Mobility.reduced, Mobility.immobile}]
        ) + len([h for h in desconocidas if h.vulnerable])
        minutos = [p.minutes_to_front for p in dentro if p.minutes_to_front is not None]
        minutos += [
            h.minutes_to_front for h in desconocidas if h.minutes_to_front is not None
        ]
        if minutos:
            mtf = min(minutos)
        elif ring and state.fire:
            clat, clon = polygon_centroid(ring)
            mtf = minutes_to_front((clat, clon), state.fire)
        else:
            mtf = None
        metricas[sector.id] = {
            "people_inside": len(dentro),
            "people_unknown": len(desconocidas),
            "vulnerable_inside": vulnerables,
            "minutes_to_front": mtf,
            "peso": len(dentro) + 1.5 * len(desconocidas) + 2.0 * vulnerables,
        }

    orden = sorted(
        metricas.items(),
        key=lambda kv: (-kv[1]["peso"], kv[1]["minutes_to_front"] if kv[1]["minutes_to_front"] is not None else 9999),
    )
    for rank, (sector_id, m) in enumerate(orden, start=1):
        sector = state.sectors[sector_id]
        razon = (
            f"{m['people_inside']} personas dentro, {m['people_unknown']} sin localizar, "
            f"{m['vulnerable_inside']} vulnerable(s)"
            + (
                f", frente a {m['minutes_to_front']:.0f} min"
                if m["minutes_to_front"] is not None
                else ", frente sin estimar"
            )
        )
        state.mutate(
            "refresco de métricas de sector",
            type=DecisionType.air_priority_changed,
            subject_type="sector",
            subject_id=sector_id,
            changes={
                "people_inside": m["people_inside"],
                "people_unknown": m["people_unknown"],
                "vulnerable_inside": m["vulnerable_inside"],
                "minutes_to_front": m["minutes_to_front"],
                "air_priority_reason": razon,
            },
            log_decision=False,
        )
        if sector.air_priority_rank != rank:
            anterior = sector.air_priority_rank
            texto = (
                f"Prioridad de descarga aérea: {sector.name or sector_id} pasa a #{rank}"
                + (f" (venía de #{anterior})" if anterior else "")
                + f". {razon}. El mapa de gente manda sobre los medios aéreos."
            )
            _add(
                decisions,
                state.mutate(
                    texto,
                    type=DecisionType.air_priority_changed,
                    subject_type="sector",
                    subject_id=sector_id,
                    changes={"air_priority_rank": rank},
                    trigger_event_id=trigger_event_id,
                ),
            )
    return decisions


# ======================================================================================
# 8. Orquestación
# ======================================================================================


def run_planner(state, trigger_event_id: str | None = None, full: bool = False) -> Decisions:
    """Se llama tras CADA evento. Idempotente y barato: sin cambios, cero decisiones."""
    decisions: Decisions = []
    _add_all(decisions, refresh_derived(state, trigger_event_id))
    _add_all(decisions, detect_at_risk(state, trigger_event_id))
    _add_all(decisions, escalate_houses_to_patrol(state, trigger_event_id))
    _add_all(decisions, assign_exits(state, trigger_event_id))
    _add_all(decisions, recompute_routes(state, only_affected=not full, trigger_event_id=trigger_event_id))
    _add_all(decisions, form_convoys(state, trigger_event_id))
    _add_all(decisions, check_convoy_cohesion(state, trigger_event_id))
    _add_all(decisions, assign_patrols(state, trigger_event_id))
    _add_all(decisions, recompute_air_priority(state, trigger_event_id))
    return decisions


# ======================================================================================
# 9. La frase que dice el agente de voz
# ======================================================================================


def urgency_for(minutes: float | None) -> Urgency:
    if minutes is None:
        return Urgency.unknown
    if minutes <= 10:
        return Urgency.critical
    if minutes <= 25:
        return Urgency.high
    if minutes <= 60:
        return Urgency.medium
    return Urgency.low


def build_instruction(state, person: Person) -> dict:
    """Lo que devuelve `GET /instructions/{person_id}`: una tool del agente de voz.

    `say_this` es la frase literal: español natural, corta, para decírsela por teléfono a alguien
    asustado. Sin jerga, sin coordenadas, sin ids. Que el TTS no improvise en algo que puede matar
    a alguien.
    """
    zone = state.safe_zones.get(person.assigned_exit_id or "")
    convoy = state.convoys.get(person.convoy_id or "")
    guia = state.people.get(convoy.leader_person_id or "") if convoy else None
    road = _zone_road(zone)
    destino = _zone_name(zone)
    nombre = _first_name(person)
    saludo = f"{nombre}, " if nombre else ""
    por_donde = f"por {road} " if road else ""
    cortadas = _closed_road_names(state)
    # Usted, como el resto de las frases: el TTS lee esto literalmente (contrato §2.1).
    evita = f" No coja {cortadas[0]}." if cortadas else ""
    minutos = person.minutes_to_front

    if person.status == PersonStatus.safe:
        say = (
            f"{saludo}ya está en {destino}. Quédese ahí, no vuelva a casa hasta que le avisemos "
            "nosotros."
        )
    elif zone is None:
        say = (
            f"{saludo}prepárese para salir ya: documentación, agua y las llaves del coche. "
            "En un momento le decimos por qué carretera tiene que salir."
        )
    elif person.status == PersonStatus.at_risk:
        say = (
            f"{saludo}pare y escúcheme: el fuego se está metiendo por donde va. "
            f"Dé la vuelta y salga {por_donde}hacia {destino}.{evita}"
        )
    elif person.status == PersonStatus.refusing:
        cuanto = f" en unos {minutos:.0f} minutos" if minutos is not None else " muy pronto"
        say = (
            f"{saludo}entiendo que no quiera dejar la casa, pero el fuego llega{cuanto} y después "
            f"no vamos a poder entrar a buscarle. Coja lo justo y salga {por_donde}hacia {destino}."
        )
    elif person.mobility in {Mobility.immobile, Mobility.reduced}:
        say = (
            f"{saludo}no salga andando. Quédese junto a la puerta de la calle con la luz encendida: "
            "va alguien a recogerle y le llevamos a un sitio seguro."
        )
    elif convoy is not None and person.convoy_role == ConvoyRole.follower and guia is not None:
        say = (
            f"{saludo}salga ya {por_donde}hacia {destino}. No vaya solo: siga a "
            f"{convoy.vehicle_description or 'el coche del guía'}, el de "
            f"{_first_name(guia) or 'su vecino'}, que va delante.{evita}"
        )
    elif convoy is not None and person.convoy_role == ConvoyRole.leader:
        otros = max(0, len(convoy.member_ids) - 1)
        say = (
            f"{saludo}salga ya {por_donde}hacia {destino}. Detrás van {otros} coches siguiéndole: "
            f"no cambie de carretera sin que le avisemos.{evita}"
        )
    else:
        say = f"{saludo}salga ya {por_donde}hacia {destino}.{evita}"

    ruta = person.assigned_route
    resumen = None
    if ruta and ruta.distance_m is not None:
        resumen = (
            f"{_km(ruta.distance_m)} hasta {destino}"
            + (f" por {road}" if road else "")
            + (f", unos {_min(ruta.duration_s)}" if ruta.duration_s else "")
        )

    convoy_info = None
    if convoy is not None:
        convoy_info = {
            "id": convoy.id,
            "role": person.convoy_role.value if person.convoy_role else None,
            "vehicle_description": convoy.vehicle_description,
            "leader_name": guia.name if guia else None,
            "members": len(convoy.member_ids),
            "status": convoy.status.value,
        }

    return {
        "person_id": person.id,
        "instruction": say,
        "exit_id": zone.id if zone else None,
        "exit_name": zone.name if zone else None,
        "route_summary": resumen,
        "convoy": convoy_info,
        "urgency": urgency_for(minutos).value,
        "minutes_to_front": minutos,
        "say_this": " ".join(say.split()),
        "status": person.status.value,
        "avoid_roads": cortadas,
    }
