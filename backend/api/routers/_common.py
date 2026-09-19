"""Piezas compartidas por los routers de escritura.

Todo endpoint de escritura devuelve `{ok, state_version, decisions:[...]}` (contrato §3): el motor
de escenario —y el jurado— ven el efecto inmediato del evento sin consultar el estado.
"""

from __future__ import annotations

import logging
from typing import Iterable

from models import DecisionLogEntry, WriteResponse
from state import state

log = logging.getLogger("crisis.api")


def write_response(decisions: Iterable[DecisionLogEntry | None], event: str = "") -> WriteResponse:
    limpias = [d for d in decisions if d is not None]
    if event:
        log.info(
            "evento %s → %d decisiones (state_version=%d)%s",
            event,
            len(limpias),
            state.state_version,
            "" if not limpias else ": " + " | ".join(d.type.value for d in limpias[:8]),
        )
    return WriteResponse(
        ok=True,
        state_version=state.state_version,
        decisions=[d.model_dump(mode="json") for d in limpias],
    )
