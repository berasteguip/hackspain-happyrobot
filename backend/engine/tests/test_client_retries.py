"""Sin la API delante, el motor reintenta y avisa; no revienta.

En una demo en vivo el orden de arranque se equivoca siempre (motor antes que API). El requisito
no es "que funcione con la API": es "que aguante sin ella".
"""

from pathlib import Path

import pytest
import requests

from engine.client import DEGRADED_AFTER_FAILURES, CrisisApiClient
from engine.clock import SimClock
from engine.scenario import Console, Scenario, ScenarioRunner

SCENARIO_FILE = Path(__file__).resolve().parents[1] / "scenarios" / "sierra-culebra.yaml"


class SessionQueRompe:
    """Sesión que siempre falla, como una API que no está levantada."""

    def __init__(self):
        self.calls = 0

    def post(self, *_a, **_kw):
        self.calls += 1
        raise requests.ConnectionError("Connection refused")

    def get(self, *_a, **_kw):
        return self.post()


class SessionQueRevive:
    """Falla las `fail_first` primeras veces y luego responde 200."""

    def __init__(self, fail_first: int):
        self.left = fail_first
        self.calls = 0

    def post(self, *_a, **_kw):
        self.calls += 1
        if self.left > 0:
            self.left -= 1
            raise requests.ConnectionError("Connection refused")
        return _Resp200()

    def get(self, *_a, **_kw):
        return self.post()


class _Resp200:
    status_code = 200

    def json(self):
        return {"ok": True, "state_version": 1}


def _client(session, **kw):
    dormido: list[float] = []
    c = CrisisApiClient(
        "http://127.0.0.1:59999",
        log=lambda _t: None,
        sleeper=dormido.append,  # no dormimos de verdad en los tests
        session=session,
        **kw,
    )
    c.esperas = dormido  # type: ignore[attr-defined]
    return c


# ------------------------------------------------------------------------------ reintentos


def test_reintenta_hasta_max_attempts_y_no_lanza():
    s = SessionQueRompe()
    c = _client(s, max_attempts=3)
    r = c.post("/events/fire", {"a": 1}, channel="fire")
    assert r.ok is False
    assert r.attempts == 3
    assert s.calls == 3  # tres intentos de verdad, no uno
    assert c.stats.retries == 2  # dos esperas entre intentos
    assert c.esperas == [pytest.approx(0.4), pytest.approx(0.8)]  # backoff exponencial


def test_el_error_se_devuelve_en_vez_de_propagarse():
    c = _client(SessionQueRompe(), max_attempts=2)
    r = c.post("/reset", {"scenario": "x"}, channel="fire")
    assert r.ok is False and r.status is None
    assert "ConnectionError" in (r.error or "")
    assert c.stats.failed == 1


def test_entra_en_modo_degradado_y_sale_al_recuperarse():
    s = SessionQueRevive(fail_first=99)
    c = _client(s, max_attempts=1)
    for _ in range(DEGRADED_AFTER_FAILURES):
        c.post("/events/fire", {}, channel="fire")
    assert c.degraded is True  # deja de insistir para no frenar el reloj

    s.left = 0  # la API arranca ahora (el caso real de la demo)
    r = c.post("/events/fire", {}, channel="fire")
    assert r.ok is True
    assert c.degraded is False
    assert c.consecutive_failures == 0


def test_contra_un_puerto_cerrado_de_verdad():
    """Sin mocks: puerto 1 de localhost. Reintenta, falla y devuelve, no explota."""
    c = CrisisApiClient("http://127.0.0.1:1", log=lambda _t: None, sleeper=lambda _s: None,
                        max_attempts=2, timeout_s=0.5)
    r = c.post("/events/fire", {"perimeter": None}, channel="fire")
    assert r.ok is False
    assert r.attempts == 2
    assert c.stats.failed == 1


# --------------------------------------------------- el escenario entero sin API delante


def test_el_escenario_completo_termina_con_la_api_caida():
    sc = Scenario.load(SCENARIO_FILE)
    client = CrisisApiClient(
        "http://127.0.0.1:1",
        log=lambda _t: None,
        sleeper=lambda _s: None,
        max_attempts=2,
        timeout_s=0.3,
        session=SessionQueRompe(),
    )
    clock = SimClock(time_scale=0, starts_at=sc.starts_at)
    runner = ScenarioRunner(sc, client, clock, console=Console(stream=open("/dev/null", "w")))
    runner.run()  # si esto lanza, la demo se cae por no tener la API arriba
    assert client.stats.ok == 0
    assert client.stats.failed > 0
    assert client.degraded is True
    assert len(client.outbox) > 20  # el guion avanzó completo a pesar de todo
    assert runner.field.head_bearing_deg == pytest.approx(135.0)  # el giro ocurrió igual
