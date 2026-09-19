"""El guion de la demo dispara lo que tiene que disparar, en el orden que tiene que ser.

Estos tests corren el escenario REAL (`scenarios/sierra-culebra.yaml`) con reloj instantáneo y
un cliente falso, así que verifican el guion que se va a enseñar, no un guion de juguete.
"""

from pathlib import Path

import pytest

from engine.client import CrisisApiClient, Response
from engine.clock import SimClock
from engine.scenario import Console, Scenario, ScenarioRunner

SCENARIO_FILE = Path(__file__).resolve().parents[1] / "scenarios" / "sierra-culebra.yaml"

# Área verificada en `docs/research/geografia-zona.md`: nada del guion debe caer fuera.
BBOX = (41.55, 41.88, -6.30, -5.90)  # lat_min, lat_max, lon_min, lon_max

# Lo único que el motor tiene permitido escribir.
ENDPOINTS_PERMITIDOS = {
    "/reset",
    "/events/fire",
    "/events/road-closure",
    "/events/exit-threatened",
    "/positions",  # una persona que se para es, literalmente, un reporte de posición
}


class FakeClient(CrisisApiClient):
    """Cliente que no toca la red: `outbox` hereda el registro de la clase real."""

    def _send(self, method, path, payload, channel):
        self.outbox.append({"method": method, "path": path, "channel": channel, "payload": payload})
        if channel in self.suppressed_channels:
            self.stats.suppressed += 1
            return Response(ok=False, status=None, body=None, error="canal caido")
        self.stats.ok += 1
        return Response(ok=True, status=200, body={"state_version": len(self.outbox)})


def run_scenario(tmp_path=None):
    sc = Scenario.load(SCENARIO_FILE)
    client = FakeClient("http://test.local", log=lambda _t: None)
    clock = SimClock(time_scale=0, starts_at=sc.starts_at)
    console = Console(stream=open("/dev/null", "w"))
    runner = ScenarioRunner(sc, client, clock, console=console)
    runner.run()
    return sc, client, runner


@pytest.fixture(scope="module")
def ejecucion():
    return run_scenario()


# ------------------------------------------------------------------------ carga del guion


def test_el_guion_carga_y_esta_ordenado():
    sc = Scenario.load(SCENARIO_FILE)
    assert sc.name == "sierra-culebra"
    tiempos = [e.at_min for e in sc.timeline]
    assert tiempos == sorted(tiempos)
    assert sc.end_min == 88  # 88 s reales a --time-scale 60: cabe en la demo de 3 min


def test_el_guion_rechaza_tipos_y_settings_inventados():
    with pytest.raises(ValueError, match="desconocido"):
        Scenario({"fire": {"wind": {"direction_deg": 225, "speed_kmh": 30}, "center": {"lat": 41.8, "lon": -6.0}},
                  "timeline": [{"at_min": 1, "type": "meteorito"}]})
    with pytest.raises(ValueError, match="settings desconocidos"):
        Scenario({"fire": {"wind": {"direction_deg": 225, "speed_kmh": 30}, "center": {"lat": 41.8, "lon": -6.0}},
                  "settings": {"velocidad_maxima": 3}})


# --------------------------------------------------------------- orden de los cinco hitos


def test_los_cinco_hitos_salen_en_el_orden_pedido(ejecucion):
    sc, _client, _runner = ejecucion
    orden = [e.type for e in sc.timeline]
    hitos = [t for t in orden if t in
             ("fire_declared", "wind_shift", "road_closed", "exit_threatened",
              "person_wrong_way", "person_stalled")]
    assert hitos[0] == "fire_declared"
    assert hitos.index("wind_shift") < hitos.index("road_closed")
    assert hitos.index("road_closed") < hitos.index("exit_threatened")
    # alguien que se atasca o se desvía va DESPUÉS de que el escenario se haya torcido
    assert hitos.index("exit_threatened") < min(
        hitos.index("person_wrong_way"), hitos.index("person_stalled")
    )


def test_las_escrituras_llegan_en_el_orden_esperado(ejecucion):
    _sc, client, _runner = ejecucion
    paths = [o["path"] for o in client.outbox]
    assert paths[0] == "/reset"
    # secuencia de hitos, en orden, ignorando los pushes continuos de fuego
    def first(path):
        return paths.index(path)

    assert first("/events/fire") < first("/events/road-closure")
    assert first("/events/road-closure") < first("/events/exit-threatened")
    assert first("/events/exit-threatened") < first("/positions")


def test_el_giro_de_viento_va_antes_del_corte_de_carretera_en_el_payload(ejecucion):
    _sc, client, _runner = ejecucion
    fires = [o for o in client.outbox if o["path"] == "/events/fire"]
    cabezas = [f["payload"]["head_bearing_deg"] for f in fires]
    assert cabezas[0] == pytest.approx(45.0)  # antes del giro: al nordeste
    assert cabezas[-1] == pytest.approx(135.0)  # después: al sureste, hacia los pueblos
    # el corte de carretera ocurre cuando la cabeza ya ha girado
    idx_road = next(i for i, o in enumerate(client.outbox) if o["path"] == "/events/road-closure")
    fires_antes = [o for o in client.outbox[:idx_road] if o["path"] == "/events/fire"]
    assert fires_antes[-1]["payload"]["head_bearing_deg"] == pytest.approx(135.0)


