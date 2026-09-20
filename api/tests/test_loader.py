"""El roster: nombres y móviles reales que entran desde fuera del repo, nunca desde el fichero.

Los teléfonos de aquí son del rango reservado `+3460099xxxx` (contrato §1) y los nombres,
inventados. Un fixture también es un fichero versionado de un repo público.
"""

from __future__ import annotations

import base64

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


def _roster_b64(contenido: str, monkeypatch, *, crudo: str | None = None):
    """Deja el roster en `ROSTER_B64`, como en Railway. `crudo` pega un valor tal cual."""
    valor = crudo if crudo is not None else base64.b64encode(contenido.encode()).decode()
    monkeypatch.setattr(loader.settings, "roster_b64", valor)
    return valor


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


# --------------------------------------------------------------- el roster en Railway (b64)
#
# En el contenedor no hay disco donde dejar el CSV, así que viaja entero en una variable. Lo
# que se prueba aquí no es "base64 funciona": es que el ensayo del día del evento no se queda
# sin nombres por un valor mal pegado, y que la API arranca pase lo que pase.


def test_el_roster_entra_desde_la_variable_cuando_no_hay_fichero(monkeypatch):
    """El caso de Railway: sin fichero en disco, el CSV llega en `ROSTER_B64`."""
    _roster_b64("person_id,name,phone\np-001,Marta Ruiz,+34600995001\n", monkeypatch)
    load_scenario(global_state, "test-mini")

    persona = global_state.people["p-001"]
    assert persona.name == "Marta Ruiz"
    assert persona.phone == "+34600995001"
    # Las mismas reglas que con fichero: la casa va con la persona.
    assert global_state.houses[persona.house_id].phone == "+34600995001"


def test_la_variable_respeta_las_reglas_del_fichero(monkeypatch):
    """Mismo parseo para las dos fuentes: alias en español, fila en blanco y fila sin nombre."""
    load_scenario(global_state, "test-mini")
    generico = global_state.people["p-002"].name

    _roster_b64(
        "id,nombre,teléfono\np-001,Luis Vega,+34 600 99 50 04\np-002,,+34600995005\np-003,,\n",
        monkeypatch,
    )
    load_scenario(global_state, "test-mini")

    assert global_state.people["p-001"].name == "Luis Vega"
    assert global_state.people["p-001"].phone == "+34600995004"  # espacios fuera: E.164
    assert global_state.people["p-002"].name == generico
    assert global_state.people["p-002"].phone == "+34600995005"
    assert global_state.people["p-003"].phone.startswith("+3460099")


def test_el_fichero_gana_a_la_variable_y_lo_dice(tmp_path, monkeypatch, caplog):
    """Ensayando en local con el CSV delante, una variable vieja del `.env` no puede pisarlo."""
    _roster(tmp_path, "person_id,name,phone\np-001,La Del Fichero,+34600995006\n", monkeypatch)
    _roster_b64("person_id,name,phone\np-001,La De La Variable,+34600995007\n", monkeypatch)
    load_scenario(global_state, "test-mini")

    assert global_state.people["p-001"].name == "La Del Fichero"
    assert global_state.people["p-001"].phone == "+34600995006"
    # Una fuente ignorada en silencio cuesta media hora de depuración a las cuatro de la mañana.
    assert "ROSTER_B64" in caplog.text


def test_phone_overrides_tambien_pisa_a_la_variable(monkeypatch):
    """La precedencia entera, de menos a más: ROSTER_B64 < fichero < PHONE_OVERRIDES."""
    _roster_b64("person_id,name,phone\np-001,Ana Sol,+34600999000\n", monkeypatch)
    monkeypatch.setattr(loader.settings, "phone_overrides", {"p-001": "+34600995008"})
    load_scenario(global_state, "test-mini")

    assert global_state.people["p-001"].name == "Ana Sol"  # el nombre solo lo pone el roster
    assert global_state.people["p-001"].phone == "+34600995008"


