"""El planner: convoyes, orden de la lista de la patrulla y el freno de aprobación humana."""

from __future__ import annotations

import pytest

import planner
from models import (
    House,
    HouseStatus,
    Mobility,
    Person,
    PersonStatus,
    PositionSource,
    ConvoyRole,
)
from priority import house_margin_min, house_priority_key, ranked_no_answer_houses


# ======================================================================================
# Convoyes: "no le des 3 rutas distintas a 3 vecinos, dales un coche al que seguir"
# ======================================================================================


def test_se_forma_un_convoy_con_los_que_salen_por_el_mismo_sitio(planned_state):
    state = planned_state
    assert len(state.convoys) == 1, list(state.convoys)
    convoy = next(iter(state.convoys.values()))

    # p-001 y p-003 tienen coche y la misma zona de salida; p-002 (movilidad reducida) NO va en
    # convoy de coches y p-004 (a pie, sin localizar) tampoco.
    assert set(convoy.member_ids) == {"p-001", "p-003"}
    assert convoy.exit_id == "x-a"
    assert state.people["p-002"].convoy_id is None
    assert state.people["p-004"].convoy_id is None

    # Roles aplicados a las personas, no solo al convoy.
    guia = state.people[convoy.leader_person_id]
    assert guia.convoy_role == ConvoyRole.leader
    seguidores = [p for p in state.people.values() if p.convoy_role == ConvoyRole.follower]
    assert [p.id for p in seguidores] == [pid for pid in convoy.member_ids if pid != guia.id]

    # El guía es alguien con quien se puede hablar y que conduce.
    assert guia.has_smartphone is True
    assert guia.mobility == Mobility.car


def test_el_guia_se_elige_por_smartphone_y_coche():
    """Sin smartphone no se le puede reconducir en marcha; sin coche no puede ir delante."""
    a_pie_con_movil = Person(
        id="p-a", has_smartphone=True, mobility=Mobility.walking, minutes_to_front=10.0
    )
    coche_sin_movil = Person(
        id="p-b", has_smartphone=False, mobility=Mobility.car, minutes_to_front=10.0
    )
    coche_con_movil = Person(
        id="p-c", has_smartphone=True, mobility=Mobility.car, minutes_to_front=10.0
    )
    assert planner._pick_leader([coche_sin_movil, coche_con_movil, a_pie_con_movil]).id == "p-c"
    # entre dos con smartphone gana el que conduce
    assert planner._pick_leader([a_pie_con_movil, coche_con_movil]).id == "p-c"
    # el smartphone pesa más que el coche (se le puede avisar del cambio de plan)
    assert planner._pick_leader([coche_sin_movil, a_pie_con_movil]).id == "p-a"


def test_al_seguidor_se_le_dice_a_quien_seguir_no_una_ruta(planned_state):
    state = planned_state
    convoy = next(iter(state.convoys.values()))
    seguidor = next(
        state.people[pid] for pid in convoy.member_ids if pid != convoy.leader_person_id
    )
    aviso = planner.build_instruction(state, seguidor)
    assert "siga a" in aviso["say_this"]
    assert convoy.vehicle_description in aviso["say_this"]
    # y nada de jerga: ni ids ni coordenadas en la frase que se lee por teléfono
    assert seguidor.id not in aviso["say_this"]
    assert "lat" not in aviso["say_this"].lower()


# ======================================================================================
# Casas sin contestar: el orden lo decide minutes_to_front - patrol_eta_min
# ======================================================================================


def _casa_sin_contestar(hid: str, mtf: float | None, eta: float | None, **kw) -> House:
    return House(
        id=hid, status=HouseStatus.no_answer, minutes_to_front=mtf, patrol_eta_min=eta, **kw
    )


def test_la_lista_de_la_patrulla_se_ordena_por_margen_no_por_cercania(state):
    """Primero la casa con menos margen ALCANZABLE; las imposibles caen al final.

    La resta es lo que convierte "está a 2 km" en "se puede llegar o no": una casa a la que el
    fuego llega antes que la patrulla no es la más urgente, es la que no se puede atender sin
    quemar a la patrulla.
    """
    state.houses.clear()
    state.houses["h-holgada"] = _casa_sin_contestar("h-holgada", 40.0, 10.0)  # margen 30
    state.houses["h-justa"] = _casa_sin_contestar("h-justa", 20.0, 10.0)  # margen 10
    state.houses["h-imposible"] = _casa_sin_contestar("h-imposible", 10.0, 25.0)  # margen -15
    state.houses["h-sin-datos"] = _casa_sin_contestar("h-sin-datos", None, None)  # margen None

    assert house_margin_min(state.houses["h-justa"]) == pytest.approx(10.0)
    assert house_margin_min(state.houses["h-imposible"]) == pytest.approx(-15.0)

    orden = [h.id for h in ranked_no_answer_houses(state)]
    assert orden == ["h-justa", "h-holgada", "h-sin-datos", "h-imposible"]


