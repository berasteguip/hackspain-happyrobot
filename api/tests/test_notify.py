"""El freno de mano: sin `ALLOW_REAL_CALLS=true` NADIE recibe una llamada de verdad.

Un bucle del planner sobre 120 vecinos con teléfonos reales detrás es el peor fallo posible de
este proyecto, así que la regla se prueba por los dos lados: que apagado no sale ni una petición
HTTP, y que encendido sí sale (para que el test no pase por casualidad porque la red esté muerta).
"""

from __future__ import annotations

import httpx
import pytest

import notify
from models import Channel, DecisionType, Person
from settings import settings


@pytest.fixture()
def cliente_espia():
    """Cliente httpx que registra las peticiones y nunca sale a la red."""
    enviadas: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        enviadas.append(request)
        return httpx.Response(200, json={"ok": True})

    with httpx.Client(transport=httpx.MockTransport(handler)) as c:
        yield c, enviadas


def _persona() -> Person:
    return Person(id="p-tel", name="Antonio Prieto", phone="+34600992001")


def test_sin_la_variable_de_entorno_no_se_llama_a_nadie(state, cliente_espia):
    cliente, enviadas = cliente_espia
    assert settings.allow_real_calls is False, "el entorno de test NUNCA llama de verdad"

    persona = _persona()
    state.people[persona.id] = persona
    resultado = notify.place_call(persona, "prueba", state, say_this="salga ya", client=cliente)

    assert enviadas == [], "se intentó una llamada real con ALLOW_REAL_CALLS apagado"
    assert resultado.simulated is True
    assert resultado.ok is True, "simulado devuelve éxito: el planner no debe bloquearse"
    assert "SIMULADO" in resultado.detail


def test_la_llamada_simulada_queda_en_el_decision_log(state, cliente_espia):
    cliente, _ = cliente_espia
    persona = _persona()
    state.people[persona.id] = persona
    antes = len(state.decision_log)

    notify.place_call(persona, "primera llamada del censo", state, client=cliente)

    nuevas = state.decision_log[antes:]
    assert len(nuevas) == 1
    entrada = nuevas[0]
    assert entrada.type == DecisionType.call_placed
    assert entrada.subject_id == persona.id
    assert "simulada" in entrada.reason
    assert "primera llamada del censo" in entrada.reason
    assert entrada.notified and entrada.notified[0].channel == Channel.call
    # el intento cuenta: es lo que después escala la casa a la patrulla
    assert persona.call_attempts == 1


def test_un_sms_simulado_tambien_se_registra_y_no_sale_a_la_red(state, cliente_espia):
    cliente, enviadas = cliente_espia
    persona = _persona()
    state.people[persona.id] = persona

    resultado = notify.send_sms(persona, "sigue al coche de tu vecino", state, client=cliente)

    assert enviadas == []
    assert resultado.simulated is True
    assert state.decision_log[-1].type == DecisionType.sms_sent
    # un SMS no es un intento de llamada
    assert persona.call_attempts == 0


def test_sin_telefono_la_simulacion_no_revienta(state, cliente_espia):
    """En el escenario hay casas sin número; el planner no puede caerse por eso."""
    cliente, enviadas = cliente_espia
    persona = Person(id="p-sin-tel", name="Vecino sin teléfono")
    state.people[persona.id] = persona

    resultado = notify.place_call(persona, "prueba", state, client=cliente)

    assert enviadas == []
    assert resultado.ok is True and resultado.simulated is True


def test_con_la_variable_encendida_si_sale_la_peticion(state, cliente_espia, monkeypatch):
    """La otra cara: si el flag está encendido, la petición SÍ se manda.

    Sin este test, el de arriba pasaría igual con un `notify` roto que no llamara nunca.
    """
    cliente, enviadas = cliente_espia
    monkeypatch.setattr(settings, "allow_real_calls", True)
    monkeypatch.setattr(settings, "hr_workflow_webhook", "https://example.invalid/hook")
    monkeypatch.setattr(settings, "hr_api_key", "clave-de-test")

    persona = _persona()
    state.people[persona.id] = persona
    resultado = notify.place_call(persona, "prueba real", state, say_this="salga ya", client=cliente)

    assert len(enviadas) == 1
    peticion = enviadas[0]
    assert str(peticion.url) == "https://example.invalid/hook"
    assert peticion.headers["x-api-key"] == "clave-de-test"
    assert resultado.simulated is False and resultado.ok is True
    assert resultado.payload["phone"] == "+34600992001"
    assert resultado.payload["say_this"] == "salga ya"
    assert resultado.payload["action"] == "call"


