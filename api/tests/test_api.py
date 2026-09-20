"""La API de punta a punta: el ciclo llamada → posición → el fuego se mueve → el plan cambia.

Es el mismo recorrido que el `curl` documentado en el README, pero automático.
"""

from __future__ import annotations

import pytest

from settings import settings


# Perímetro que ha avanzado al norte: el borde norte pasa de 41.62 a 41.645, o sea a ~600 m de las
# casas del Camino del Horno (41.650-41.652). Es el evento que invalida el plan anterior.
FUEGO_ENCIMA = {
    "perimeter": {
        "type": "Polygon",
        "coordinates": [
            [
                [-6.05, 41.60],
                [-5.95, 41.60],
                [-5.95, 41.645],
                [-6.05, 41.645],
                [-6.05, 41.60],
            ]
        ],
    },
    "wind": {"direction_deg": 180.0, "speed_kmh": 45.0, "gusts_kmh": 70.0},
    "spread_rate_mh": 1400.0,
    "head_bearing_deg": 0.0,
}


def test_health_dice_que_esta_vivo_y_si_puede_llamar(client):
    r = client.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is True
    assert body["allow_real_calls"] is False, "el health tiene que delatar si puede llamar de verdad"
    assert body["people"] == 4 and body["houses"] == 4


def test_el_estado_trae_el_escenario_completo(client):
    client.post("/reset")
    body = client.get("/state").json()
    assert {p["id"] for p in body["people"]} == {"p-001", "p-002", "p-003", "p-004"}
    assert body["fire"] is not None
    assert body["state_version"] > 0
    # y cada persona ya tiene plan: el planner corre al arrancar
    assert all(p["assigned_exit_id"] for p in body["people"])


def test_una_persona_inexistente_da_404_y_no_inventa_nada(client):
    assert client.get("/people/p-fantasma").status_code == 404
    assert client.get("/houses/h-fantasma").status_code == 404
    assert client.get("/instructions/p-fantasma").status_code == 404


def test_las_instrucciones_son_una_frase_para_decir_por_telefono(client):
    client.post("/reset")
    body = client.get("/instructions/p-001").json()
    frase = body["say_this"]
    assert frase and frase == " ".join(frase.split()), "sin saltos de línea: lo lee un TTS"
    # nada de jerga ni ids ni coordenadas en lo que se le dice a un vecino asustado
    for prohibido in ("p-001", "x-a", "lat", "lon", "priority_score", "None"):
        assert prohibido not in frase
    assert body["exit_name"] == "Tabara (colegio)"
    assert body["urgency"] in {"critical", "high", "medium", "low"}


def test_state_version_no_vuelve_a_cero_al_resetear(client):
    """El dashboard hace long-poll con `state_version`: si un reset lo reiniciara, dejaría de ver
    cambios hasta que el contador volviera a pasar por donde estaba."""
    antes = client.post("/reset").json()["state_version"]
    despues = client.post("/reset").json()["state_version"]
    assert despues > antes
    # y el primer diff tras el reset trae el escenario nuevo entero
    diff = client.get(f"/state/diff?since_version={antes}").json()
    assert len(diff["people"]) == 4


def test_el_diff_devuelve_solo_lo_que_cambio(client):
    client.post("/reset")
    version = client.get("/state").json()["state_version"]

    # nada ha cambiado desde entonces
    vacio = client.get(f"/state/diff?since_version={version}").json()
    assert vacio["people"] == []
    assert vacio["houses"] == []
    assert vacio["decision_log"] == []
    assert vacio["fire"] is None

    # una sola posición: en el diff aparece esa persona y no las otras tres
    client.post("/positions", json={"person_id": "p-001", "lat": 41.655, "lon": -6.004})
    diff = client.get(f"/state/diff?since_version={version}").json()
    assert [p["id"] for p in diff["people"]] == ["p-001"]
    assert diff["state_version"] > version
    assert diff["decision_log"], "un movimiento significativo deja decisión en el log"


# ======================================================================================
# El ciclo completo (el mismo del README)
# ======================================================================================