def test_a_igual_margen_va_primero_la_casa_vulnerable(state):
    state.houses.clear()
    state.houses["h-normal"] = _casa_sin_contestar("h-normal", 30.0, 10.0)
    state.houses["h-vuln"] = _casa_sin_contestar("h-vuln", 30.0, 10.0, vulnerable=True,
                                                 vulnerability_reason="vive sola, 88 años")
    assert [h.id for h in ranked_no_answer_houses(state)] == ["h-vuln", "h-normal"]
    # y el criterio es explícito en la clave de orden
    assert house_priority_key(state.houses["h-vuln"]) < house_priority_key(state.houses["h-normal"])


def test_solo_entran_en_la_lista_las_casas_sin_contestar(state):
    """Las `pending` todavía se están llamando: la patrulla no va a una casa que aún no se llamó."""
    assert [h.id for h in ranked_no_answer_houses(state)] == []
    state.houses["h-001"].status = HouseStatus.no_answer
    assert [h.id for h in ranked_no_answer_houses(state)] == ["h-001"]


def test_dos_llamadas_sin_respuesta_escalan_la_casa_a_la_patrulla(state):
    casa = state.houses["h-001"]
    casa.call_attempts = 2
    # el habitante sigue sin localizar: si estuviera localizado la patrulla no tendría que ir
    state.people["p-001"].status = PersonStatus.unknown
    state.people["p-001"].position_source = None

    decisiones = planner.escalate_houses_to_patrol(state)

    assert casa.status == HouseStatus.no_answer
    assert casa.priority_rank == 1
    assert any(d.subject_id == "h-001" and "sin respuesta" in d.reason for d in decisiones)


def test_si_el_vecino_aparece_localizado_la_casa_sale_de_la_lista(state):
    casa = state.houses["h-001"]
    casa.status = HouseStatus.no_answer
    state.people["p-001"].status = PersonStatus.moving
    state.people["p-001"].position_source = PositionSource.gps

    decisiones = planner.escalate_houses_to_patrol(state)

    assert casa.status == HouseStatus.answered
    assert casa.priority_rank is None
    assert any("La patrulla no tiene que ir" in d.reason for d in decisiones)


# ======================================================================================
# El freno: margen negativo NO se asigna solo
# ======================================================================================


def test_una_casa_que_el_fuego_alcanza_antes_pide_aprobacion_humana(state):
    casa = state.houses["h-004"]  # a 11 km de la patrulla pt-1 → ETA ~16 min
    casa.status = HouseStatus.no_answer
    casa.minutes_to_front = 5.0  # el frente llega en 5 min: imposible llegar antes

    decisiones = planner.assign_patrols(state)

    assert casa.assigned_patrol_id is None, "no se manda a la patrulla a quemarse"
    assert casa.patrol_eta_min is not None and casa.patrol_eta_min > 5.0
    assert house_margin_min(casa) < 0
    assert len(state.pending_approvals) == 1
    pendiente = next(iter(state.pending_approvals.values()))
    assert pendiente.action == "assign_patrol"
    assert pendiente.payload["house_id"] == "h-004"
    assert "APROBACIÓN NECESARIA" in pendiente.reason
    assert any(d.type.value == "approval_requested" for d in decisiones)

    # Y no se pide dos veces por la misma casa.
    planner.assign_patrols(state)
    assert len(state.pending_approvals) == 1


def test_con_margen_de_sobra_la_patrulla_se_asigna_sola(state):
    casa = state.houses["h-004"]
    casa.status = HouseStatus.no_answer
    casa.minutes_to_front = 120.0

    decisiones = planner.assign_patrols(state)

    assert casa.assigned_patrol_id == "pt-1"
    assert "h-004" in state.patrols["pt-1"].assigned_house_ids
    assert state.pending_approvals == {}
    assert any("puesto 1 de la lista" in d.reason for d in decisiones)
