"""Endpoints de lectura (contrato §3): dashboard, simulador y tools del agente de voz."""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, HTTPException, Query

import notify
import planner
from models import HouseStatus, PersonStatus, PositionSource, RosterEntry
from priority import (
    explain_score,
    house_margin_min,
    house_reason,
    priority_score,
    ranked_no_answer_houses,
)
from settings import settings
from state import state

router = APIRouter(tags=["lectura"])


@router.get("/api/locations")
def api_locations() -> list[dict]:
    """Puente para Vigía (`apps/command-center`), que lee posiciones en otra forma.

    Vigía nació contra un middleware del servidor de desarrollo de Vite que vivía en
    `vite.config.ts` y no sobrevive a `vite build`: por eso en el despliegue pedía
    `/api/locations` y recibía un 401 del guard. En vez de tocar su frontend —que el equipo
    está reescribiendo— se traduce aquí: mismo dato, la forma que Vigía ya sabe leer.

    Solo salen las personas que **están compartiendo** (`position_source` presente). Devolver
    también las demás pintaría 120 domicilios como si fueran gente localizada, que es
    justo la confusión que el mapa intenta evitar.

    Es un puente temporal. Lo definitivo es que Vigía lea `GET /state`, que además trae el
    perímetro del fuego y las zonas de salida, y no solo los puntos.
    """
    filas: list[dict] = []
    for person in state.people.values():
        if not person.position_source or person.lat is None or person.lon is None:
            continue
        ts = _epoch_ms(person.position_updated_at)
        if ts is None:
            continue
        filas.append(
            {
                "id": person.id,
                "name": person.name or person.id,
                "lng": person.lon,  # Vigía usa `lng`; el contrato, `lon`
                "lat": person.lat,
                "ts": ts,  # milisegundos: `mergePings` descarta lo que no sea un número finito
                "source": "gps" if person.position_source == PositionSource.gps else "unknown",
            }
        )
    return filas


def _epoch_ms(iso: str | None) -> int | None:
    """ISO-8601 → milisegundos. Sin fecha utilizable no hay ping que valga."""
    if not iso:
        return None
    try:
        return int(datetime.fromisoformat(iso.replace("Z", "+00:00")).timestamp() * 1000)
    except ValueError:
        return None


@router.get("/api/roster", response_model=list[RosterEntry])
def api_roster() -> list[RosterEntry]:
    """El censo que Vigía pinta y rodea: TODA la gente del escenario, no solo la localizada.

    `/api/locations` solo devuelve a quien está compartiendo posición, que es lo correcto para
    no pintar 120 domicilios como si fueran gente localizada. Pero para **rodear un círculo y
    llamar** hace falta lo contrario: los puntos que todavía no han contestado son justo los
    que hay que llamar. Por eso son dos endpoints y no uno.

    **El teléfono no sale entero.** Este endpoint es público (Vigía corre en el navegador de
    alguien, sin clave), así que devolver la lista completa de móviles del escenario sería
    publicarla. Va la cola enmascarada, que es lo único que el operador necesita para
    distinguir dos fichas, y `dialable`, que le dice si ese punto sonaría o lo pararía el
    cerrojo. Marcar de verdad exige `x-api-key` y ocurre en `POST /calls/dispatch`.
    """
    filas: list[RosterEntry] = []
    for person in state.people.values():
        casa = state.houses.get(person.house_id or "")
        ultima = state.last_call(person.id)
        filas.append(
            RosterEntry(
                id=person.id,
                name=person.name or person.id,
                phone=_mask_phone(person.phone),
                lng=person.lon,  # Vigía usa `lng`; el contrato, `lon`
                lat=person.lat,
                locality=(casa.village if casa else None) or state.scenario,
                address=casa.address if casa else None,
                vulnerable=bool(casa.vulnerable) if casa else False,
                dialable=bool(person.phone),
                status=person.status,
                call_state=ultima.state if ultima else None,
                location_source=person.position_source,
            )
        )
    return sorted(filas, key=lambda f: f.id)


def _mask_phone(phone: str | None) -> str | None:
    """`+34600990001` → `··· 001`. Suficiente para no confundir dos fichas, inútil para marcar."""
    if not phone:
        return None
    cola = "".join(ch for ch in phone if ch.isdigit())[-3:]
    return f"··· {cola}" if cola else None


@router.get("/health")
def health() -> dict:
    """Sin auth a propósito: es el latido que mira el dashboard y el `make check`."""
    return {
        "ok": True,
        "state_version": state.state_version,
        "people_count": len(state.people),
        "people": len(state.people),
        "houses": len(state.houses),
        "uptime_s": state.uptime_s,
        "scenario": state.scenario,
        # Se expone a propósito: hay que poder comprobar de un vistazo si esta instancia puede
        # llamar a teléfonos de verdad antes de lanzarle 120 vecinos encima.
        "allow_real_calls": settings.allow_real_calls,
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
    recortadas = filas[:limit]
    # `count` es el total en cola y `returned` lo que va en esta respuesta: con 120 personas y el
    # `limit` por defecto en 100 no son lo mismo, y un dashboard que pinte `count` filas sobre una
    # lista de 100 se queda corto sin avisar.
    return {
        "state_version": state.state_version,
        "count": len(filas),
        "returned": len(recortadas),
        "queue": recortadas,
    }


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