def test_ciclo_completo_llamada_posicion_fuego_y_replan(client):
    # 1. escenario limpio
    reset = client.post("/reset")
    assert reset.status_code == 200
    v0 = reset.json()["state_version"]

    # 2. la llamada: Mercedes contesta y cuenta cosas que el censo no sabía
    llamada = client.post(
        "/calls/outcome",
        json={
            "run_id": "run-test-1",
            "person_id": "p-002",
            "answered": True,
            "duration_s": 74,
            "extracted": {
                "people_at_home": 2,
                "mobility": "reduced",
                "has_car": False,
                "has_smartphone": False,
                "consent_position": True,
                "will_evacuate": True,
                "neighbors_mentioned": [
                    {"name": "Josefa", "address": "Camino del Horno 9", "at_home": True}
                ],
                "vulnerable_people": [{"description": "vive sola, 88 años"}],
            },
            "agent_notes": "Se oye el helicóptero desde la casa.",
        },
    )
    assert llamada.status_code == 200
    cuerpo = llamada.json()
    assert cuerpo["ok"] is True
    assert cuerpo["decisions"], "una llamada atendida tiene que producir decisiones"
    assert all(d["reason"] for d in cuerpo["decisions"]), "toda decisión lleva motivo legible"

    estado = client.get("/state").json()
    mercedes = next(p for p in estado["people"] if p["id"] == "p-002")
    assert mercedes["household_size"] == 2
    assert mercedes["mobility"] == "reduced"
    # el vecino que mencionó por teléfono existe ahora como persona/casa a atender
    assert len(estado["people"]) == 5
    assert len(estado["houses"]) == 5
    josefa = next(p for p in estado["people"] if p["name"] == "Josefa")
    assert josefa["status"] == "unknown", "de un vecino de oídas no se sabe nada: sube prioridad"

    # 3. la posición: Antonio se mueve de verdad
    posicion = client.post(
        "/positions", json={"person_id": "p-001", "lat": 41.658, "lon": -6.006, "accuracy_m": 12}
    )
    assert posicion.status_code == 200
    antonio = client.get("/people/p-001").json()
    assert antonio["position_source"] == "gps"
    assert antonio["status"] == "moving", "quien se mueve deja de estar 'contacted'"
    assert antonio["trajectory"], "la trayectoria es lo que permite ver si va hacia el fuego"

    v_antes_del_fuego = client.get("/state").json()["state_version"]
    minutos_antes = {
        p["id"]: p["minutes_to_front"] for p in client.get("/state").json()["people"]
    }

    # 4. el escenario se mueve: el frente avanza hacia las casas
    fuego = client.post("/events/fire", json=FUEGO_ENCIMA)
    assert fuego.status_code == 200
    decisiones = fuego.json()["decisions"]
    assert decisiones, "mover el fuego tiene que replanificar"
    assert any("frente" in d["reason"].lower() or "fuego" in d["reason"].lower() for d in decisiones)
    # causa → consecuencia: el perímetro nuevo es la raíz (sin disparador) y lo que salga detrás
    # cuelga de él. Ver `test_el_evento_raiz_no_cuelga_del_evento_anterior`.
    raiz = decisiones[0]
    assert raiz["type"] == "fire_updated" and raiz["trigger_event_id"] is None
    assert all(d["trigger_event_id"] == raiz["id"] for d in decisiones[1:])

    # 5. todo el mundo está más cerca del frente que antes
    despues = client.get("/state").json()
    minutos_despues = {p["id"]: p["minutes_to_front"] for p in despues["people"]}
    for pid in ("p-001", "p-002", "p-003"):
        assert minutos_despues[pid] < minutos_antes[pid], pid

    # 6. la cola: ordenada, con motivo y desglose
    cola = client.get("/queue").json()
    assert cola["count"] >= 4
    scores = [f["priority_score"] for f in cola["queue"]]
    assert scores == sorted(scores, reverse=True)
    primera = cola["queue"][0]
    assert primera["reason"] and "min hasta el frente" in primera["reason"]
    assert primera["score_breakdown"]["urgency"] >= 0
    # el fuego encima hace que la urgencia pese de verdad
    assert primera["priority_score"] > 0

    # 7. el diff: solo lo que cambió con el fuego, y el fuego mismo
    diff = client.get(f"/state/diff?since_version={v_antes_del_fuego}").json()
    assert diff["fire"] is not None
    assert diff["people"], "el replán cambió a gente"
    assert diff["decision_log"]
    assert all(d["reason"] for d in diff["decision_log"])
    # y no arrastra el escenario entero
    assert len(diff["people"]) <= 5
    assert diff["since_version"] == v_antes_del_fuego
    assert diff["state_version"] > v_antes_del_fuego
    assert v_antes_del_fuego > v0


