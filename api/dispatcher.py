"""Rodear un círculo en Vigía → N llamadas independientes, a la vez.

Esta es la pieza que convierte un gesto del puesto de mando en ejecución real fuera del
sistema: el operador rodea un grupo de puntos en el mapa y cada punto se lleva **su propia
llamada**, con su propio contexto (nombre, zona, nivel estimado) y su propio estado en el
tablero. No es una campaña con una lista: son N conversaciones simultáneas e independientes,
que es lo que hace que una se pueda caer sin arrastrar a las otras.

Dos cerrojos, y los dos tienen que estar abiertos para que suene un teléfono:

1. `ALLOW_REAL_CALLS=true` — el interruptor general del contrato §6.3.
2. `CALL_ALLOWLIST` — la lista blanca de teléfonos. Es la que protege durante los ensayos,
   cuando el escenario cargado mezcla los móviles reales del equipo con vecinos sintéticos.

Un intento bloqueado por el cerrojo **no se esconde**: aparece en el tablero como `blocked`
con el motivo. Un círculo en el que no suena nada tiene que poder explicarse en la demo.
"""

from __future__ import annotations

import logging
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from typing import Any

import httpx

import notify
from geo import haversine_m
from models import (
    Actor,
    CallDispatch,
    CallRun,
    CallState,
    DecisionType,
    Person,
    parse_iso,
    utcnow_iso,
)
from settings import settings

log = logging.getLogger("crisis.dispatcher")


class DispatchError(ValueError):
    """Petición que no se puede atender (círculo absurdo, nadie seleccionado, …)."""


# --------------------------------------------------------------------------------------
# Selección: de un círculo (o una lista) a personas concretas
# --------------------------------------------------------------------------------------


def people_in_circle(state, lat: float, lon: float, radius_m: float) -> list[Person]:
    """Las personas cuya posición conocida cae dentro del círculo.

    Se usa la posición que el mapa está pintando: la compartida por GPS si la hay, y si no
    el domicilio. Es exactamente lo que ve el operador cuando arrastra el círculo, y esa
    coincidencia importa: si la API seleccionara por un criterio distinto al del dibujo,
    el mando llamaría a gente que no rodeó.
    """
    dentro = []
    for person in state.people.values():
        if person.lat is None or person.lon is None:
            continue
        if haversine_m(lat, lon, person.lat, person.lon) <= radius_m:
            dentro.append(person)
    return dentro


def resolve_targets(state, body: CallDispatch) -> list[Person]:
    """Traduce la petición de Vigía a una lista de personas, o explica por qué no puede."""
    if body.person_ids:
        objetivos = []
        for pid in dict.fromkeys(body.person_ids):  # sin duplicados, en orden
            person = state.people.get(pid)
            if person is None:
                raise DispatchError(f"persona {pid} desconocida")
            objetivos.append(person)
        return objetivos

    if body.lat is None or body.lon is None or body.radius_m is None:
        raise DispatchError(
            "hace falta `person_ids`, o bien `lat`, `lon` y `radius_m` para resolver el círculo"
        )
    if body.radius_m <= 0:
        raise DispatchError("`radius_m` tiene que ser mayor que cero")
    if body.radius_m > settings.call_max_radius_m:
        raise DispatchError(
            f"radio {body.radius_m:.0f} m por encima del máximo "
            f"({settings.call_max_radius_m:.0f} m). Rodea una zona, no media provincia."
        )
    return people_in_circle(state, body.lat, body.lon, body.radius_m)


# --------------------------------------------------------------------------------------
# Filtrado: a quién SÍ se llama de los que caen dentro
# --------------------------------------------------------------------------------------


def _minutos_desde(iso: str | None) -> float:
    marca = parse_iso(iso)
    if marca is None:
        return 0.0
    return (datetime.now(timezone.utc) - marca).total_seconds() / 60.0


def _skip_reason(state, person: Person, force: bool) -> str | None:
    """`None` = se llama. Cualquier otra cosa es el motivo que verá el operador."""
    if not person.phone:
        return "sin teléfono en la ficha"
    if force:
        return None
    vivo = state.active_call(person.id)
    if vivo is not None:
        return (
            f"ya tiene una llamada en curso ({vivo.state.value}) desde hace "
            f"{_minutos_desde(vivo.updated_at):.0f} min. Usa «volver a llamar» para forzar."
        )
    ultimo = state.last_call(person.id)
    if ultimo is not None and ultimo.state == CallState.answered:
        return "ya contestó en esta crisis. Usa «volver a llamar» para insistir."
    return None


# --------------------------------------------------------------------------------------
# Ejecución
# --------------------------------------------------------------------------------------


