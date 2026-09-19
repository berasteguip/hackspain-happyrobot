"""Intervención humana: el puesto de mando manda, el sistema obedece y lo recuerda.

Dos endpoints y una regla: **lo que pincha un humano no lo revierte el planner**. El override se
guarda en `state.overrides` y el planner lo respeta en sus siguientes pasadas. Sin eso, el
dashboard sería decorativo: tocarías un campo y el bucle lo pisaría a los 5 segundos.

`/human/approve` cierra el otro lado del control: las acciones que el sistema NO se atreve a hacer
solo (mandar una patrulla a una casa que el fuego alcanza antes) quedan esperando un sí.
"""

from __future__ import annotations

import logging
from enum import Enum
from typing import Any, get_args, get_origin

from fastapi import APIRouter, HTTPException

import planner
from models import (
    Actor,
    DecisionType,
    HumanApproval,
    HumanOverride,
    PatrolStatus,
    WriteResponse,
    utcnow_iso,
)
from priority import house_margin_min
from routers._common import write_response
from state import state

log = logging.getLogger("crisis.api.human")

router = APIRouter(tags=["humano"])


def _coerce(target: Any, field: str, value: Any) -> Any:
    """Convierte el valor que llega por JSON al tipo del campo (enums, sobre todo).

    El dashboard manda `"closed"` y el modelo espera `SafeZoneStatus.closed`. Pydantic no valida en
    asignación, así que la conversión se hace aquí o el estado queda con tipos mezclados.
    """
    annotation = type(target).model_fields.get(field)
    if annotation is None:
        return value
    candidatos = [annotation.annotation]
    if get_origin(annotation.annotation) is not None:
        candidatos = list(get_args(annotation.annotation))
    for tipo in candidatos:
        if isinstance(tipo, type) and issubclass(tipo, Enum):
            try:
                return tipo(value)
            except ValueError:
                log.warning("valor %r no válido para %s.%s", value, type(target).__name__, field)
                return value
    return value


@router.post("/human/override", response_model=WriteResponse)
def post_override(body: HumanOverride) -> WriteResponse:
    """Un operador (o la patrulla por radio) pincha un campo. Queda pegado."""
    operador = body.operator or "puesto de mando"
    motivo = body.reason or "decisión del puesto de mando"

    # Caso especial: reabrir una carretera es BORRAR su cierre, no poner un campo.
    # `RoadClosure` no tiene campo `open` (el contrato no lo define), así que el override se
    # interpreta: open=true → la vía vuelve a ser practicable → fuera el cierre.
    if body.subject_type == "road_closure" and body.field in {"open", "closed", "reopen"}:
        return _reopen_road(body, operador, motivo)

    target = state.get(body.subject_type, body.subject_id)
    if target is None:
        raise HTTPException(
            status_code=404,
            detail=f"{body.subject_type} {body.subject_id} desconocido",
        )
    if not hasattr(target, body.field):
        raise HTTPException(
            status_code=400,
            detail=f"{body.subject_type} no tiene el campo '{body.field}'",
        )

    valor = _coerce(target, body.field, body.value)
    anterior = getattr(target, body.field, None)
    etiqueta = getattr(target, "name", None) or getattr(target, "address", None) or body.subject_id

    entrada = state.mutate(
        f"{operador} fija {body.subject_type} {etiqueta}.{body.field} = "
        f"{_texto(valor)} (antes {_texto(anterior)}): {motivo}. "
        "El sistema NO lo revertirá.",
        type=DecisionType.human_override,
        subject_type=body.subject_type,
        subject_id=body.subject_id,
        changes={body.field: valor},
        actor=Actor.human,
        approved_by=operador,
        force=True,
        root_event=True,  # una orden del mando es causa, no consecuencia
    )
    # Sticky: el planner consulta `is_overridden` antes de recalcular este campo.
    state.set_override(body.subject_type, body.subject_id, body.field, valor, operador)
    if entrada:
        state.last_event_id = entrada.id

    decisiones = [entrada] if entrada else []
    decisiones.extend(_invalidate_after_override(body))
    decisiones.extend(planner.run_planner(state, trigger_event_id=state.last_event_id))
    return write_response(decisiones, event=f"override({body.subject_type}.{body.field})")


def _texto(value: Any) -> str:
    if value is None:
        return "sin valor"
    if isinstance(value, Enum):
        return str(value.value)
    return str(value)


def _reopen_road(body: HumanOverride, operador: str, motivo: str) -> WriteResponse:
    """Quita un cierre de carretera (por id o por nombre de vía)."""
    closure = state.road_closures.get(body.subject_id or "")
    if closure is None:
        closure = next(
            (
                c
                for c in state.road_closures.values()
                if (c.road_name or "").lower() == (body.subject_id or "").lower()
            ),
            None,
        )
    if closure is None:
        raise HTTPException(
            status_code=404, detail=f"no hay cierre de carretera '{body.subject_id}'"
        )
    entrada = state.mutate(
        f"{operador} REABRE {closure.road_name or closure.id}: {motivo}. "
        "Las rutas vuelven a poder usarla.",
        type=DecisionType.human_override,
        subject_type="road_closure",
        subject_id=closure.id,
        actor=Actor.human,
        approved_by=operador,
        remove=True,
        root_event=True,
    )
    if entrada:
        state.last_event_id = entrada.id
    state.dirty_all_routes = True  # una vía más puede dar rutas más cortas
    decisiones = ([entrada] if entrada else []) + planner.run_planner(
        state, trigger_event_id=state.last_event_id
    )
    return write_response(decisiones, event="override(road reopened)")


