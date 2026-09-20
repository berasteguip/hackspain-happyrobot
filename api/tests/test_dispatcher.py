"""Rodear un círculo → N llamadas independientes.

Lo que se prueba aquí no es "sale una petición HTTP": eso ya lo cubre `test_notify.py`. Lo que
se prueba es lo que el operador ve cuando suelta el círculo, que es lo que el jurado va a mirar:
que se selecciona **lo que está dentro y solo lo que está dentro**, que cada punto se lleva su
propio intento con su propio estado, y que un punto que no suena dice POR QUÉ no ha sonado.
"""

from __future__ import annotations

import json
import re

import pytest

import dispatcher
import notify
from models import CallDispatch, CallState, Person
from settings import settings
from state import state

# Facultad de Informática y Ciencias Matemáticas de la Complutense, a ~400 m una de la otra.
INFORMATICA = (40.45290, -3.72680)
MATEMATICAS = (40.44940, -3.72700)
# Talavera: fuera de cualquier círculo razonable sobre Ciudad Universitaria.
LEJOS = (39.9553, -4.8151)


def _poblar(state) -> None:
    state.people.clear()
    state.calls.clear()
    for pid, nombre, tel, (lat, lon) in [
        ("p-001", "Pablo", "+34600990001", INFORMATICA),
        ("p-002", "Mateo", "+34600990002", MATEMATICAS),
        ("p-003", "Vecino sintético", "+34600999005", MATEMATICAS),
        ("p-004", "Lejano", "+34600999006", LEJOS),
        ("p-005", "Sin teléfono", None, INFORMATICA),
    ]:
        state.people[pid] = Person(id=pid, name=nombre, phone=tel, lat=lat, lon=lon)


@pytest.fixture()
def poblado(state):
    _poblar(state)
    return state


# --------------------------------------------------------------------------- selección


def test_el_circulo_coge_lo_de_dentro_y_deja_fuera_lo_de_fuera(poblado):
    dentro = dispatcher.people_in_circle(poblado, 40.4511, -3.7269, 1000)
    ids = {p.id for p in dentro}

    assert ids == {"p-001", "p-002", "p-003", "p-005"}
    assert "p-004" not in ids, "Talavera no puede caer en un círculo de 1 km sobre la Complutense"


def test_un_radio_absurdo_se_rechaza(poblado):
    peticion = CallDispatch(lat=40.4511, lon=-3.7269, radius_m=settings.call_max_radius_m + 1)
    with pytest.raises(dispatcher.DispatchError, match="por encima del máximo"):
        dispatcher.resolve_targets(poblado, peticion)


def test_sin_circulo_ni_lista_no_se_adivina_a_quien_llamar(poblado):
    with pytest.raises(dispatcher.DispatchError, match="person_ids"):
        dispatcher.resolve_targets(poblado, CallDispatch())


# --------------------------------------------------------------------------- ejecución


def test_cada_punto_del_circulo_se_lleva_su_propio_intento(poblado):
    _, intentos, descartados, _ = dispatcher.dispatch(
        poblado, CallDispatch(lat=40.4511, lon=-3.7269, radius_m=1000)
    )

    assert {c.person_id for c in intentos} == {"p-001", "p-002", "p-003"}
    assert len({c.id for c in intentos}) == 3, "tres llamadas independientes, no una campaña"
    assert len({c.batch_id for c in intentos}) == 1, "misma ráfaga: el mando hizo un solo gesto"
    # El de la ficha sin teléfono no se pierde en silencio: se explica.
    assert [d["person_id"] for d in descartados] == ["p-005"]
    assert "sin teléfono" in descartados[0]["reason"]


def test_con_el_interruptor_apagado_los_intentos_quedan_simulados(poblado):
    assert settings.allow_real_calls is False
    _, intentos, _, _ = dispatcher.dispatch(
        poblado, CallDispatch(person_ids=["p-001", "p-002"])
    )

    assert {c.state for c in intentos} == {CallState.simulated}
    assert all(c.detail and "SIMULADO" in c.detail for c in intentos)