def test_el_evento_raiz_no_cuelga_del_evento_anterior(client):
    """El timeline del dashboard se lee como causa → consecuencia. Si el evento raíz heredara
    `last_event_id`, el incendio colgaría de la posición GPS que llegó justo antes y el mando leería
    una cadena causal falsa."""
    client.post("/reset")
    # una posición GPS justo antes: es el evento que el raíz heredaría por error
    client.post("/positions", json={"person_id": "p-001", "lat": 41.655, "lon": -6.004})
    decisiones = client.post(
        "/events/exit-threatened", json={"exit_id": "x-a", "reason": "fuego en la vía"}
    ).json()["decisions"]

    raiz = decisiones[0]
    assert raiz["type"] == "plan_discarded"
    assert raiz["trigger_event_id"] is None, "la salida amenazada ES la causa, no tiene disparador"
    # y todo lo que vino detrás cuelga de esa raíz, no de la posición anterior
    consecuencias = decisiones[1:]
    assert consecuencias and all(d["trigger_event_id"] == raiz["id"] for d in consecuencias)


def test_el_operador_puede_cambiar_el_plan_a_mano(client):
    """"Control": el mando tiene que poder intervenir y el sistema no debe deshacerlo."""
    client.post("/reset")
    r = client.post(
        "/human/override",
        json={
            "subject_type": "person",
            "subject_id": "p-001",
            "field": "assigned_exit_id",
            "value": "x-b",
            "reason": "el jefe de sector dice que Tabara está saturada",
            "operator": "cecopi-luis",
        },
    )
    assert r.status_code == 200
    assert client.get("/people/p-001").json()["assigned_exit_id"] == "x-b"

    # el planner vuelve a correr con el fuego moviéndose y NO revierte la decisión humana
    client.post("/events/fire", json=FUEGO_ENCIMA)
    assert client.get("/people/p-001").json()["assigned_exit_id"] == "x-b"

    decisiones = client.get("/decisions?limit=200").json()["decisions"]
    humanas = [d for d in decisiones if d["actor"] == "human"]
    # el contrato no da campo `operator` en el decision_log: el operador va en `approved_by`
    assert humanas and humanas[0]["approved_by"] == "cecopi-luis"
    assert "NO lo revertirá" in humanas[0]["reason"]


def test_una_salida_amenazada_reasigna_a_quien_iba_hacia_alli(client):
    client.post("/reset")
    assert client.get("/people/p-001").json()["assigned_exit_id"] == "x-a"

    r = client.post(
        "/events/exit-threatened",
        json={"exit_id": "x-a", "reason": "el fuego ha cruzado la carretera de Tabara"},
    )
    assert r.status_code == 200
    assert client.get("/state").json()["safe_zones"], "las zonas siguen ahí, marcadas"

    zonas = {z["id"]: z for z in client.get("/state").json()["safe_zones"]}
    assert zonas["x-a"]["status"] != "open"
    # y el plan de quien salía por ahí se tira: nadie se queda apuntando a una salida amenazada
    assert client.get("/people/p-001").json()["assigned_exit_id"] == "x-b"
    motivos = [d["reason"] for d in r.json()["decisions"]]
    assert any("Tabara" in m or "x-a" in m for m in motivos)


def test_una_carretera_cortada_entra_en_el_aviso_a_la_gente(client):
    client.post("/reset")
    r = client.post(
        "/events/road-closure",
        json={"road_name": "ZA-P-2415", "reason": "columna de humo, visibilidad cero"},
    )
    assert r.status_code == 200
    aviso = client.get("/instructions/p-001").json()
    assert "ZA-P-2415" in aviso["avoid_roads"]
    assert "ZA-P-2415" in aviso["say_this"]


def test_las_llamadas_sin_respuesta_acaban_en_la_lista_de_la_patrulla(client):
    client.post("/reset")
    for _ in range(2):
        r = client.post("/calls/outcome", json={"person_id": "p-003", "answered": False})
        assert r.status_code == 200

    lista = client.get("/houses/no-answer").json()
    assert lista["count"] == 1
    fila = lista["houses"][0]
    assert fila["house_id"] == "h-003"
    assert fila["priority_rank"] == 1
    assert fila["call_attempts"] >= 2
    assert fila["reason"], "la patrulla lee el motivo, no un score"
    assert fila["margin_min"] is None or isinstance(fila["margin_min"], (int, float))


