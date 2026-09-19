"""El fuego crece hacia donde debe, y crece sin romperse.

El error que estos tests existen para impedir es uno solo: confundir `wind.direction_deg`
(de dónde VIENE el viento) con `head_bearing_deg` (hacia dónde VA la cabeza). Si se invierten,
el fuego de la demo avanza justo al contrario de lo que cuenta el guion y nadie lo nota hasta
que el jurado mira el mapa.
"""

import math
from pathlib import Path

import pytest

from engine import geo
from engine.fire_model import (
    Wind,
    cosine_decay,
    head_bearing_from_wind,
)
from engine.scenario import Scenario

CENTER = (41.86, -6.16)
SCENARIO_FILE = Path(__file__).resolve().parents[1] / "scenarios" / "sierra-culebra.yaml"


def contract_decay(theta_deg: float) -> float:
    """La fórmula literal del contrato (`docs/contrato-de-datos.md` §4)."""
    t = math.radians(theta_deg)
    return 0.45 + 0.45 * math.cos(t) + 0.10 * math.cos(2 * t)


# --------------------------------------------------------------- viento -> rumbo de cabeza


@pytest.mark.parametrize(
    "wind_from, expected_head",
    [
        (225.0, 45.0),  # viento del SO -> cabeza al NE (el caso del guion)
        (315.0, 135.0),  # tras el giro: viento del NO -> cabeza al SE
        (180.0, 0.0),  # viento del sur -> cabeza al norte
        (0.0, 180.0),
        (90.0, 270.0),
    ],
)
def test_head_bearing_es_el_opuesto_del_viento(wind_from, expected_head):
    head = head_bearing_from_wind(Wind(direction_deg=wind_from, speed_kmh=30))
    assert head == pytest.approx(expected_head)
    # y nunca es el propio rumbo del viento: eso es exactamente el bug que invierte la demo
    assert geo.angle_diff_deg(head, wind_from) == pytest.approx(180.0)


# ------------------------------------------------------------------- la curva del contrato


@pytest.mark.parametrize("theta", [0, 15, 30, 45, 60, 90, 120, 150, 180])
def test_cosine_decay_es_la_curva_del_contrato(theta):
    """`cosine_decay` usa la forma de Chebyshev (0.35 + 0.45c + 0.20c²).

    Es algebraicamente la misma curva que el contrato, porque cos(2θ) = 2c² − 1:
    0.45 + 0.45c + 0.10(2c² − 1) = 0.35 + 0.45c + 0.20c². Este test lo fija por escrito para
    que nadie "corrija" una de las dos formas creyendo que difieren.
    """
    assert cosine_decay(theta) == pytest.approx(contract_decay(theta), abs=1e-12)


def test_cosine_decay_pasa_por_los_tres_puntos_de_anclaje():
    assert cosine_decay(0) == pytest.approx(1.00)  # cabeza
    assert cosine_decay(90) == pytest.approx(0.35)  # flanco
    assert cosine_decay(180) == pytest.approx(0.10)  # cola
    # monótona decreciente de cabeza a cola
    valores = [cosine_decay(t) for t in range(0, 181, 5)]
    assert all(a >= b - 1e-12 for a, b in zip(valores, valores[1:]))
    assert min(valores) > 0  # estrictamente positiva: ningún rayo se queda congelado


# ------------------------------------------------------------------ crecimiento dirigido


def _front(head_bearing_deg, wind_from=225.0, rate=3000.0):
    from engine.fire_model import FireFront

    return FireFront.circular(
        CENTER[0],
        CENTER[1],
        1000.0,
        Wind(direction_deg=wind_from, speed_kmh=40),
        rate,
        head_bearing_deg,
    )


def test_crece_mas_hacia_head_bearing_que_hacia_cualquier_otro_rumbo():
    head = 45.0
    f = _front(head)
    f.advance(60.0)
    r_head = f.radius_at_bearing(head)
    for bearing in range(0, 360, 10):
        if geo.angle_diff_deg(bearing, head) < 1.0:
            continue
        assert f.radius_at_bearing(bearing) < r_head


def test_no_crece_hacia_de_donde_viene_el_viento():
    """El radio máximo cae a favor del viento, no a contraviento.

    Si alguien usara `wind.direction_deg` como rumbo de cabeza, este test falla.
    """
    wind_from = 225.0
    f = _front(head_bearing_from_wind(Wind(direction_deg=wind_from, speed_kmh=40)), wind_from)
    f.advance(90.0)
    r_a_favor = f.radius_at_bearing(45.0)  # downwind
    r_contra = f.radius_at_bearing(wind_from)  # upwind (la cola)
    assert r_a_favor > r_contra
    # la cola avanza ~10% de la cabeza; con el radio inicial de 1000 m la razón queda muy por
    # debajo de 1, sin fijar un número frágil
    assert (r_contra - 1000.0) < 0.2 * (r_a_favor - 1000.0)


def test_el_giro_de_viento_del_guion_invierte_el_lado_que_crece():
    """225° -> 315° tiene que mover el crecimiento del NE al SE. Es la demo entera."""
    f = _front(head_bearing_from_wind(Wind(direction_deg=225.0, speed_kmh=40)), 225.0)
    f.advance(30.0)
    ne_antes = f.radius_at_bearing(45.0)
    se_antes = f.radius_at_bearing(135.0)
    assert ne_antes > se_antes

    nuevo = Wind(direction_deg=315.0, speed_kmh=45)
    f.set_wind(nuevo, head_bearing_from_wind(nuevo))
    assert f.head_bearing_deg == pytest.approx(135.0)
    f.advance(60.0)
    # el lado SE gana más metros que el NE en el tramo posterior al giro
    assert (f.radius_at_bearing(135.0) - se_antes) > (f.radius_at_bearing(45.0) - ne_antes)


# ------------------------------------------------------------------ estabilidad geométrica


def test_el_perimetro_sigue_siendo_valido_tras_un_avance_largo():
    f = _front(135.0)
    for _ in range(40):
        f.advance(5.0)
        ok, motivo = geo.polygon_is_valid(f.perimeter_geojson())
        assert ok, motivo


def test_el_area_crece_de_forma_monotona():
    f = _front(135.0)
    areas = []
    for _ in range(30):
        f.advance(3.0)
        areas.append(f.area_ha())
    assert all(b > a for a, b in zip(areas, areas[1:]))


def test_el_payload_de_fuego_trae_los_campos_del_contrato():
    sc = Scenario.load(SCENARIO_FILE)
    payload = sc.build_field().to_event_payload("2026-09-19T17:20:00Z")
    for campo in ("perimeter", "wind", "spread_rate_mh", "head_bearing_deg", "t"):
        assert campo in payload, campo
    assert payload["perimeter"]["type"] == "Polygon"
    # GeoJSON va en orden [lon, lat] (contrato §1): la longitud de la zona es negativa
    lon, lat = payload["perimeter"]["coordinates"][0][0]
    assert lon < 0 and 41 < lat < 42
    assert set(payload["wind"]) <= {"direction_deg", "speed_kmh", "gusts_kmh"}


def test_el_guion_deriva_la_cabeza_del_viento_y_no_al_reves():
    sc = Scenario.load(SCENARIO_FILE)
    assert sc.wind.direction_deg == pytest.approx(225.0)
    assert sc.head_bearing_deg is None  # no está fijado a mano en el YAML
    assert sc.build_field().primary.head_bearing_deg == pytest.approx(45.0)
