"""El log de llamadas: lo que una llamada aprende y las otras pueden consultar.

Dos cosas se prueban aquí, y son las dos que piden el producto y la pantalla:
que se pueda anotar en cada interacción sin que eso ensucie el `decision_log`, y que lo anotado
salga por `/state/diff` para que el puesto de mando lo vea apilarse en vivo.
"""

from __future__ import annotations

from models import LogTopic


def _anotar(client, **campos):
    cuerpo = {"question": "¿está cortada la ZA-P-2434?", **campos}
    respuesta = client.post("/calls/log", json=cuerpo)
    assert respuesta.status_code == 200, respuesta.text
    return respuesta.json()


def test_lo_anotado_sale_por_el_diff_para_que_la_pantalla_lo_vea_llegar(client):
    antes = client.get("/state").json()["state_version"]

    _anotar(
        client,
        topic=LogTopic.road_status.value,
        road="ZA-P-2434",
        source_id="bomberos",
        source_detail="bomberos de Zamora",
        answer="abierta a las 14:10",
    )

    diff = client.get(f"/state/diff?since_version={antes}").json()
    assert diff["state_version"] > antes, "anotar tiene que subir la versión o el long-poll no despierta"
    assert len(diff["call_log"]) == 1
    fila = diff["call_log"][0]
    assert fila["road"] == "ZA-P-2434"
    assert fila["source_id"] == "bomberos"
    assert fila["answer"] == "abierta a las 14:10"
    assert fila["answered_at"] is not None


def test_anotar_no_ensucia_el_decision_log(client):
    """Son dos cosas distintas: el sistema no ha decidido nada, alguien ha dicho algo."""
    antes = client.get("/state").json()["state_version"]
    _anotar(client, source_id="vecino")

    diff = client.get(f"/state/diff?since_version={antes}").json()
    assert diff["call_log"], "la anotación tiene que estar"
    assert diff["decision_log"] == [], "una anotación no es una decisión del sistema"


def test_la_vigencia_en_minutos_se_convierte_en_fecha(client):
    """El workflow dice «esto vale 20 minutos»; el reloj bueno lo tiene la API."""
    datos = _anotar(client, validity_min=20, answer="abierta")
    assert datos["ok"] is True

    entradas = client.get("/calls/log?limit=1").json()["entries"]
    assert entradas[0]["valid_until"] is not None

    sin_caducidad = _anotar(client, question="¿vive sola?", source_id="vecino")
    assert sin_caducidad["ok"] is True
    ultima = client.get("/calls/log?limit=1").json()["entries"][0]
    assert ultima["valid_until"] is None, "lo que no caduca se queda en null, no en una fecha lejana"


def test_el_telefono_resuelve_a_persona_contra_el_padron(client):
    persona = client.get("/state").json()["people"][0]
    _anotar(client, phone=persona["phone"], source_id="vecino")

    fila = client.get("/calls/log?limit=1").json()["entries"][0]
    assert fila["person_id"] == persona["id"]


def test_un_telefono_desconocido_no_inventa_persona(client):
    """Que no resuelva es información: es un número que nadie tenía en la lista."""
    _anotar(client, phone="+34600990000", source_id="vecino")

    fila = client.get("/calls/log?limit=1").json()["entries"][0]
    assert fila["person_id"] is None
    assert fila["phone"] == "+34600990000", "el teléfono se conserva aunque no resuelva"


def test_las_dudas_sin_respuesta_son_la_cola_de_lo_que_hay_que_preguntar(client):
    _anotar(client, question="¿evacúan El Pinar?", callback_to="cecopi")
    _anotar(client, question="¿sigue abierta la ZA-P-2434?", answer="sí", source_id="bomberos")

    abiertas = client.get("/calls/log?only_open=true").json()["entries"]
    assert [e["question"] for e in abiertas] == ["¿evacúan El Pinar?"]
    assert abiertas[0]["callback_to"] == "cecopi"


def test_se_puede_filtrar_por_carretera_que_es_lo_que_mas_se_pregunta(client):
    """Una carretera no pertenece a un núcleo: la ZA-P-2434 es la salida de dos pueblos, así que
    filtrar por zona perdería el dato para uno de ellos."""
    _anotar(client, topic=LogTopic.road_status.value, road="ZA-P-2434", answer="abierta")
    _anotar(client, topic=LogTopic.road_status.value, road="N-631", answer="cortada")

    solo_una = client.get("/calls/log?road=N-631").json()["entries"]
    assert len(solo_una) == 1 and solo_una[0]["answer"] == "cortada"
