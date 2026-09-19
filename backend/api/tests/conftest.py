"""Fixtures compartidas. El `backend/api/conftest.py` de arriba ya fijó el entorno de test."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

import planner
from loader import load_scenario
from main import app
from state import state as global_state


@pytest.fixture()
def state():
    """Estado recargado desde `tests/fixtures/test-mini.json`, sin pasada de planner.

    Sirve para probar piezas sueltas (prioridad, fuego, convoyes) sin que el planner haya tocado
    nada todavía.
    """
    load_scenario(global_state, "test-mini")
    return global_state


@pytest.fixture()
def planned_state(state):
    """Igual, pero con una pasada completa del planner (rutas y salidas ya asignadas)."""
    planner.run_planner(state, full=True)
    return state


@pytest.fixture()
def client():
    """Cliente HTTP contra la app real (el lifespan carga el escenario y corre el planner)."""
    with TestClient(app) as c:
        yield c
