"""Endpoints de lectura (contrato §3): dashboard, simulador y tools del agente de voz."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

import planner
from models import HouseStatus, PersonStatus
from priority import (
    explain_score,
    house_margin_min,
    house_reason,
    priority_score,
    ranked_no_answer_houses,
)
from state import state

router = APIRouter(tags=["lectura"])


@router.get("/health")
def health() -> dict:
    """Sin auth a propósito: es el latido que mira el dashboard y el `make check`."""
    return {
        "ok": True,
        "state_version": state.state_version,
        "people_count": len(state.people),
        "uptime_s": state.uptime_s,
        "scenario": state.scenario,
    }


@router.get("/state")
def get_state() -> dict:
    return state.snapshot()


@router.get("/state/diff")
def get_diff(since_version: int = Query(0, ge=0)) -> dict:
    """Lo que alimenta el timeline: solo lo cambiado desde `since_version`."""
    return state.diff(since_version)


@router.get("/queue")
def get_queue(limit: int = Query(100, ge=1, le=1000), include_safe: bool = False) -> dict:
    """Personas por `priority_score` desc, cada una con su motivo y su desglose."""
    filas = []
    for person in state.people.values():
        if not include_safe and person.status == PersonStatus.safe:
            continue
        score, breakdown = priority_score(person, state)
        filas.append(
            {
                "person_id": person.id,
                "name": person.name,
                "phone": person.phone,
                "status": person.status.value,
                "house_id": person.house_id,
                "lat": person.lat,
                "lon": person.lon,
                "minutes_to_front": person.minutes_to_front,
                "mobility": person.mobility.value if person.mobility else None,
                "household_size": person.household_size,
                "assigned_exit_id": person.assigned_exit_id,
                "convoy_id": person.convoy_id,
                "call_attempts": person.call_attempts,
                "priority_score": score,
                "score_breakdown": breakdown,
                "reason": explain_score(person, breakdown),
            }
        )
    filas.sort(key=lambda r: r["priority_score"], reverse=True)
    return {"state_version": state.state_version, "count": len(filas), "queue": filas[:limit]}


@router.get("/houses/no-answer")
def get_no_answer_houses() -> dict:
    """La lista viva de la patrulla: `houses` con `status == no_answer`, por `priority_rank`."""
    filas = []
    for rank, house in enumerate(ranked_no_answer_houses(state), start=1):
        patrol = state.patrols.get(house.assigned_patrol_id or "")
        filas.append(
            {
                "house_id": house.id,
                "priority_rank": rank,
                "address": house.address,
                "village": house.village,
                "lat": house.lat,
                "lon": house.lon,
                "phone": house.phone,
                "residents_expected": house.residents_expected,
                "vulnerable": house.vulnerable,
                "vulnerability_reason": house.vulnerability_reason,
                "call_attempts": house.call_attempts,
                "minutes_to_front": house.minutes_to_front,
                "patrol_eta_min": house.patrol_eta_min,
                "margin_min": house_margin_min(house),
                "assigned_patrol_id": house.assigned_patrol_id,
                "assigned_patrol_name": patrol.name if patrol else None,
                "reason": house_reason(house),
            }
        )
    return {"state_version": state.state_version, "count": len(filas), "houses": filas}


@router.get("/sectors/air-priority")
def get_air_priority() -> dict:
    """Sectores ordenados para los medios aéreos, con el motivo textual de cada puesto."""
    sectores = sorted(
        state.sectors.values(),
        key=lambda s: (s.air_priority_rank if s.air_priority_rank is not None else 9_999, s.id),
    )
    return {
        "state_version": state.state_version,
        "sectors": [
            {
                "sector_id": s.id,
                "name": s.name,
                "air_priority_rank": s.air_priority_rank,
                "air_priority_reason": s.air_priority_reason,
                "people_inside": s.people_inside,
                "people_unknown": s.people_unknown,
                "vulnerable_inside": s.vulnerable_inside,
                "minutes_to_front": s.minutes_to_front,
                "polygon": s.polygon.model_dump(mode="json") if s.polygon else None,
            }
            for s in sectores
        ],
    }


@router.get("/people/{person_id}")
def get_person(person_id: str) -> dict:
    person = state.people.get(person_id)
    if person is None:
        raise HTTPException(status_code=404, detail=f"persona {person_id} desconocida")
    score, breakdown = priority_score(person, state)
    data = person.model_dump(mode="json")
    data["priority_score"] = score
    data["score_breakdown"] = breakdown
    data["reason"] = explain_score(person, breakdown)
    data["house"] = (
        state.houses[person.house_id].model_dump(mode="json")
        if person.house_id in state.houses
        else None
    )
    return data


@router.get("/instructions/{person_id}")
def get_instructions(person_id: str) -> dict:
    """**Tool del agente de voz.** `say_this` es la frase literal que debe decir el TTS.

    Se devuelve ya redactada en español natural para que el modelo de voz no improvise en algo
    que puede matar a alguien.
    """
    person = state.people.get(person_id)
    if person is None:
        raise HTTPException(status_code=404, detail=f"persona {person_id} desconocida")
    return planner.build_instruction(state, person)


@router.get("/houses/{house_id}")
def get_house(house_id: str) -> dict:
    """Extra (no está en el contrato): el dashboard necesita abrir una casa de la lista."""
    house = state.houses.get(house_id)
    if house is None:
        raise HTTPException(status_code=404, detail=f"casa {house_id} desconocida")
    data = house.model_dump(mode="json")
    data["reason"] = house_reason(house)
    data["margin_min"] = house_margin_min(house)
    data["residents"] = [
        p.model_dump(mode="json") for p in state.people.values() if p.house_id == house_id
    ]
    return data


@router.get("/decisions")
def get_decisions(limit: int = Query(50, ge=1, le=1000), type: str | None = None) -> dict:
    """Extra: el timeline sin tener que pedir un diff (útil para el pitch y para depurar)."""
    entradas = state.decision_log
    if type:
        entradas = [e for e in entradas if e.type.value == type]
    return {
        "state_version": state.state_version,
        "count": len(entradas),
        "decisions": [e.model_dump(mode="json") for e in entradas[-limit:]][::-1],
    }


@router.get("/stats")
def get_stats() -> dict:
    """Extra: los contadores de la cabecera del dashboard."""
    por_estado: dict[str, int] = {}
    for p in state.people.values():
        por_estado[p.status.value] = por_estado.get(p.status.value, 0) + 1
    return {
        "state_version": state.state_version,
        "people": len(state.people),
        "people_by_status": por_estado,
        "houses": len(state.houses),
        "houses_no_answer": len(
            [h for h in state.houses.values() if h.status == HouseStatus.no_answer]
        ),
        "convoys": len(state.convoys),
        "decisions": len(state.decision_log),
        "pending_approvals": len(state.pending_approvals),
    }
