"""La capa que "mueve cosas fuera del sistema": llamadas y SMS vía HappyRobot.

REGLA DURA (contrato §6.3): si `ALLOW_REAL_CALLS` no es `true`, **no se llama de verdad**. Se
simula, se registra en el decision_log y se devuelve éxito. Un bucle que llame a 120 teléfonos
reales por accidente arruina el proyecto y algo más.

`notify` no toca el estado: recibe el `state` y registra a través de `state.mutate()`, como todo
lo demás.
"""

from __future__ import annotations

import json
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
    run_id: str | None = None
    blocked: bool = False

    def as_notified(self) -> Notified:
        return Notified(person_id=self.person_id, channel=self.channel, at=self.at)


def _header_value(key: str) -> str | bytes:
    """Una cabecera HTTP no es texto: es una secuencia de bytes latin-1.

    `httpx` codifica los valores como ASCII y revienta con un `UnicodeEncodeError` de los que
    no dicen nada (`'ascii' codec can't encode character '\\xf1' in position 6`) en cuanto la
    clave lleva una eñe. Y la mitad del mundo la manda en UTF-8 y la otra mitad en latin-1, así
    que una clave con acentos casa en el navegador y falla en `curl` **contra el mismo
    servidor**. Aquí se manda en latin-1, que es lo que dice el RFC 9110 y lo que hace `fetch`.

    Una clave con caracteres no ASCII sigue siendo mala idea: esto la hace funcionar, no la
    hace correcta.
    """
    try:
        key.encode("ascii")
        return key
    except UnicodeEncodeError:
        log.warning(
            "la clave de HappyRobot lleva caracteres no ASCII: se manda en latin-1. "
            "Cámbiala por una solo-ASCII, o casará en unos clientes y en otros no."
        )
        return key.encode("latin-1", errors="replace")


def _webhook_headers() -> dict[str, str | bytes]:
    """Cabeceras del POST al workflow de HappyRobot.

    Hay DOS secretos y van en DIRECCIONES CONTRARIAS. Cruzarlos no es un 401: es peor.

    * `HR_API_KEY` autentica **a nosotros frente a HappyRobot**. Es la única que sale de aquí.
    * `HR_SHARED_SECRET` autentica **a quien llama a nuestra API** (`x-api-key` del guard de
      `main.py`). Es NUESTRA puerta. Mandarla en un POST saliente la deja escrita en los logs
      de run de un tercero —comprobado: aparece literal en el output del nodo del webhook—, y
      cualquiera con acceso a ese workspace se lleva la llave de nuestra API. Por eso ya no hay
      respaldo de una a la otra, aunque `HR_API_KEY` esté vacía.

    Si el trigger no tiene autenticación configurada —el caso del `incoming_hook` de ahora—,
    no hace falta mandar nada: se va sin cabecera de auth y entra igual.
    """
    headers: dict[str, str | bytes] = {"Content-Type": "application/json"}
    key = settings.hr_api_key
    if not key:
        return headers
    valor = _header_value(key)
    # `sk_...` es una clave de plataforma de HappyRobot y va como Bearer; una clave de trigger
    # va en `x-api-key`. Sin saber cuál es, mandar las dos no rompe: se ignora la que sobra.
    if key.startswith("sk_"):
        headers["Authorization"] = (
            f"Bearer {key}" if isinstance(valor, str) else b"Bearer " + valor
        )
    headers["x-api-key"] = valor
    return headers


def normalize_phone(phone: str | None) -> str:
    """E.164 sin espacios, guiones ni paréntesis. Comparar teléfonos «a ojo» falla."""
    if not phone:
        return ""
    return "".join(ch for ch in phone if ch.isdigit() or ch == "+")