def test_la_prioridad_aerea_explica_por_que_un_sector_va_primero(client):
    client.post("/reset")
    body = client.get("/sectors/air-priority").json()
    assert body["sectors"]
    primero = body["sectors"][0]
    assert primero["air_priority_rank"] == 1
    assert "personas" in (primero["air_priority_reason"] or "")
    assert primero["people_inside"] >= 1


# --------------------------------------------------------------------------------------
# La puerta: una clave con acentos no puede valer según el cliente que la mande
# --------------------------------------------------------------------------------------


def test_la_clave_vale_llegue_en_latin1_o_en_utf8(monkeypatch):
    """Nos costó una hora de ensayo: la misma clave entraba por el navegador y daba 401 por curl.

    Una cabecera HTTP es latin-1 (RFC 9110) y así la decodifica Starlette, pero `curl` manda la
    `ñ` en UTF-8. Las dos lecturas tienen que valer o la auth depende del cliente.
    """
    from main import _api_key_ok

    clave = "secreto-con-eñe"
    monkeypatch.setattr(settings, "hr_shared_secret", clave)

    # Lo que ve Starlette cuando el cliente manda latin-1 (navegador) y cuando manda UTF-8 (curl).
    como_latin1 = clave
    como_utf8 = clave.encode("utf-8").decode("latin-1")

    assert como_utf8 != como_latin1, "si no, el test no prueba nada"
    assert _api_key_ok(como_latin1) is True
    assert _api_key_ok(como_utf8) is True
    assert _api_key_ok("otra-cosa") is False
    assert _api_key_ok(None) is False


def test_sin_secreto_configurado_la_clave_no_valida_nada(monkeypatch):
    """Con `HR_SHARED_SECRET` vacío la puerta queda abierta en el middleware, pero el
    comprobador nunca debe decir «sí» a una clave cualquiera."""
    from main import _api_key_ok

    monkeypatch.setattr(settings, "hr_shared_secret", "")
    assert _api_key_ok("lo-que-sea") is False


# ======================================================================================
# El camino de vuelta: lo que el agente concluyó al colgar entra en el mapa
# ======================================================================================


def test_la_observacion_del_agente_pinta_a_la_persona_y_cierra_la_llamada(client):
    """`POST /calls/observation` es el nodo `Observación` del workflow posteando al colgar."""
    client.post("/reset")
    r = client.post(
        "/calls/observation",
        json={
            "PERSONA_ID": "p-002",
            "run_id": "run-obs-1",
            "run_url": "https://platform.eu.happyrobot.ai/runs/run-obs-1",
            "duration_s": "96",
            "nivel": "rojo",
            "PRIOR_NIVEL": "amarillo",
            "zona_declarada": "El Pinar",
            "tipo_lugar": "exterior",
            "llamas": "true",
            "discrepancia": "prior_bajo_obs_alta",
            "confianza": "alta",
            "resultado": "completada",
            "nota_libre": "Sale andando con su madre por el camino del horno.",
        },
    )
    assert r.status_code == 200
    assert r.json()["ok"] is True

    persona = client.get("/people/p-002").json()
    triaje = persona["triage"]
    assert triaje["level"] == "red", "rojo del agente → red en el contrato"
    assert triaje["prior_level"] == "yellow"
    assert triaje["run_url"].endswith("run-obs-1")
    assert "PEOR de lo que decía el mapa" in triaje["reason"]
    assert "VE LLAMAS" in triaje["reason"]
    # Y la llamada se aplicó por el camino de siempre: contestó y cuenta como intento.
    assert persona["call_attempts"] >= 1
    assert persona["status"] != "no_answer"

    # El mapa lo lee del roster, no del estado completo.
    fila = next(f for f in client.get("/api/roster").json() if f["id"] == "p-002")
    assert fila["triage_level"] == "red"
    assert fila["triage_confidence"] == "alta"
    assert fila["triage_reason"]


def test_una_observacion_de_llamada_no_contestada_no_inventa_conversacion(client):
    client.post("/reset")
    r = client.post(
        "/calls/observation",
        json={"PERSONA_ID": "p-003", "resultado": "no_contactado", "nivel": "", "confianza": "baja"},
    )
    assert r.status_code == 200
    persona = client.get("/people/p-003").json()
    assert persona["status"] == "no_answer", "sin interlocutor no hay contacto"
    assert persona["triage"]["level"] == "unknown", "un nivel vacío no se inventa"
    # «confianza baja» sin interlocutor sonaría a que el agente dudó de algo que nadie dijo.
    assert "nadie descolgó" in persona["triage"]["reason"]
    assert "confianza" not in persona["triage"]["reason"]


