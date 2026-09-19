"""La fórmula de prioridad del contrato §4, factor a factor."""

from __future__ import annotations

import pytest

from models import Mobility, Person, PersonStatus, PositionSource
from priority import (
    WEIGHTS,
    explain_score,
    house_margin_min,
    household_factor,
    mobility_factor,
    priority_score,
    uncertainty_factor,
    urgency_factor,
)
from models import House


class _SinFuego:
    """Estado mínimo: sin fuego no hay deriva de trayectoria, así que el 0.10 queda a cero y los
    demás factores se pueden comprobar aislados."""

    fire = None


ESTADO = _SinFuego()


def test_los_pesos_son_los_del_contrato():
    assert WEIGHTS == {
        "urgency": 0.45,
        "mobility": 0.20,
        "uncertainty": 0.15,
        "household_size": 0.10,
        "trajectory_drift": 0.10,
    }
    assert sum(WEIGHTS.values()) == pytest.approx(1.0)


def test_la_urgencia_es_uno_partido_minutos_con_suelo_en_uno():
    assert urgency_factor(10) == pytest.approx(0.1)
    assert urgency_factor(1) == pytest.approx(1.0)
    assert urgency_factor(0.2) == pytest.approx(1.0)  # no se pasa de 1
    assert urgency_factor(None) == 0.0


def test_la_movilidad_penaliza_segun_la_tabla():
    assert mobility_factor(Mobility.immobile) == 1.0
    assert mobility_factor(Mobility.reduced) == 0.6
    assert mobility_factor(Mobility.walking) == 0.3
    assert mobility_factor(Mobility.car) == 0.0


def test_el_nucleo_familiar_satura_en_seis():
    assert household_factor(3) == pytest.approx(0.5)
    assert household_factor(6) == pytest.approx(1.0)
    assert household_factor(12) == pytest.approx(1.0)


# ======================================================================================
# El factor que responde a "¿decide bien sin datos completos?"
# ======================================================================================


def test_la_incertidumbre_SUBE_la_prioridad():
    """Dos personas idénticas; la única diferencia es que de una no se sabe nada.

    El contrato lo pide explícitamente: lo desconocido no se aparca al final de la cola, se sube.
    Si esto se invirtiera, el sistema atendería primero a quien ya está localizado —justo al
    contrario de lo que hace un mando de emergencias.
    """
    conocida = Person(
        id="p-conocida",
        lat=41.7,
        lon=-6.0,
        position_source=PositionSource.gps,
        status=PersonStatus.moving,
        minutes_to_front=30.0,
        household_size=2,
        mobility=Mobility.car,
    )
    desconocida = conocida.model_copy(update={"id": "p-desconocida", "status": PersonStatus.unknown})

    score_conocida, desglose_conocida = priority_score(conocida, ESTADO)
    score_desconocida, desglose_desconocida = priority_score(desconocida, ESTADO)

    assert uncertainty_factor(conocida) == 0.0
    assert uncertainty_factor(desconocida) == 1.0
    assert score_desconocida > score_conocida
    # y la diferencia es exactamente el peso del factor (0.15)
    assert score_desconocida - score_conocida == pytest.approx(WEIGHTS["uncertainty"], abs=1e-4)
    assert desglose_desconocida["uncertainty"] == pytest.approx(0.15)
    assert desglose_conocida["uncertainty"] == 0.0


def test_una_posicion_dicha_por_telefono_tambien_cuenta_como_incierta():
    p = Person(id="p-d", lat=41.7, lon=-6.0, position_source=PositionSource.declared,
               status=PersonStatus.contacted)
    assert uncertainty_factor(p) == 1.0


def test_sin_posicion_ninguna_es_incierta_aunque_el_estado_sea_bueno():
    p = Person(id="p-s", status=PersonStatus.moving)
    assert uncertainty_factor(p) == 1.0


def test_el_desglose_suma_el_score_y_explica_en_espanol():
    p = Person(
        id="p-1",
        lat=41.7,
        lon=-6.0,
        position_source=PositionSource.gps,
        status=PersonStatus.moving,
        minutes_to_front=5.0,
        household_size=4,
        mobility=Mobility.reduced,
    )
    score, desglose = priority_score(p, ESTADO)
    assert score == pytest.approx(min(1.0, sum(desglose.values())), abs=1e-4)
    texto = explain_score(p, desglose)
    assert "min hasta el frente" in texto
    assert any(palabra in texto for palabra in ("movilidad", "incertidumbre", "personas en casa"))


def test_el_score_nunca_pasa_de_uno():
    p = Person(
        id="p-peor",
        status=PersonStatus.unknown,
        minutes_to_front=0.5,
        household_size=9,
        mobility=Mobility.immobile,
    )
    score, _ = priority_score(p, ESTADO)
    assert score <= 1.0


# ======================================================================================
# Casas: la resta minutes_to_front - patrol_eta_min
# ======================================================================================


def test_el_margen_de_la_casa_es_la_resta_del_contrato():
    casa = House(id="h-1", minutes_to_front=30.0, patrol_eta_min=12.0)
    assert house_margin_min(casa) == pytest.approx(18.0)
    imposible = House(id="h-2", minutes_to_front=8.0, patrol_eta_min=20.0)
    assert house_margin_min(imposible) == pytest.approx(-12.0)
    assert house_margin_min(House(id="h-3")) is None