def test_una_clave_de_happyrobot_va_como_bearer(state, cliente_espia, monkeypatch):
    """HappyRobot autentica con `Authorization: Bearer sk_live_...`; `x-api-key` es el esquema de
    NUESTRA API. Cruzarlos da un 401 silencioso en medio de la demo, así que la clave se manda por
    la vía que le corresponde a su forma."""
    cliente, enviadas = cliente_espia
    monkeypatch.setattr(settings, "allow_real_calls", True)
    monkeypatch.setattr(settings, "hr_workflow_webhook", "https://example.invalid/hook")
    monkeypatch.setattr(settings, "hr_api_key", "sk_live_falsa")

    persona = _persona()
    state.people[persona.id] = persona
    notify.place_call(persona, "prueba real", state, client=cliente)

    cabeceras = enviadas[0].headers
    assert cabeceras["authorization"] == "Bearer sk_live_falsa"
    # y se sigue mandando x-api-key porque el webhook puede ser un receptor propio de pruebas
    assert cabeceras["x-api-key"] == "sk_live_falsa"


def test_sin_webhook_configurado_falla_pero_no_explota(state, cliente_espia, monkeypatch):
    cliente, enviadas = cliente_espia
    monkeypatch.setattr(settings, "allow_real_calls", True)
    monkeypatch.setattr(settings, "hr_workflow_webhook", "")

    persona = _persona()
    state.people[persona.id] = persona
    resultado = notify.place_call(persona, "prueba", state, client=cliente)

    assert enviadas == []
    assert resultado.ok is False
    assert "HR_WORKFLOW_WEBHOOK" in resultado.detail
    # y el fallo también se registra: el mando tiene que ver que no se pudo avisar
    assert "FALLÓ" in state.decision_log[-1].reason


# --------------------------------------------------------------------------------------
# Las dos claves van en direcciones contrarias y no se cruzan
# --------------------------------------------------------------------------------------


def test_el_secreto_de_nuestra_api_no_sale_hacia_happyrobot(monkeypatch):
    """`HR_SHARED_SECRET` es la llave de NUESTRA puerta.

    Si viaja en un POST saliente queda escrita en los logs de run de un tercero, y con ella
    cualquiera con acceso a ese workspace entra en nuestra API. Ya pasó una vez: apareció
    literal en el output del nodo del webhook.
    """
    monkeypatch.setattr(settings, "hr_api_key", "")
    monkeypatch.setattr(settings, "hr_shared_secret", "la-llave-de-nuestra-puerta")

    cabeceras = notify._webhook_headers()

    assert "x-api-key" not in cabeceras
    assert "Authorization" not in cabeceras
    assert "la-llave-de-nuestra-puerta" not in str(cabeceras)


def test_una_clave_con_enes_se_manda_en_latin1_y_no_revienta(monkeypatch):
    """`httpx` codifica las cabeceras como ASCII y una eñe lo tumba con un error críptico."""
    monkeypatch.setattr(settings, "hr_api_key", "clave-con-eñe")

    cabeceras = notify._webhook_headers()

    assert cabeceras["x-api-key"] == "clave-con-eñe".encode("latin-1")


def test_una_clave_de_plataforma_va_tambien_como_bearer(monkeypatch):
    monkeypatch.setattr(settings, "hr_api_key", "sk_live_abc123")

    cabeceras = notify._webhook_headers()

    assert cabeceras["Authorization"] == "Bearer sk_live_abc123"
    assert cabeceras["x-api-key"] == "sk_live_abc123"


def test_sin_clave_de_happyrobot_no_se_manda_cabecera_de_auth(monkeypatch):
    """El `incoming_hook` de ahora no tiene auth configurada: entra sin cabecera."""
    monkeypatch.setattr(settings, "hr_api_key", "")
    monkeypatch.setattr(settings, "hr_shared_secret", "")

    assert notify._webhook_headers() == {"Content-Type": "application/json"}