def test_los_campos_vacios_del_extract_no_tumban_la_peticion(client):
    """Todo llega como texto desde la plantilla del nodo webhook: `""` es lo normal, no un 422."""
    client.post("/reset")
    r = client.post(
        "/calls/observation",
        json={
            "PERSONA_ID": "p-001",
            "duration_s": "",
            "llamas": "",
            "nivel": "Naranja",
            "zona_declarada": "null",
        },
    )
    assert r.status_code == 200
    persona = client.get("/people/p-001").json()
    assert persona["triage"]["level"] == "orange", "el nivel tolera mayúsculas"
    assert persona["triage"]["declared_zone"] is None, "«null» de una plantilla es nada"


def test_una_observacion_de_alguien_desconocido_crea_la_ficha(client):
    """El agente puede acabar hablando con quien no estaba en el censo: no se tira el dato."""
    client.post("/reset")
    r = client.post(
        "/calls/observation",
        json={"PERSONA_ID": "p-nueva", "NUMERO_TELEFONO": "+34600990999", "nivel": "verde"},
    )
    assert r.status_code == 200
    assert client.get("/people/p-nueva").json()["triage"]["level"] == "green"


def test_una_llamada_sin_nada_resenable_tambien_deja_motivo(client):
    """Una ficha que dice «el agente no dejó motivo» se lee como que algo falló.

    Lo normal es lo contrario: la llamada fue bien y no había nada que corrigiera el mapa. Eso
    también es información —significa no volver a mirar esta ficha— y tiene que estar escrito.
    """
    client.post("/reset")
    client.post(
        "/calls/observation",
        json={
            "PERSONA_ID": "p-002",
            "nivel": "verde",
            "discrepancia": "ninguna",
            "confianza": "alta",
            "resultado": "completada",
        },
    )
    motivo = client.get("/people/p-002").json()["triage"]["reason"]
    assert motivo, "el motivo nunca vuelve vacío"
    assert "confirma lo que traía el mapa" in motivo

    # Y si ni siquiera hubo comparación, se dice eso otro en vez de afirmar una confirmación.
    client.post("/calls/observation", json={"PERSONA_ID": "p-004", "nivel": "verde"})
    otro = client.get("/people/p-004").json()["triage"]["reason"]
    assert otro and "confirma" not in otro


def test_un_campo_ininteligible_no_tira_toda_la_observacion(client):
    """Caso real del 20 sep 2026: el AI Extract devolvió `"llamas": "llamas"`.

    Pydantic tumbaba la petición entera con un 422 y se perdía una observación que traía nivel
    rojo, discrepancia y una nota diciendo que la persona veía llamas. Del otro lado de este
    endpoint hay un modelo de lenguaje: puede poner cualquier cosa en cualquier campo, y eso no
    puede costar la única información que tenemos de alguien en peligro.
    """
    client.post("/reset")
    r = client.post(
        "/calls/observation",
        json={
            "PERSONA_ID": "p-001",
            "nivel": "rojo",
            "llamas": "llamas",          # el nombre del campo en vez de un booleano
            "duration_s": "un rato",     # y un número que no es un número
            "discrepancia": "prior_bajo_obs_alta",
            "confianza": "media",
            "resultado": "cortada",
            "nota_libre": "Afirmó ver llamas cercanas; el triaje quedó interrumpido.",
        },
    )
    assert r.status_code == 200, "un campo ilegible no puede costar la observación entera"

    triaje = client.get("/people/p-001").json()["triage"]
    assert triaje["level"] == "red", "lo que SÍ se entendía se guarda"
    assert triaje["flames"] is None, "lo que no se entendía se descarta, no se inventa"
    assert "PEOR de lo que decía el mapa" in triaje["reason"]
    assert "se cortó a medias" in triaje["reason"]


def test_los_booleanos_del_extract_admiten_las_formas_razonables(client):
    from models import CallObservation

    assert CallObservation(llamas="true").flames is True
    assert CallObservation(llamas="sí").flames is True
    assert CallObservation(llamas=1).flames is True
    assert CallObservation(llamas="false").flames is False
    assert CallObservation(llamas="no").flames is False
    assert CallObservation(llamas="cualquier cosa").flames is None
    assert CallObservation(duration_s="96").duration_s == 96
    assert CallObservation(duration_s="96.7").duration_s == 96
    assert CallObservation(duration_s="un rato").duration_s is None
