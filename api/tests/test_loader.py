"""El roster: nombres y móviles reales que entran desde fuera del repo, nunca desde el fichero."""

from __future__ import annotations

import loader
import settings as settings_mod
from loader import load_scenario
from state import state as global_state


def _roster(tmp_path, contenido: str, monkeypatch):
    csv = tmp_path / "roster.csv"
    csv.write_text(contenido, encoding="utf-8")
    monkeypatch.setattr(settings_mod.settings, "roster_csv", csv)
    monkeypatch.setattr(loader.settings, "roster_csv", csv)
    return csv


def test_sin_fichero_se_queda_el_escenario(state):
    """El caso por defecto y el único que vale para la demo: nadie real cargado."""
    assert state.people["p-001"].phone.startswith("+3460099")


def test_el_roster_pone_nombre_y_telefono_y_la_casa_hereda(tmp_path, monkeypatch):
    _roster(
        tmp_path,
        "person_id,name,phone\np-001,Marta Ruiz,+34 600 99 50 01\n",
        monkeypatch,
    )
    load_scenario(global_state, "test-mini")

    persona = global_state.people["p-001"]
    assert persona.name == "Marta Ruiz"
    assert persona.phone == "+34600995001"  # espacios fuera: E.164
    # La casa tiene que ir con la persona, o una llamada entrante no casaría con la ficha.
    assert global_state.houses[persona.house_id].phone == "+34600995001"


def test_una_fila_sin_nombre_deja_el_generico(tmp_path, monkeypatch):
    """Los contactos del grupo que solo tienen número: hay teléfono pero no nombre."""
    load_scenario(global_state, "test-mini")
    generico = global_state.people["p-001"].name

    _roster(tmp_path, "person_id,name,phone\np-001,,+34600995002\n", monkeypatch)
    load_scenario(global_state, "test-mini")

    assert global_state.people["p-001"].name == generico
    assert global_state.people["p-001"].phone == "+34600995002"


def test_la_cabecera_en_espanol_tambien_vale(tmp_path, monkeypatch):
    _roster(tmp_path, "id,nombre,teléfono\np-002,Luis Vega,+34600995004\n", monkeypatch)
    load_scenario(global_state, "test-mini")

    assert global_state.people["p-002"].name == "Luis Vega"
    assert global_state.people["p-002"].phone == "+34600995004"


def test_la_plantilla_en_blanco_no_cuenta_como_gente_cargada(tmp_path, monkeypatch, caplog):
    """`roster_template.py` deja las dos columnas vacías: eso es sitio reservado, no un dato."""
    _roster(tmp_path, "person_id,name,phone\np-001,,\np-002,,\n", monkeypatch)
    load_scenario(global_state, "test-mini")

    assert "ROSTER:" not in caplog.text
    assert global_state.people["p-001"].phone.startswith("+3460099")


def test_un_id_que_no_existe_no_tumba_la_carga(tmp_path, monkeypatch, caplog):
    """Un roster desfasado (el escenario se regeneró con menos gente) no puede impedir arrancar."""
    _roster(
        tmp_path,
        "person_id,name,phone\np-999,Fantasma,+34600995005\np-001,Ana Sol,+34600999000\n",
        monkeypatch,
    )
    load_scenario(global_state, "test-mini")

    assert global_state.people["p-001"].name == "Ana Sol"
    assert "p-999" in caplog.text


def test_phone_overrides_pisa_al_roster(tmp_path, monkeypatch):
    """El .env es lo que se toca en el último minuto: tiene que ganar al fichero."""
    _roster(tmp_path, "person_id,name,phone\np-001,Ana Sol,+34600999000\n", monkeypatch)
    monkeypatch.setattr(loader.settings, "phone_overrides", {"p-001": "+34600995003"})
    load_scenario(global_state, "test-mini")

    assert global_state.people["p-001"].name == "Ana Sol"
    assert global_state.people["p-001"].phone == "+34600995003"