def test_no_se_llama_dos_veces_a_la_vez_a_la_misma_persona(poblado):
    """Rodear dos círculos solapados no puede duplicar la llamada de quien está en los dos."""
    dispatcher.dispatch(poblado, CallDispatch(person_ids=["p-001"]))
    # El primer intento quedó `simulated`, que es terminal; se fuerza uno vivo para el caso real.
    vivo = next(iter(poblado.calls.values()))
    poblado.set_call_state(vivo.id, CallState.ringing)

    _, intentos, descartados, _ = dispatcher.dispatch(poblado, CallDispatch(person_ids=["p-001"]))

    assert intentos == []
    assert "en curso" in descartados[0]["reason"]


def test_force_vuelve_a_llamar_a_quien_ya_tiene_un_intento_vivo(poblado):
    dispatcher.dispatch(poblado, CallDispatch(person_ids=["p-001"]))
    vivo = next(iter(poblado.calls.values()))
    poblado.set_call_state(vivo.id, CallState.ringing)

    _, intentos, _, _ = dispatcher.dispatch(
        poblado, CallDispatch(person_ids=["p-001"], force=True)
    )

    assert len(intentos) == 1


def test_el_tope_por_rafaga_corta_y_lo_dice(poblado, monkeypatch):
    monkeypatch.setattr(settings, "call_max_batch", 2)
    _, intentos, descartados, _ = dispatcher.dispatch(
        poblado, CallDispatch(person_ids=["p-001", "p-002", "p-003"])
    )

    assert len(intentos) == 2
    assert "tope de 2 llamadas" in descartados[0]["reason"]


# --------------------------------------------------------------------------- teléfonos


def test_sin_lista_blanca_se_marca_a_cualquiera_del_escenario(poblado, monkeypatch):
    """Ya no hay lista blanca: quien tenga teléfono se intenta, y quien no, no.

    Se quitó porque el agente llama a números que le dicta la persona en mitad de la
    conversación —la madre que se quedó en casa— y eso no cabe en una lista escrita de
    antemano. Lo que queda frenando una ráfaga es ALLOW_REAL_CALLS y los topes de lote.
    """
    monkeypatch.setattr(settings, "allow_real_calls", True)

    _, intentos, _, _ = dispatcher.dispatch(
        poblado, CallDispatch(person_ids=["p-001", "p-003"])
    )

    for intento in intentos:
        assert intento.state != CallState.blocked, "ya no existe el bloqueo por lista"
        # Sin webhook configurado no sale ninguna, pero por falta de webhook, no por filtro.
        assert "HR_WORKFLOW_WEBHOOK" in (intento.detail or "")


def test_normalizar_telefono_ignora_espacios_y_guiones():
    """`+34 600 99 00 01` y `+34600990001` son el mismo móvil."""
    assert notify.normalize_phone("+34 600-99 00 01") == "+34600990001"


# --------------------------------------------------------------------------- contexto del agente


def test_el_payload_lleva_los_parametros_que_el_workflow_declara(poblado):
    """Si estas claves no viajan, el agente saluda con huecos: «el asistente de   por el de  »."""
    payload = notify.trigger_payload(poblado.people["p-001"], reason="prueba")

    for clave in (
        "NUMERO_TELEFONO",
        "PERSONA_ID",
        "PERSONA_NOMBRE",
        "CAMPANA_ORGANISMO",
        "CAMPANA_ZONA",
        "PRIOR_ZONA",
        "PRIOR_NIVEL",
        "ORDEN_AUTORIDAD",
    ):
        assert clave in payload, f"el trigger del workflow espera {clave}"
    assert payload["NUMERO_TELEFONO"] == "+34600990001"
    assert payload["PERSONA_NOMBRE"] == "Pablo"
    assert payload["CAMPANA_ORGANISMO"], "un organismo vacío se oye como un hueco en la llamada"


@pytest.mark.parametrize(
    "minutos,esperado",
    [(5, "rojo"), (30, "naranja"), (90, "amarillo"), (400, "verde"), (None, "amarillo")],
)
def test_el_nivel_previo_sale_de_los_minutos_al_frente(minutos, esperado):
    persona = Person(id="p-x", phone="+34600990001", minutes_to_front=minutos)
    assert notify.trigger_payload(persona)["PRIOR_NIVEL"] == esperado