def dispatch(state, body: CallDispatch) -> tuple[str, list[CallRun], list[dict[str, Any]], list]:
    """Lanza la ráfaga. Devuelve `(batch_id, intentos, descartados, decisiones)`.

    Bloquea hasta que las N peticiones a HappyRobot han salido —que es rápido, porque el
    trigger solo arranca el run: la conversación sigue por su cuenta y vuelve a nosotros por
    `/calls/started` y `/calls/outcome`—. Así Vigía puede pintar el tablero completo en la
    respuesta en vez de adivinar.
    """
    # Primero se cierran los intentos que llevan colgados sin desenlace: si no, una llamada
    # de hace media hora que nunca se cerró impide volver a llamar a esa persona.
    state.expire_stale_calls()

    objetivos = resolve_targets(state, body)
    batch_id = f"b-{uuid.uuid4().hex[:8]}"

    llamables: list[Person] = []
    descartados: list[dict[str, Any]] = []
    for person in objetivos:
        motivo = _skip_reason(state, person, body.force)
        if motivo:
            descartados.append({"person_id": person.id, "name": person.name, "reason": motivo})
        else:
            llamables.append(person)

    if len(llamables) > settings.call_max_batch:
        sobran = llamables[settings.call_max_batch :]
        llamables = llamables[: settings.call_max_batch]
        for person in sobran:
            descartados.append(
                {
                    "person_id": person.id,
                    "name": person.name,
                    "reason": f"fuera del tope de {settings.call_max_batch} llamadas por ráfaga",
                }
            )

    if not llamables:
        log.info("ráfaga %s: nadie a quien llamar (%d descartados)", batch_id, len(descartados))
        return batch_id, [], descartados, []

    razon = body.reason or "el puesto de mando rodeó esta zona en el mapa"
    operador = body.operator or "puesto de mando"

    # 1) Se apuntan los intentos ANTES de marcar. Si la petición a HappyRobot se cae a medias,
    #    el tablero ya tiene la fila y el operador ve el fallo, no un hueco.
    intentos: list[CallRun] = []
    with state.lock:
        for person in llamables:
            call = CallRun(
                id=f"call-{uuid.uuid4().hex[:10]}",
                person_id=person.id,
                name=person.name,
                phone=person.phone,
                batch_id=batch_id,
                state=CallState.queued,
                reason=razon,
            )
            state.calls[call.id] = call
            intentos.append(call)
        state.state_version += 1

    entrada = state.mutate(
        f"{operador} rodea una zona del mapa: {len(intentos)} llamada(s) simultánea(s)"
        + (f", {len(descartados)} descartada(s)" if descartados else "")
        + f". Motivo: {razon}.",
        type=DecisionType.call_placed,
        subject_type="person",
        subject_id=intentos[0].person_id,
        changes={},
        actor=Actor.human,
        approved_by=operador,
        force=True,
        root_event=True,  # la orden del mando es la causa; las N llamadas cuelgan de ella
    )
    decisiones = [entrada] if entrada else []
    if entrada:
        state.last_event_id = entrada.id

    # 2) Las N peticiones, a la vez. Un cliente HTTP por hilo: httpx.Client no es seguro
    #    para compartir entre hilos y aquí el paralelismo es justo el punto.
    hilos = max(1, min(settings.call_parallelism, len(llamables)))
    por_persona = {p.id: p for p in llamables}

    def marcar(call: CallRun) -> None:
        person = por_persona[call.person_id]
        state.set_call_state(call.id, CallState.dialing)
        with httpx.Client(timeout=15.0) as client:
            resultado = notify.place_call(
                person,
                razon,
                state,
                client=client,
                trigger_event_id=state.last_event_id,
            )
        if resultado.blocked:
            nuevo = CallState.blocked
        elif resultado.simulated:
            nuevo = CallState.simulated
        elif not resultado.ok:
            nuevo = CallState.failed
        else:
            nuevo = CallState.ringing
        state.set_call_state(
            call.id, nuevo, detail=resultado.detail, run_id=resultado.run_id
        )

    with ThreadPoolExecutor(max_workers=hilos, thread_name_prefix="dial") as pool:
        for future in [pool.submit(marcar, call) for call in intentos]:
            try:
                future.result()
            except Exception as exc:  # una llamada que revienta no tumba a las otras
                log.exception("fallo marcando en la ráfaga %s: %s", batch_id, exc)

    # Se releen del estado: los hilos han cambiado `state`, no las copias locales.
    finales = [state.calls[c.id] for c in intentos if c.id in state.calls]
    log.info(
        "ráfaga %s: %d lanzadas (%s), %d descartadas",
        batch_id,
        len(finales),
        ", ".join(sorted({c.state.value for c in finales})) or "—",
        len(descartados),
    )
    return batch_id, finales, descartados, decisiones


def touch(call: CallRun) -> CallRun:
    """Marca de tiempo al vuelo, para respuestas que no pasan por `set_call_state`."""
    call.updated_at = utcnow_iso()
    return call