def test_un_base64_roto_no_tumba_el_arranque(monkeypatch, caplog):
    """Lo que de verdad importa: con el jurado delante, la API arranca igual.

    Se queda sin los nombres reales —que es el daño aceptable— y lo grita con instrucciones.
    """
    _roster_b64("", monkeypatch, crudo="esto-no-es-base64-ni-de-lejos!!")
    load_scenario(global_state, "test-mini")

    assert global_state.people["p-001"].phone.startswith("+3460099"), "sigue el escenario"
    assert "ROSTER_B64" in caplog.text
    assert "roster_secret.py" in caplog.text, "el error tiene que decir cómo arreglarlo"


def test_un_base64_que_no_es_texto_no_tumba_el_arranque(monkeypatch, caplog):
    """Base64 válido de algo que no es un CSV en UTF-8: tampoco puede costar el arranque."""
    _roster_b64("", monkeypatch, crudo=base64.b64encode(b"\xff\xfe\x00\x01").decode())
    load_scenario(global_state, "test-mini")

    assert global_state.people["p-001"].phone.startswith("+3460099")
    assert "UTF-8" in caplog.text


def test_el_base64_con_saltos_de_linea_y_espacios_entra_igual(monkeypatch):
    """Pegar un valor largo en un panel web mete saltos de línea: no puede costar el ensayo."""
    limpio = base64.b64encode(
        b"person_id,name,phone\np-001,Marta Ruiz,+34600995009\n"
    ).decode()
    troceado = "  " + "\n".join(limpio[i : i + 16] for i in range(0, len(limpio), 16)) + " \n"
    _roster_b64("", monkeypatch, crudo=troceado)
    load_scenario(global_state, "test-mini")

    assert global_state.people["p-001"].name == "Marta Ruiz"
    assert global_state.people["p-001"].phone == "+34600995009"


def test_el_base64_sin_el_relleno_final_entra_y_avisa(monkeypatch, caplog):
    """Hay campos que se comen los '=' del final. Se rehacen, pero se avisa por si vino cortado."""
    valor = base64.b64encode(b"person_id,name,phone\np-001,Luis Vega,+34600995010\n").decode()
    assert valor.endswith("="), "este caso necesita un valor con relleno"
    _roster_b64("", monkeypatch, crudo=valor.rstrip("="))
    load_scenario(global_state, "test-mini")

    assert global_state.people["p-001"].name == "Luis Vega"
    assert "relleno" in caplog.text


def test_el_log_del_roster_no_filtra_ni_nombres_ni_telefonos(monkeypatch, caplog):
    """El log de arranque de Railway lo lee cualquiera del equipo: ahí no va ningún dato real."""
    _roster_b64(
        "person_id,name,phone\np-001,Marta Ruiz,+34600995011\np-002,Luis Vega,+34600995012\n",
        monkeypatch,
    )
    load_scenario(global_state, "test-mini")

    assert "2 persona(s)" in caplog.text, "sí dice cuántas y de dónde"
    assert "ROSTER_B64" in caplog.text
    for secreto in ("Marta", "Ruiz", "Luis", "Vega", "+34600995011", "600995012"):
        assert secreto not in caplog.text, f"el log filtra {secreto!r}"


def test_un_telefono_en_la_columna_del_id_no_acaba_en_el_log(monkeypatch, caplog):
    """Una columna desplazada mete móviles donde van los ids, y de ahí irían derechos al log."""
    _roster_b64("person_id,name,phone\n+34600995013,Marta Ruiz,\n", monkeypatch)
    load_scenario(global_state, "test-mini")

    assert "id(s) que no existen" in caplog.text
    assert "+34600995013" not in caplog.text
    assert "··· 013" in caplog.text


def test_el_resumen_de_arranque_no_publica_el_secreto(monkeypatch):
    """`settings.summary()` se imprime entero en el log: de ROSTER_B64 solo sale su tamaño."""
    valor = _roster_b64("person_id,name,phone\np-001,Marta Ruiz,+34600995014\n", monkeypatch)
    monkeypatch.setattr(settings_mod.settings, "roster_b64", valor)

    resumen = settings_mod.settings.summary()

    assert str(len(valor)) in resumen["roster_b64"]
    assert valor not in str(resumen)
    assert "Marta" not in str(resumen)