# --------------------------------------------------------------------------- HTTP


def test_dispatch_por_http_devuelve_el_tablero_de_la_rafaga(client):
    respuesta = client.post(
        "/calls/dispatch",
        json={"person_ids": ["p-001"], "reason": "ensayo", "operator": "Pablo"},
    )

    assert respuesta.status_code == 200
    cuerpo = respuesta.json()
    assert cuerpo["dispatched"] == 1
    assert cuerpo["batch_id"].startswith("b-")
    assert cuerpo["calls"][0]["person_id"] == "p-001"

    tablero = client.get("/calls", params={"batch_id": cuerpo["batch_id"]}).json()
    assert len(tablero) == 1


def test_dispatch_con_una_persona_desconocida_es_un_400(client):
    respuesta = client.post("/calls/dispatch", json={"person_ids": ["p-inexistente"]})
    assert respuesta.status_code == 400
    assert "desconocida" in respuesta.json()["detail"]


def test_el_roster_no_publica_los_telefonos(client):
    filas = client.get("/api/roster").json()

    assert filas, "el roster es lo que Vigía rodea: vacío no sirve de nada"
    for fila in filas:
        assert fila["phone"] is None or fila["phone"].startswith("···"), (
            "el roster es público: no puede devolver el móvil entero de nadie"
        )
        assert "lng" in fila and "lat" in fila


def test_el_outcome_cierra_el_intento_que_lo_origino(client):
    lanzada = client.post("/calls/dispatch", json={"person_ids": ["p-002"]}).json()
    call_id = lanzada["calls"][0]["id"]

    client.post("/calls/outcome", json={"person_id": "p-002", "answered": True})

    tablero = {c["id"]: c for c in client.get("/calls").json()}
    assert tablero[call_id]["state"] == "answered"
    assert tablero[call_id]["answered"] is True


# --------------------------------------------------------------------------------------
# El tercer cerrojo, el que vive dentro del workflow
# --------------------------------------------------------------------------------------


def test_el_payload_declara_el_simulacro(monkeypatch):
    """`DEMO_MODE` es lo único que el cerrojo del workflow sigue exigiendo al disparo."""
    monkeypatch.setattr(settings, "demo_mode", True)

    payload = notify.trigger_payload(Person(id="p-x", phone="+34611000001"))

    assert payload["DEMO_MODE"] == "true"
    assert "ALLOWED_NUMBERS" not in payload, "la lista blanca se quitó del workflow en la v9"


def test_apagar_demo_mode_hace_que_el_workflow_rechace(monkeypatch):
    """`DEMO_MODE=false` es el freno de mano del lado de HappyRobot: rechaza todo."""
    monkeypatch.setattr(settings, "demo_mode", False)

    assert notify.trigger_payload(Person(id="p-x", phone="+34611000001"))["DEMO_MODE"] == "false"


def _gate_principal(numero: str, demo: str) -> str:
    """El nodo «Freno de mano del simulacro» de la v9, copiado literal.

    Vive en HappyRobot, no aquí, y por eso puede romperse sin que ningún test se entere: el 19
    de septiembre la rama del organismo llevaba horas muerta porque el payload no mandaba lo
    que el nodo esperaba. Copiarlo es la única forma de que un cambio en el payload avise.
    """
    limpio = "".join(c for c in str(numero or "") if c.isdigit() or c == "+")
    if str(demo or "").lower() != "true":
        raise ValueError("La peticion no viene declarada como simulacro: no se marca.")
    if not re.fullmatch(r"\+34[67]\d{8}", limpio):
        raise ValueError("El numero de destino no es un movil espanol valido.")
    return limpio


def test_el_payload_pasa_el_cerrojo_principal_de_la_v9(monkeypatch):
    monkeypatch.setattr(settings, "demo_mode", True)

    payload = notify.trigger_payload(Person(id="p-x", phone="+34611000001"))

    assert _gate_principal(payload["NUMERO_TELEFONO"], payload["DEMO_MODE"]) == "+34611000001"


