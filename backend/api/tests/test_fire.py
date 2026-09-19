"""El modelo de fuego. Aquí vive la tesis del proyecto, así que aquí está el test que la defiende."""

from __future__ import annotations

import pytest

from fire import (
    angular_decay_factor,
    describe_front,
    is_in_advance_cone,
    minutes_to_front,
)
from models import Fire, Person, Polygon

# Fuego rectangular con la cabeza apuntando al NORTE (rumbo 0°) a 1.000 m/h.
# Frente norte en lat 41.62, frente sur en lat 41.60.
FUEGO = Fire(
    perimeter=Polygon(
        type="Polygon",
        coordinates=[[[-6.05, 41.60], [-5.95, 41.60], [-5.95, 41.62], [-6.05, 41.62], [-6.05, 41.60]]],
    ),
    spread_rate_mh=1000.0,
    head_bearing_deg=0.0,
    cone_half_angle_deg=30.0,
)


def _persona(pid: str, lat: float, lon: float = -6.00) -> Person:
    return Person(id=pid, lat=lat, lon=lon)


# ======================================================================================
# LA TESIS
# ======================================================================================


def test_tres_kilometros_a_favor_del_viento_es_peor_que_800_metros_en_contra():
    """**El test que justifica el proyecto.**

    Un mapa de distancias diría que quien está a 800 m del fuego corre más peligro que quien está
    a 3 km. Es falso: el fuego no avanza igual en todas las direcciones. Con la cabeza apuntando al
    norte, 3 km al norte (a favor) se alcanzan mucho antes que 800 m al sur (a contraviento).

    Si este test se rompe, la cola de prioridad ordena mal y el sistema manda a la gente en el
    orden equivocado.
    """
    # 0.027° de latitud ≈ 3,0 km al NORTE del frente norte (lat 41.62) → dentro de la cabeza.
    a_favor = _persona("p-favor", 41.62 + 0.0270)
    # 0.0072° ≈ 800 m al SUR del frente sur (lat 41.60) → justo en la cola.
    en_contra = _persona("p-contra", 41.60 - 0.0072)

    min_favor = minutes_to_front(a_favor, FUEGO)
    min_contra = minutes_to_front(en_contra, FUEGO)

    assert min_favor is not None and min_contra is not None
    # A 1.000 m/h en la cabeza, 3 km son ~180 min.
    assert 165 < min_favor < 195, f"3 km a favor deberían ser ~180 min, son {min_favor}"
    # En la cola el fuego avanza al 10% (100 m/h): 800 m son ~480 min.
    assert min_contra > 400, f"800 m en contra deberían ser >400 min, son {min_contra}"
    # Y la conclusión que ordena la cola:
    assert min_favor < min_contra, (
        "alguien a 3 km a favor del viento DEBE salir antes que alguien a 800 m en contra"
    )
    # Casi cuatro veces más cerca en distancia, y sin embargo mucho menos urgente:
    assert min_contra / min_favor > 2


# ======================================================================================
# Anclas del contrato §4
# ======================================================================================


@pytest.mark.parametrize(
    "angulo, esperado",
    [(0.0, 1.00), (90.0, 0.35), (180.0, 0.10)],
)
def test_el_decaimiento_angular_pasa_por_las_tres_anclas_del_contrato(angulo, esperado):
    assert angular_decay_factor(angulo) == pytest.approx(esperado, abs=1e-9)


def test_el_decaimiento_es_monotono_decreciente():
    valores = [angular_decay_factor(a) for a in range(0, 181, 5)]
    assert all(b <= a + 1e-12 for a, b in zip(valores, valores[1:])), valores


def test_el_decaimiento_es_simetrico_y_acepta_angulos_negativos():
    assert angular_decay_factor(-45.0) == pytest.approx(angular_decay_factor(45.0))


def test_dentro_del_perimetro_son_cero_minutos():
    dentro = _persona("p-dentro", 41.61)
    assert minutes_to_front(dentro, FUEGO) == 0.0


def test_sin_posicion_o_sin_fuego_es_none_no_cero():
    """Contrato: un campo no calculado es `null`. Un 0 sería "el fuego ya está aquí"."""
    assert minutes_to_front(Person(id="p-x"), FUEGO) is None
    assert minutes_to_front(_persona("p-y", 41.70), None) is None


def test_el_cono_de_avance_mira_hacia_la_cabeza():
    delante = _persona("p-delante", 41.70)  # al norte, alineado con la cabeza
    detras = _persona("p-detras", 41.50)  # al sur, a la espalda del fuego
    assert is_in_advance_cone(delante, FUEGO) is True
    assert is_in_advance_cone(detras, FUEGO) is False


def test_describe_front_dice_cabeza_flanco_o_cola_en_espanol():
    texto = describe_front(_persona("p-d", 41.70), FUEGO)
    assert "cabeza" in texto and "km" in texto
    assert "cola" in describe_front(_persona("p-t", 41.50), FUEGO)