def phone_allowed(phone: str | None) -> bool:
    """El segundo cerrojo. Con `CALL_ALLOWLIST` vacía no filtra nada; con lista, solo esos.

    Existe porque durante los ensayos el escenario cargado tiene teléfonos REALES del equipo
    mezclados con vecinos sintéticos, y `ALLOW_REAL_CALLS=true` a secas marcaría los 24.
    """
    if not settings.call_allowlist:
        return True
    return normalize_phone(phone) in settings.call_allowlist


def _run_id_from(resp: httpx.Response) -> str | None:
    """HappyRobot devuelve el id del run; el nombre del campo no está fijado en su doc."""
    try:
        cuerpo = resp.json()
    except Exception:
        return None
    if not isinstance(cuerpo, dict):
        return None
    for clave in ("run_id", "runId", "id"):
        valor = cuerpo.get(clave)
        if isinstance(valor, str) and valor:
            return valor
    anidado = cuerpo.get("run") or cuerpo.get("data")
    if isinstance(anidado, dict):
        for clave in ("run_id", "runId", "id"):
            valor = anidado.get(clave)
            if isinstance(valor, str) and valor:
                return valor
    return None


def _post_to_happyrobot(
    payload: dict, client: httpx.Client | None = None
) -> tuple[bool, str, str | None]:
    """POST al webhook del workflow. Devuelve (ok, detalle, run_id)."""
    url = settings.hr_workflow_webhook
    if not url:
        return False, "HR_WORKFLOW_WEBHOOK sin configurar", None
    own_client = client is None
    c = client or httpx.Client(timeout=15.0)
    try:
        resp = c.post(url, json=payload, headers=_webhook_headers())
        ok = resp.status_code < 400
        if ok:
            return True, f"HTTP {resp.status_code}", _run_id_from(resp)
        # El cuerpo del error es lo único que distingue «trigger equivocado» de «clave mala».
        return False, f"HTTP {resp.status_code}: {resp.text[:180]}", None
    except Exception as exc:
        return False, f"error de red: {exc}", None
    finally:
        if own_client:
            c.close()


def trigger_payload(
    person: Person,
    *,
    channel: Channel = Channel.call,
    reason: str = "",
    text: str | None = None,
    extra: dict | None = None,
) -> dict:
    """El cuerpo que recibe el trigger del workflow de HappyRobot.

    Va en DOS juegos de claves a propósito, y no es descuido:

    * **MAYÚSCULAS** (`NUMERO_TELEFONO`, `PERSONA_NOMBRE`, …) son los nombres que el trigger
      del workflow «Vigía · triaje completo» declara en su lista `params`, y los que su prompt
      interpola. Si estos no llegan, el agente saluda con huecos vacíos («le llama el asistente
      automático de   por el incendio en  »).
    * **minúsculas** (`person_id`, `phone`, …) son las que ya usaba este repo y las que lee
      cualquier receptor de pruebas. Un webhook ignora sin quejarse las claves que no espera,
      así que mandar las dos cuesta cero y ahorra una tarde de depuración cuando alguien
      renombra un parámetro en la plataforma.

    `PRIOR_ZONA` / `PRIOR_NIVEL` son la ESTIMACIÓN que lleva el agente al descolgar, no un
    hecho: el prompt le exige que la persona al teléfono gane sobre esto.
    """
    base = settings.public_base_url or settings.api_base_url
    sector = person.sector_id or ""
    nivel = _prior_level(person)
    return {
        # --- contrato del trigger de HappyRobot ---
        "NUMERO_TELEFONO": person.phone or "",
        "PERSONA_ID": person.id,
        "PERSONA_NOMBRE": person.name or "",
        "CAMPANA_ORGANISMO": settings.campaign_org,
        "CAMPANA_ZONA": settings.campaign_zone,
        "PRIOR_ZONA": sector,
        "PRIOR_NIVEL": nivel,
        "ORDEN_AUTORIDAD": settings.authority_order,
        # --- lo que exige el cerrojo del propio workflow ---
        # Un nodo Python del workflow revalida el destino contra esta lista y revienta el run
        # con «Destino no autorizado para el simulacro» si no cuadra. Es el mismo criterio que
        # `CALL_ALLOWLIST`, pero comprobado **en el otro lado**: si alguien apunta a nuestra API
        # desde otro sitio, o si esta lista viajara vacía, HappyRobot se niega igual. Dos
        # cerrojos independientes valen más que uno duplicado.
        "ALLOWED_NUMBERS": json.dumps(sorted(settings.call_allowlist)),
        "DEMO_MODE": "true" if settings.demo_mode else "false",
        # --- claves propias del repo ---
        "action": "call" if channel == Channel.call else "sms",
        "person_id": person.id,
        "name": person.name,
        "phone": person.phone,
        "reason": reason,
        "text": text,
        # para que el agente de voz pueda leer la instrucción en vivo sin salir de la plataforma
        "instructions_url": f"{base}/instructions/{person.id}",
        "gps_link": f"{base}/gps/{person.id}",
        **(extra or {}),
    }