def test_con_demo_mode_apagado_el_cerrojo_principal_no_marca(monkeypatch):
    monkeypatch.setattr(settings, "demo_mode", False)

    payload = notify.trigger_payload(Person(id="p-x", phone="+34611000001"))

    with pytest.raises(ValueError):
        _gate_principal(payload["NUMERO_TELEFONO"], payload["DEMO_MODE"])


def test_el_numero_del_organismo_viaja_para_que_el_mando_sea_configurable(monkeypatch):
    """El nodo de la v9 tiene a Nico fijo, pero deja que el disparo lo sobreescriba."""
    monkeypatch.setattr(settings, "demo_org_phone", "+34690757371")

    assert notify.trigger_payload(Person(id="p-x"))["NUMERO_ORGANISMO"] == "+34690757371"


# --------------------------------------------------------------------------------------
# Una llamada colgada no puede bloquear a esa persona el resto de la crisis
# --------------------------------------------------------------------------------------


def test_un_intento_sin_desenlace_caduca_y_deja_volver_a_llamar(poblado, monkeypatch):
    """El caso real del ensayo: cuelgan, nadie nos avisa, y esa ficha queda muerta.

    El resultado llega por `POST /calls/outcome`, y ese callback puede no llegar nunca — con
    la API en localhost, HappyRobot no la alcanza. Sin caducidad, la persona se queda con un
    `ringing` eterno y no se le puede volver a llamar.
    """
    monkeypatch.setattr(settings, "call_stale_minutes", 5.0)
    dispatcher.dispatch(poblado, CallDispatch(person_ids=["p-001"]))
    colgado = next(iter(poblado.calls.values()))
    poblado.set_call_state(colgado.id, CallState.ringing)

    # Bloquea mientras es reciente.
    _, intentos, descartados, _ = dispatcher.dispatch(poblado, CallDispatch(person_ids=["p-001"]))
    assert intentos == [] and "en curso" in descartados[0]["reason"]

    # Se envejece la marca de tiempo seis minutos.
    colgado.updated_at = "2020-01-01T00:00:00Z"
    _, intentos, _, _ = dispatcher.dispatch(poblado, CallDispatch(person_ids=["p-001"]))

    assert len(intentos) == 1, "tras caducar, esa persona se puede volver a llamar"
    assert poblado.calls[colgado.id].state == CallState.stale


def test_caducar_no_inventa_el_desenlace(poblado):
    """`stale` no es `no_answer`: no sabemos si contestó, y decir que no sería mentir."""
    dispatcher.dispatch(poblado, CallDispatch(person_ids=["p-001"]))
    colgado = next(iter(poblado.calls.values()))
    poblado.set_call_state(colgado.id, CallState.ringing)
    colgado.updated_at = "2020-01-01T00:00:00Z"

    poblado.expire_stale_calls()

    assert poblado.calls[colgado.id].state == CallState.stale
    assert poblado.calls[colgado.id].answered is None, "no se afirma nada sobre si descolgó"
    assert "/calls/outcome" in (poblado.calls[colgado.id].detail or "")


def test_un_intento_reciente_no_caduca(poblado):
    dispatcher.dispatch(poblado, CallDispatch(person_ids=["p-001"]))
    vivo = next(iter(poblado.calls.values()))
    poblado.set_call_state(vivo.id, CallState.ringing)

    assert poblado.expire_stale_calls() == []
    assert poblado.calls[vivo.id].state == CallState.ringing


# --------------------------------------------------------------------------------------
# Limpiar el tablero sin el martillo de /reset
# --------------------------------------------------------------------------------------