def _invalidate_after_override(body: HumanOverride) -> list:
    """Marca lo que hay que recalcular según qué campo tocó el humano."""
    if body.subject_type == "safe_zone":
        afectados = [p.id for p in state.people.values() if p.assigned_exit_id == body.subject_id]
        state.mark_exit_dirty(afectados)
        state.mark_route_dirty(afectados)
    elif body.subject_type == "person":
        if body.field in {"assigned_exit_id", "lat", "lon", "mobility", "status"}:
            state.mark_exit_dirty([body.subject_id or ""])
            state.mark_route_dirty([body.subject_id or ""])
    elif body.subject_type == "patrol" and body.field == "status":
        pass  # el planner reasigna casas en su siguiente pasada
    return []


@router.post("/human/approve", response_model=WriteResponse)
def post_approve(body: HumanApproval) -> WriteResponse:
    """Aprueba (o rechaza) una acción que el sistema dejó pendiente."""
    pending = state.pending_approvals.get(body.decision_id)
    if pending is None:
        raise HTTPException(
            status_code=404,
            detail=f"no hay ninguna acción pendiente con decision_id {body.decision_id}",
        )
    operador = body.operator or "puesto de mando"
    motivo = body.reason or ("aprobado" if body.approved else "rechazado")

    if not body.approved:
        state.pending_approvals.pop(body.decision_id, None)
        entrada = state.mutate(
            f"{operador} RECHAZA «{pending.reason}»: {motivo}. La acción no se ejecuta.",
            type=DecisionType.approval_granted,
            subject_type=pending.payload.get("subject_type", "person"),
            subject_id=pending.payload.get("subject_id"),
            changes={},
            actor=Actor.human,
            approved_by=operador,
            force=True,
            root_event=True,
        )
        decisiones = [entrada] if entrada else []
        return write_response(decisiones, event="approve(rechazado)")

    decisiones = _execute_approved(pending, operador, motivo)
    state.pending_approvals.pop(body.decision_id, None)
    if decisiones:
        state.last_event_id = decisiones[0].id
    decisiones.extend(planner.run_planner(state, trigger_event_id=state.last_event_id))
    return write_response(decisiones, event="approve")


def _execute_approved(pending, operador: str, motivo: str) -> list:
    """Ejecuta la acción que estaba esperando el sí. Hoy solo `assign_patrol`."""
    if pending.action == "assign_patrol":
        return _do_assign_patrol(pending, operador, motivo)
    log.warning("acción pendiente desconocida: %s", pending.action)
    return []


def _do_assign_patrol(pending, operador: str, motivo: str) -> list:
    house_id = pending.payload.get("house_id") or pending.payload.get("subject_id")
    patrol_id = pending.payload.get("patrol_id")
    house = state.houses.get(house_id or "")
    patrol = state.patrols.get(patrol_id or "")
    if house is None or patrol is None:
        log.warning("aprobación de patrulla sin casa/patrulla válidas (%s / %s)", house_id, patrol_id)
        return []
    eta = pending.payload.get("eta_min")
    if eta is None:
        eta = planner._patrol_eta_min(patrol, house) if house.lat is not None else house.patrol_eta_min
    margen = pending.payload.get("margin_min")
    if margen is None:
        margen = house_margin_min(house)
    decisiones = []
    entrada = state.mutate(
        f"{operador} AUTORIZA mandar {patrol.name or patrol.id} a "
        f"{house.address or house.id}"
        + (f" (margen {margen:+.0f} min)" if isinstance(margen, (int, float)) else "")
        + f": {motivo}.",
        type=DecisionType.approval_granted,
        subject_type="house",
        subject_id=house.id,
        changes={"assigned_patrol_id": patrol.id, "patrol_eta_min": eta},
        actor=Actor.human,
        approved_by=operador,
        force=True,
        root_event=True,
    )
    if entrada:
        decisiones.append(entrada)
    sub = state.mutate(
        f"{patrol.name or patrol.id} en camino a {house.address or house.id} "
        f"(autorizado por {operador}).",
        type=DecisionType.patrol_assigned,
        subject_type="patrol",
        subject_id=patrol.id,
        changes={
            "assigned_house_ids": list(dict.fromkeys([*patrol.assigned_house_ids, house.id])),
            "status": PatrolStatus.en_route,
        },
        actor=Actor.human,
        approved_by=operador,
    )
    if sub:
        decisiones.append(sub)
    # El humano ya decidió: el planner no debe volver a pedir permiso ni reasignar esta casa.
    state.set_override("house", house.id, "assigned_patrol_id", patrol.id, operador)
    log.info("patrulla %s autorizada a %s a las %s", patrol.id, house.id, utcnow_iso())
    return decisiones