def _prior_level(person: Person) -> str:
    """Color que el agente lleva de partida, derivado de los minutos hasta el frente.

    Los cortes salen de la clasificación del prompt del agente (rojo/naranja/amarillo/verde).
    Es deliberadamente grosero: es una estimación geográfica, y el guion de la llamada manda
    al agente rebajarla en cuanto la persona desmienta lo que traía.
    """
    minutos = person.minutes_to_front
    if minutos is None:
        return "amarillo"  # sin dato no se tranquiliza a nadie, pero tampoco se alarma
    if minutos <= 15:
        return "rojo"
    if minutos <= 45:
        return "naranja"
    if minutos <= 120:
        return "amarillo"
    return "verde"


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
    payload = trigger_payload(person, channel=channel, reason=reason, text=text, extra=extra)

    run_id = None
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
    elif settings.secret_is_public:
        # El cerrojo vive AQUÍ y no solo en `/calls/dispatch` porque el planner marca por su
        # cuenta —convoy roto, persona en riesgo, instrucción que cambia— sin pasar por el
        # despachador. Esa es precisamente la vía que dispara sin que nadie esté mirando, así
        # que dejarla fuera del cerrojo lo convertía en decorativo.
        simulated = True
        ok = True
        detail = (
            "BLOQUEADO: HR_SHARED_SECRET es un valor de ejemplo del repo, y el repo es público. "
            "Cámbialo (`openssl rand -hex 32`) antes de marcar de verdad."
        )
        log.error(
            "[BLOQUEADO] %s a %s: la clave de esta API está publicada en el repo",
            "llamada" if channel == Channel.call else "SMS",
            person.name or person.id,
        )
    elif not phone_allowed(person.phone):
        # No es un error: es el cerrojo haciendo su trabajo. Se registra igual para que en el
        # tablero se vea POR QUÉ ese punto del círculo no sonó.
        simulated = True
        ok = True
        detail = f"BLOQUEADO: {person.phone} no está en CALL_ALLOWLIST"
        log.warning(
            "[BLOQUEADO] %s a %s (%s): fuera de la lista blanca",
            "llamada" if channel == Channel.call else "SMS",
            person.name or person.id,
            person.phone,
        )
    else:
        simulated = False
        ok, detail, run_id = _post_to_happyrobot(payload, client=client)
        log.info(
            "[REAL] %s a %s · %s · %s%s",
            "llamada" if channel == Channel.call else "SMS",
            person.phone,
            reason,
            detail,
            f" · run {run_id}" if run_id else "",
        )

    result = NotifyResult(
        ok=ok,
        channel=channel,
        simulated=simulated,
        person_id=person.id,
        detail=detail,
        payload=payload,
        run_id=run_id,
        blocked=detail.startswith("BLOQUEADO"),
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
    marca = "bloqueada" if result.blocked else "simulada" if result.simulated else "real"
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