def test_calls_reset_vacia_el_tablero_y_no_toca_nada_mas(client):
    """El motivo de existir: `/reset` recarga el escenario entero y con el jurado delante eso
    no se pulsa. Esto retira los intentos y deja el resto del estado como estaba."""
    client.post("/calls/dispatch", json={"person_ids": ["p-001", "p-002"]})
    antes_personas = len(client.get("/state").json()["people"])
    antes_log = client.get("/decisions").json()["count"]
    assert len(client.get("/calls").json()) == 2

    respuesta = client.post("/calls/reset", params={"operator": "Pablo"})

    assert respuesta.status_code == 200
    assert client.get("/calls").json() == []
    # Lo demás sigue en pie: eso es justo lo que lo distingue de /reset.
    assert len(client.get("/state").json()["people"]) == antes_personas
    assert client.get("/decisions").json()["count"] > antes_log, "el borrado queda registrado"


def test_calls_reset_puede_acotarse_a_una_rafaga(client):
    primera = client.post("/calls/dispatch", json={"person_ids": ["p-001"]}).json()
    client.post("/calls/dispatch", json={"person_ids": ["p-002"]})
    assert len(client.get("/calls").json()) == 2

    client.post("/calls/reset", params={"batch_id": primera["batch_id"]})

    quedan = client.get("/calls").json()
    assert len(quedan) == 1 and quedan[0]["person_id"] == "p-002"


def test_calls_reset_sobre_un_tablero_vacio_no_falla(client):
    respuesta = client.post("/calls/reset")
    assert respuesta.status_code == 200
    assert respuesta.json()["decisions"] == []


def test_tras_calls_reset_se_puede_volver_a_llamar(client):
    """El caso de uso entero: la llamada se queda colgada y hay que poder repetir.

    Se fuerza un intento VIVO porque en modo simulado el estado nace terminal y nunca bloquea;
    lo que bloquea de verdad —y es el problema que este endpoint resuelve— es un `ringing` que
    nadie cerró nunca.
    """
    client.post("/calls/dispatch", json={"person_ids": ["p-001"]})
    colgado = client.get("/calls").json()[0]
    state.set_call_state(colgado["id"], CallState.ringing)

    bloqueado = client.post("/calls/dispatch", json={"person_ids": ["p-001"]}).json()
    assert bloqueado["dispatched"] == 0 and "en curso" in bloqueado["skipped_detail"][0]["reason"]

    client.post("/calls/reset")

    assert client.post("/calls/dispatch", json={"person_ids": ["p-001"]}).json()["dispatched"] == 1


# --------------------------------------------------------------------------------------
# No se marca de verdad con una clave que está publicada en el repo
# --------------------------------------------------------------------------------------


def test_no_se_marca_con_la_clave_de_ejemplo_del_repo(poblado, monkeypatch):
    """Pasó de verdad: producción quedó protegida con el marcador de `.env.example`.

    El repo es público, así que esa clave la tiene cualquiera — y con las llamadas reales
    encendidas, cualquiera podía hacer sonar los móviles del equipo.
    """
    monkeypatch.setattr(settings, "allow_real_calls", True)
    monkeypatch.setattr(settings, "hr_shared_secret", "cambiame-por-algo-largo")

    with pytest.raises(dispatcher.DispatchError, match="el repo es público"):
        dispatcher.dispatch(poblado, CallDispatch(person_ids=["p-001"]))


def test_con_las_llamadas_simuladas_la_clave_de_ejemplo_no_estorba(poblado, monkeypatch):
    """Sin `ALLOW_REAL_CALLS` no hay nada que proteger: que nadie se quede sin poder ensayar."""
    monkeypatch.setattr(settings, "allow_real_calls", False)
    monkeypatch.setattr(settings, "hr_shared_secret", "cambiame-por-algo-largo")

    _, intentos, _, _ = dispatcher.dispatch(poblado, CallDispatch(person_ids=["p-001"]))

    assert len(intentos) == 1


@pytest.mark.parametrize("clave,publica", [
    ("cambiame-por-algo-largo", True),
    ("CAMBIAME-POR-ALGO-LARGO", True),
    ("clave-de-ensayo", True),
    ("3f8a91c2e5b74d06a1f9c3e7b2d85a40", False),
])
def test_deteccion_de_claves_publicas(monkeypatch, clave, publica):
    monkeypatch.setattr(settings, "hr_shared_secret", clave)
    assert settings.secret_is_public is publica
