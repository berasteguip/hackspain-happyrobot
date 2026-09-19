"""La capa que "mueve cosas fuera del sistema": llamadas y SMS vía HappyRobot.

REGLA DURA (contrato §6.3): si `ALLOW_REAL_CALLS` no es `true`, **no se llama de verdad**. Se
simula, se registra en el decision_log y se devuelve éxito. Un bucle que llame a 120 teléfonos
reales por accidente arruina el proyecto y algo más.

`notify` no toca el estado: recibe el `state` y registra a través de `state.mutate()`, como todo
lo demás.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any

import httpx

from models import Actor, Channel, DecisionType, Instruction, Notified, Person, utcnow_iso
from settings import settings

log = logging.getLogger("crisis.notify")


@dataclass
class NotifyResult:
    ok: bool
    channel: Channel
    simulated: bool
    person_id: str
    detail: str
    at: str = field(default_factory=utcnow_iso)
    payload: dict[str, Any] = field(default_factory=dict)

    def as_notified(self) -> Notified:
        return Notified(person_id=self.person_id, channel=self.channel, at=self.at)


def _webhook_headers() -> dict[str, str]:
    # El webhook del workflow de HappyRobot se autentica con `x-api-key` (contrato §3).
    key = settings.hr_api_key or settings.hr_shared_secret
    headers = {"Content-Type": "application/json"}
    if key:
        headers["x-api-key"] = key
    return headers


def _post_to_happyrobot(payload: dict, client: httpx.Client | None = None) -> tuple[bool, str]:
    """POST al webhook del workflow. Devuelve (ok, detalle)."""
    url = settings.hr_workflow_webhook
    if not url:
        return False, "HR_WORKFLOW_WEBHOOK sin configurar"
    own_client = client is None
    c = client or httpx.Client(timeout=8.0)
    try:
        resp = c.post(url, json=payload, headers=_webhook_headers())
        ok = resp.status_code < 400
        return ok, f"HTTP {resp.status_code}"
    except Exception as exc:
        return False, f"error de red: {exc}"
    finally:
        if own_client:
            c.close()


def _dispatch(
    person: Person,
    *,
    channel: Channel,
    reason: str,
    text: str | None,
    state: Any | None,
    extra: dict | None = None,
    client: httpx.Client | None = None,
    trigger_event_id: str | None = None,
) -> NotifyResult:
    payload = {
        "action": "call" if channel == Channel.call else "sms",
        "person_id": person.id,
        "name": person.name,
        "phone": person.phone,
        "reason": reason,
        "text": text,
        # para que el agente de voz pueda leer la instrucción en vivo sin salir de la plataforma
        "instructions_url": f"{settings.public_base_url or settings.api_base_url}"
        f"/instructions/{person.id}",
        **(extra or {}),
    }

    if not settings.allow_real_calls:
        simulated = True
        ok = True
        detail = "SIMULADO (ALLOW_REAL_CALLS != true)"
        log.info(
            "[SIMULADO] %s a %s (%s) · %s",
            "llamada" if channel == Channel.call else "SMS",
            person.name or person.id,
            person.phone or "sin teléfono",
            reason,
        )
    elif not person.phone:
        simulated = False
        ok = False
        detail = "sin teléfono en la ficha"
        log.warning("no se puede contactar a %s: sin teléfono", person.id)
    else:
        simulated = False
        ok, detail = _post_to_happyrobot(payload, client=client)
        log.info(
            "[REAL] %s a %s · %s · %s",
            "llamada" if channel == Channel.call else "SMS",
            person.phone,
            reason,
            detail,
        )

    result = NotifyResult(
        ok=ok,
        channel=channel,
        simulated=simulated,
        person_id=person.id,
        detail=detail,
        payload=payload,
    )

    if state is not None:
        _record(state, person, result, reason=reason, text=text, trigger_event_id=trigger_event_id)
    return result


def _record(
    state: Any,
    person: Person,
    result: NotifyResult,
    *,
    reason: str,
    text: str | None,
    trigger_event_id: str | None,
) -> None:
    """Una llamada/SMS es una acción del sistema: va al decision_log con su motivo."""
    tipo = DecisionType.call_placed if result.channel == Channel.call else DecisionType.sms_sent
    marca = "simulada" if result.simulated else "real"
    verbo = "Llamada" if result.channel == Channel.call else "SMS"
    estado = "enviada" if result.ok else f"FALLÓ ({result.detail})"
    changes: dict[str, Any] = {}
    if result.channel == Channel.call:
        changes["call_attempts"] = (person.call_attempts or 0) + 1
    if text:
        changes["last_instruction"] = Instruction(
            text=text, sent_at=result.at, channel=result.channel
        )
    state.mutate(
        f"{verbo} {marca} {estado}: {reason}",
        type=tipo,
        subject_type="person",
        subject_id=person.id,
        changes=changes,
        actor=Actor.system,
        trigger_event_id=trigger_event_id,
        notified=[result.as_notified()],
        force=True,  # el intento se registra aunque no cambie ningún campo
    )


def place_call(
    person: Person,
    reason: str,
    state: Any | None = None,
    *,
    say_this: str | None = None,
    client: httpx.Client | None = None,
    trigger_event_id: str | None = None,
) -> NotifyResult:
    """Dispara una llamada de voz. `say_this` es la frase que el TTS debe decir."""
    return _dispatch(
        person,
        channel=Channel.call,
        reason=reason,
        text=say_this,
        state=state,
        extra={"say_this": say_this} if say_this else None,
        client=client,
        trigger_event_id=trigger_event_id,
    )


def send_sms(
    person: Person,
    text: str,
    state: Any | None = None,
    *,
    reason: str | None = None,
    client: httpx.Client | None = None,
    trigger_event_id: str | None = None,
) -> NotifyResult:
    """Manda un SMS (el canal del enlace GPS y de las instrucciones a los seguidores)."""
    return _dispatch(
        person,
        channel=Channel.sms,
        reason=reason or "instrucción por SMS",
        text=text,
        state=state,
        client=client,
        trigger_event_id=trigger_event_id,
    )


def gps_link_sms(person: Person) -> str:
    """El SMS de la sección 3 del escenario: el enlace que convierte un punto en trayectoria."""
    base = settings.public_base_url or settings.api_base_url
    nombre = (person.name or "").split(" ")[0]
    saludo = f"{nombre}, " if nombre else ""
    return (
        f"{saludo}abre este enlace y déjalo abierto: {base}/gps/{person.id} "
        "Así sabemos dónde estás y te avisamos si el fuego se mete en tu camino."
    )