# --------------------------------------------------------------------- límites de contrato


def test_solo_escribe_en_los_endpoints_permitidos(ejecucion):
    _sc, client, _runner = ejecucion
    usados = {o["path"] for o in client.outbox if o["method"] == "POST"}
    assert usados <= ENDPOINTS_PERMITIDOS, usados - ENDPOINTS_PERMITIDOS


def test_la_carretera_es_la_real_y_la_salida_existe(ejecucion):
    _sc, client, _runner = ejecucion
    road = next(o for o in client.outbox if o["path"] == "/events/road-closure")
    assert road["payload"]["road_name"] == "ZA-P-2434"
    assert set(road["payload"]) <= {"road_name", "reason", "since", "source", "geometry"}
    exit_ev = next(o for o in client.outbox if o["path"] == "/events/exit-threatened")
    assert exit_ev["payload"]["exit_id"] == "x-a"  # Tábara
    assert set(exit_ev["payload"]) == {"exit_id", "reason"}


def test_ninguna_coordenada_se_sale_de_la_zona_investigada(ejecucion):
    _sc, client, _runner = ejecucion
    lat_min, lat_max, lon_min, lon_max = BBOX
    for o in client.outbox:
        p = o["payload"] or {}
        if o["path"] == "/positions":
            assert lat_min <= p["lat"] <= lat_max, p
            assert lon_min <= p["lon"] <= lon_max, p
        if o["path"] == "/events/fire":
            for lon, lat in p["perimeter"]["coordinates"][0]:
                assert lat_min - 0.2 <= lat <= lat_max + 0.2, (lat, lon)
                assert lon_min - 0.2 <= lon <= lon_max + 0.2, (lat, lon)


def test_la_caida_de_integracion_silencia_posiciones_y_se_recupera(ejecucion):
    _sc, client, _runner = ejecucion
    assert client.suppressed_channels == set()  # la caída expira dentro del guion
    assert client.stats.suppressed == 0  # y no hay nadie moviéndose mientras está caída


# ----------------------------------------------------------------- reproducible y reanudable


def test_dos_ejecuciones_dan_la_misma_secuencia():
    _, c1, _ = run_scenario()
    _, c2, _ = run_scenario()
    assert [o["path"] for o in c1.outbox] == [o["path"] for o in c2.outbox]


class RelojFalso:
    """Tiempo real falso: `sleep` adelanta el cronómetro en vez de esperar de verdad."""

    def __init__(self) -> None:
        self.t = 1000.0

    def monotonic(self) -> float:
        return self.t

    def sleep(self, s: float) -> None:
        self.t += max(float(s), 1e-6)


def test_con_reloj_real_los_eventos_se_reparten_en_el_tiempo():
    """Regresión: con `--time-scale 60` el bucle dormía de golpe hasta el final.

    El bug solo aparecía con reloj que corre (con `time_scale=0` el reloj está congelado y
    todos los vencimientos caían justo en el borde). Efecto en la demo: 88 segundos de pantalla
    quieta y luego los ocho eventos a la vez. Aquí el reloj es falso, así que el test es
    instantáneo pero ejercita el mismo camino.
    """
    reloj = RelojFalso()
    sc = Scenario.load(SCENARIO_FILE)
    client = FakeClient("http://test.local", log=lambda _t: None)
    clock = SimClock(
        time_scale=60,
        starts_at=sc.starts_at,
        monotonic=reloj.monotonic,
        sleeper=reloj.sleep,
    )
    momentos: list[tuple[str, float]] = []
    original = client._send

    def espia(method, path, payload, channel):
        momentos.append((path, clock.sim_minutes))
        return original(method, path, payload, channel)

    client._send = espia  # type: ignore[method-assign]
    runner = ScenarioRunner(sc, client, clock, console=Console(stream=open("/dev/null", "w")))
    runner.run()

    fires = [m for p, m in momentos if p == "/events/fire"]
    assert len(fires) > 60  # un push por minuto simulado, no dos en total
    assert max(fires) == pytest.approx(88, abs=0.5)
    road = next(m for p, m in momentos if p == "/events/road-closure")
    exit_ev = next(m for p, m in momentos if p == "/events/exit-threatened")
    pos = next(m for p, m in momentos if p == "/positions")
    assert road == pytest.approx(42, abs=1.0)
    assert exit_ev == pytest.approx(58, abs=1.0)
    assert pos == pytest.approx(66, abs=1.0)
    assert road < exit_ev < pos


def test_from_min_se_salta_lo_anterior_pero_lo_aplica():
    """`--from-min 42` sirve para ensayar: el mundo llega ya girado y con la vía cortada."""
    sc = Scenario.load(SCENARIO_FILE)
    client = FakeClient("http://test.local", log=lambda _t: None)
    clock = SimClock(time_scale=0, starts_at=sc.starts_at)
    runner = ScenarioRunner(sc, client, clock, console=Console(stream=open("/dev/null", "w")))
    runner.run(from_min=44.0)
    paths = [o["path"] for o in client.outbox]
    assert "/events/road-closure" in paths  # se aplicó en el catch-up
    assert runner.field.head_bearing_deg == pytest.approx(135.0)
