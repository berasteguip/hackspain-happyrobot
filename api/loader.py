"""Carga del escenario desde `data/scenarios/<nombre>.json`.

El fichero lo genera otro componente (`data/generate.py`), así que este módulo es **tolerante**:
si no existe, si le sobran campos o si trae un valor de enum que no conocemos, la API arranca de
todas formas con un escenario mínimo embebido y lo grita en el log. Una demo no se cae porque
falte un fichero.
"""

from __future__ import annotations

import base64
import csv
import io
import json
import logging
from pathlib import Path
from typing import Any

from models import (
    Fire,
    House,
    Patrol,
    Person,
    SafeZone,
    Sector,
    utcnow_iso,
)
from settings import settings

log = logging.getLogger("crisis.loader")

# Cada entrada: clave del JSON → (modelo, nombre del diccionario en el estado)
ENTITY_MAP: dict[str, tuple[type, str]] = {
    "houses": (House, "houses"),
    "people": (Person, "people"),
    "safe_zones": (SafeZone, "safe_zones"),
    "sectors": (Sector, "sectors"),
    "patrols": (Patrol, "patrols"),
}


def scenario_path(name: str) -> Path:
    return settings.scenarios_dir / f"{name}.json"


def load_scenario(state, name: str | None = None) -> dict:
    """Vacía el estado y lo rellena con el escenario. Devuelve un resumen para el log/`/reset`."""
    name = name or settings.scenario
    path = scenario_path(name)
    data: dict[str, Any] | None = None
    origen = str(path)

    if path.is_file():
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            log.error("escenario %s ilegible (%s); se usa el mínimo embebido", path, exc)
            data = None
    else:
        log.warning(
            "⚠️  NO EXISTE %s — arrancando con el escenario MÍNIMO EMBEBIDO (12 casas en la "
            "provincia de Zamora). Sirve para probar la API, NO para la demo: en cuanto "
            "data/generate.py escriba el fichero, `POST /reset` lo carga.",
            path,
        )

    if data is None:
        data = minimal_scenario()
        origen = "embebido (fallback)"

    with state.lock:
        state.reset_entities(scenario=name)
        state.scenario_meta = {
            "source": origen,
            "meta": data.get("meta", {}),
            "map": data.get("map", {}),
            "villages": data.get("villages", []),
            # `roads` no es una entidad del contrato (las carreteras cortadas llegan por
            # /events/road-closure); se guarda tal cual para que el mapa pueda pintarlas.
            "roads": data.get("roads", []),
        }

        resumen: dict[str, int] = {}
        for key, (model, coll_name) in ENTITY_MAP.items():
            coll = getattr(state, coll_name)
            for raw in data.get(key) or []:
                entity = _build(model, raw, key)
                if entity is None:
                    continue
                coll[entity.id] = entity
            resumen[coll_name] = len(coll)

        # Las tres fuentes de datos reales, de menos a más prioridad: `ROSTER_B64`, el fichero
        # de `data/private/` (las dos las resuelve `_roster_source`) y `PHONE_OVERRIDES`, que va
        # la última porque es el parche que se teclea en el último minuto y tiene que ganar.
        _apply_roster(state)
        _apply_phone_overrides(state)

        fire_raw = data.get("fire")
        if fire_raw:
            fire = _build(Fire, fire_raw, "fire")
            if fire is not None:
                if not fire.updated_at:
                    fire.updated_at = utcnow_iso()
                state.fire = fire
        resumen["fire"] = 1 if state.fire else 0
        state.t = utcnow_iso()

    log.info(
        "escenario '%s' cargado desde %s: %s",
        name,
        origen,
        ", ".join(f"{k}={v}" for k, v in resumen.items()),
    )
    resumen["source"] = origen  # type: ignore[assignment]
    return resumen


def _apply_phone_overrides(state) -> None:
    """Mete los teléfonos reales del ensayo, que vienen del entorno y no del fichero.

    El escenario versionado solo tiene números del rango reservado `+3460099xxxx` (contrato §1).
    Los móviles de verdad se declaran en `.env` con `PHONE_OVERRIDES=p-001:+34...,p-002:+34...`
    y se aplican aquí, al cargar. Así el repo —que es público— nunca contiene el móvil de nadie,
    y aun así se puede ensayar contra teléfonos reales sin tocar el dataset.

    La casa de esa persona hereda el número: si no, la patrulla y el `house_by_phone` seguirían
    mirando al teléfono falso y las llamadas entrantes no casarían con la ficha.
    """
    if not settings.phone_overrides:
        return
    aplicados = 0
    for person_id, telefono in settings.phone_overrides.items():
        person = state.people.get(person_id)
        if person is None:
            log.warning("PHONE_OVERRIDES: no existe la persona %s; se ignora", person_id)
            continue
        person.phone = telefono
        casa = state.houses.get(person.house_id or "")
        if casa is not None:
            casa.phone = telefono
        aplicados += 1
    if aplicados:
        log.info(
            "PHONE_OVERRIDES: %d teléfono(s) sustituido(s) desde el entorno (no versionados)",
            aplicados,
        )


ROSTER_ALIAS = {
    "person_id": "person_id", "id": "person_id", "persona": "person_id",
    "name": "name", "nombre": "name",
    "phone": "phone", "telefono": "phone", "teléfono": "phone",
    "movil": "phone", "móvil": "phone", "tel": "phone",
}


def _parse_roster(texto: str) -> tuple[list[tuple[str, str, str]], int]:
    """El CSV del roster → `[(person_id, nombre, teléfono)]` y cuántas filas venían sin id.

    Recibe **texto**, no una ruta, porque el mismo roster llega por dos caminos —el fichero de
    `data/private/` y la variable `ROSTER_B64` de Railway— y las reglas de qué es una fila
    válida tienen que ser exactamente las mismas en los dos. Antes esto vivía dentro de la
    lectura del fichero y el segundo camino habría sido una copia.

    Formato (la cabecera admite `id`/`nombre`/`teléfono` además de los nombres en inglés):

        person_id,name,phone
        p-005,Marta Ruiz,+34600995001
        p-006,,+34600995002          ← sin nombre: se queda el genérico del escenario

    Una fila con las dos columnas vacías no cuenta: la plantilla de `roster_template.py` sale
    así y es sitio reservado, no un dato pendiente de nadie. Contarla haría que el log dijera
    "66 personas con teléfono real" delante de un fichero en blanco.
    """
    filas: list[tuple[str, str, str]] = []
    sin_id = 0
    for cruda in csv.DictReader(io.StringIO(texto)):
        datos = {
            ROSTER_ALIAS[k.strip().lower()]: (v or "").strip()
            for k, v in cruda.items()
            if k and k.strip().lower() in ROSTER_ALIAS
        }
        nombre = datos.get("name", "")
        telefono = "".join(ch for ch in datos.get("phone", "") if ch.isdigit() or ch == "+")
        if not nombre and not telefono:
            continue
        person_id = datos.get("person_id", "")
        if not person_id:
            sin_id += 1
            continue
        filas.append((person_id, nombre, telefono))
    return filas, sin_id


def _decode_roster_b64(crudo: str) -> str | None:
    """`ROSTER_B64` → el texto del CSV, o `None` si la variable no se puede usar.

    Nunca lanza. Esto corre en el arranque de la API en mitad de un evento en vivo: un secreto
    mal pegado tiene que costar los nombres del roster —se sigue con los genéricos—, no el
    despliegue entero.

    Se toleran los espacios y saltos de línea que mete un panel web al pegar un valor largo, y
    también que falte el relleno `=` del final, que es lo que hacen algunos campos al recortar.
    Ese caso se avisa: casi siempre significa que el valor viajó mal, y lo que hay que mirar
    entonces es si el número de personas cargadas es el que se esperaba.
    """
    limpio = "".join(crudo.split())
    if not limpio:
        return None

    sobra = len(limpio) % 4
    if sobra == 1:
        log.error(
            "ROSTER_B64: no es base64 válido (le sobra un carácter suelto, %d en total). Se "
            "sigue con los nombres genéricos del escenario. Vuelve a generarlo con "
            "`python3 data/roster_secret.py` y pégalo entero, sin recortar.",
            len(limpio),
        )
        return None
    if sobra:
        log.warning(
            "ROSTER_B64: le faltaba el relleno '=' del final y se ha rehecho. Comprueba abajo "
            "que el número de personas cargadas es el que esperabas: si falta gente, el valor "
            "llegó cortado."
        )
        limpio += "=" * (4 - sobra)

    try:
        crudo_bytes = base64.b64decode(limpio, validate=True)
    except ValueError as exc:  # binascii.Error hereda de ValueError
        log.error(
            "ROSTER_B64: no se puede decodificar (%s). Se sigue con los nombres genéricos del "
            "escenario. Genera el valor con `python3 data/roster_secret.py` y pega SOLO lo que "
            "va detrás del '=', sin comillas.",
            exc,
        )
        return None

    try:
        return crudo_bytes.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        log.error(
            "ROSTER_B64: decodifica, pero lo que sale no es texto UTF-8 (%s). Se sigue con los "
            "nombres genéricos del escenario. ¿Seguro que es el CSV del roster?",
            exc,
        )
        return None


def _roster_source() -> tuple[str, str] | None:
    """El texto del roster y de dónde salió, o `None` si no hay roster que aplicar.

    Hay dos fuentes y **gana el fichero local** cuando existe. El motivo no es de arquitectura:
    si estás ensayando en tu máquina con el CSV abierto delante, eso es lo que quieres que se
    cargue, y una `ROSTER_B64` vieja que se quedó olvidada en tu `.env` no puede pisarte la
    edición sin decir nada. En Railway no hay fichero, así que allí no compiten. Cuando están
    las dos, se avisa: una fuente ignorada en silencio es de las cosas que cuestan media hora
    de depuración a las cuatro de la mañana.

    `PHONE_OVERRIDES` gana a las dos, y eso se decide fuera de aquí, en `load_scenario`: es el
    parche manual de último minuto y tiene que poder corregir a cualquiera de ellas.
    """
    ruta = settings.roster_csv
    crudo_b64 = settings.roster_b64.strip()

    if ruta.is_file():
        if crudo_b64:
            log.warning(
                "ROSTER: hay fichero (%s) y además ROSTER_B64. Manda el fichero; la variable se "
                "ignora. Si lo que quieres es probar la variable, mueve el fichero de sitio.",
                ruta,
            )
        try:
            return ruta.read_text(encoding="utf-8-sig"), f"el fichero {ruta}"
        except OSError as exc:
            log.error(
                "ROSTER: %s existe pero no se puede leer (%s)%s",
                ruta,
                exc,
                "; se prueba con ROSTER_B64" if crudo_b64 else "",
            )

    if not crudo_b64:
        return None
    texto = _decode_roster_b64(crudo_b64)
    if texto is None:
        return None
    return texto, "la variable ROSTER_B64 (nada tocó el disco)"


def _log_safe_id(person_id: str) -> str:
    """Un id del roster listo para el log.

    Un id es `p-007` y no hay nada que esconder, pero si alguien desplaza una columna del CSV
    lo que cae en esa casilla es un teléfono, y de ahí iría derecho al log. Lo que llegue con
    pinta de número sale enmascarado.
    """
    if sum(ch.isdigit() for ch in person_id) >= 6:
        return f"··· {person_id[-3:]}"
    return person_id


def _apply_roster(state) -> None:
    """Pone nombres y móviles reales encima del escenario, sin que salgan del repo ni del log.

    Es `PHONE_OVERRIDES` crecido. Para cuatro personas una variable de entorno vale; para
    setenta no se puede editar a mano, y además hace falta el **nombre**, que el agente dice al
    descolgar ("¿hablo con Marta?") y que `PHONE_OVERRIDES` no sabe tocar.

    Los datos llegan de `_roster_source`: el fichero de `data/private/` (que está en
    `.gitignore` — el repo es público y el historial de git no se borra) o `ROSTER_B64` cuando
    se ensaya desde Railway, donde no hay disco. Si no hay ninguna de las dos, la API arranca
    con los nombres genéricos del escenario y los números del rango reservado, que es lo que
    queremos por defecto.

    Del log sale cuánta gente se cargó y de qué fuente, nunca un nombre ni un teléfono.

    Como en `_apply_phone_overrides`, la casa hereda el teléfono de quien vive en ella: si no,
    `house_by_phone` seguiría mirando al número falso y una llamada entrante no casaría con la
    ficha.
    """
    fuente = _roster_source()
    if fuente is None:
        return
    texto, origen = fuente

    try:
        filas, sin_id = _parse_roster(texto)
    except csv.Error as exc:
        log.error(
            "ROSTER: %s no se puede leer como CSV (%s); se sigue con los datos del escenario",
            origen,
            exc,
        )
        return

    aplicados, sin_persona = 0, []
    for person_id, nombre, telefono in filas:
        person = state.people.get(person_id)
        if person is None:
            sin_persona.append(person_id)
            continue
        if nombre:
            person.name = nombre
        if telefono:
            person.phone = telefono
            casa = state.houses.get(person.house_id or "")
            if casa is not None:
                casa.phone = telefono
        aplicados += 1

    if aplicados:
        log.warning(
            "ROSTER: %d persona(s) con NOMBRE y TELÉFONO REALES desde %s. Los cerrojos siguen "
            "mandando: ALLOW_REAL_CALLS=%s, REGISTER_ONLY_CALLS=%s.",
            aplicados,
            origen,
            settings.allow_real_calls,
            settings.register_only_calls,
        )
    if sin_id:
        log.warning("ROSTER: %d fila(s) sin person_id; se ignoran", sin_id)
    if sin_persona:
        log.warning(
            "ROSTER: %d id(s) que no existen en el escenario '%s': %s",
            len(sin_persona),
            state.scenario,
            ", ".join(_log_safe_id(i) for i in sin_persona[:10])
            + ("…" if len(sin_persona) > 10 else ""),
        )


def _build(model: type, raw: dict, key: str):
    """Instancia el modelo perdonando un campo raro: primero tal cual, y si falla limpiando."""
    try:
        return model(**raw)
    except Exception as exc:
        log.warning("%s: registro inválido (%s); se intenta limpiando enums", key, exc)
        limpio = dict(raw)
        for campo in ("status", "position_source", "mobility", "convoy_role"):
            limpio.pop(campo, None)
        try:
            return model(**limpio)
        except Exception as exc2:
            log.error("%s: registro descartado (%s)", key, exc2)
            return None


# --------------------------------------------------------------------------------------
# Escenario mínimo embebido: 12 casas al sur de Tábara (provincia de Zamora).
# Coordenadas reales de la zona, personas y teléfonos INVENTADOS.
# --------------------------------------------------------------------------------------


def minimal_scenario() -> dict:
    lat0, lon0 = 41.711, -6.040  # Losacio (Zamora)
    nombres = [
        "Antonio Prieto",
        "Mercedes Cid",
        "Ramón Ferrero",
        "Pilar Casaseca",
        "Julián Represa",
        "Amparo Vega",
        "Tomás Rivero",
        "Encarna Lobo",
        "Nicolás Gago",
        "Adela Bécares",
        "Félix Turiel",
        "Rosario Panero",
    ]
    houses: list[dict] = []
    people: list[dict] = []
    for i, nombre in enumerate(nombres, start=1):
        lat = round(lat0 + 0.004 * ((i % 4) - 1.5), 6)
        lon = round(lon0 + 0.006 * ((i // 4) - 1.0), 6)
        hid = f"h-{i:03d}"
        vulnerable = i in (3, 9)
        houses.append(
            {
                "id": hid,
                "address": f"Calle de la Iglesia {i}, Losacio",
                "village": "Losacio",
                "lat": lat,
                "lon": lon,
                # Rango sintetico reservado del contrato (regla 2 de la seccion 6): +3460099xxxx.
                # NO usar +34980xxxxxxx: 980 es el prefijo real de Zamora y con
                # ALLOW_REAL_CALLS=true eso marcaria a alguien de verdad.
                "phone": f"+3460099{i:04d}",
                "residents_expected": 1 + (i % 3),
                "vulnerable": vulnerable,
                "vulnerability_reason": "movilidad reducida" if vulnerable else None,
                "sector_id": "s-1",
                "status": "pending",
            }
        )
        people.append(
            {
                "id": f"p-{i:03d}",
                "house_id": hid,
                "name": nombre,
                "phone": f"+3460000{i:04d}",
                "lat": lat,
                "lon": lon,
                "household_size": 1 + (i % 3),
                "mobility": "reduced" if vulnerable else "car",
                "has_smartphone": i % 3 != 0,
                "status": "unknown",
                "sector_id": "s-1",
            }
        )

    return {
        "meta": {
            "name": "minimo-embebido",
            "synthetic": True,
            "notice": "DATOS SINTÉTICOS de emergencia (fallback de la API). Nada real.",
        },
        "map": {"center_lat": lat0, "center_lon": lon0, "zoom": 12},
        "villages": [{"name": "Losacio", "lat": lat0, "lon": lon0, "population": 90}],
        "houses": houses,
        "people": people,
        "safe_zones": [
            {
                "id": "x-a",
                "name": "Tábara (CRA León Felipe)",
                "lat": 41.82611,
                "lon": -5.95889,
                "capacity": 400,
                "occupancy": 0,
                "status": "open",
                "access_roads": ["ZA-P-2434"],
            },
            {
                "id": "x-b",
                # Instalacion, coordenadas y carretera VERIFICADAS en
                # docs/03-dominio-crisis/05-geografia-sierra-culebra.md. El "pabellon municipal" y la "ZA-P-1508"
                # que habia aqui antes no existen en la investigacion: eran inventados.
                "name": "Alcañices (CEIP Virgen de la Salud)",
                "lat": 41.69887,
                "lon": -6.34793,
                "capacity": 250,
                "occupancy": 0,
                "status": "open",
                "access_roads": ["N-122"],
            },
        ],
        "sectors": [
            {
                "id": "s-1",
                "name": "Sector 1 — Losacio",
                "polygon": {
                    "type": "Polygon",
                    "coordinates": [
                        [
                            [lon0 - 0.05, lat0 - 0.03],
                            [lon0 + 0.05, lat0 - 0.03],
                            [lon0 + 0.05, lat0 + 0.03],
                            [lon0 - 0.05, lat0 + 0.03],
                            [lon0 - 0.05, lat0 - 0.03],
                        ]
                    ],
                },
            }
        ],
        "patrols": [
            {
                "id": "pt-1",
                "name": "Guardia Civil Tábara 1",
                "lat": 41.7127,
                "lon": -6.0375,
                "status": "standby",
                "channel": "+34600999796",
            }
        ],
        "fire": {
            "perimeter": {
                "type": "Polygon",
                "coordinates": [
                    [
                        [-6.09, 41.66],
                        [-6.01, 41.66],
                        [-6.01, 41.69],
                        [-6.09, 41.69],
                        [-6.09, 41.66],
                    ]
                ],
            },
            "wind": {"direction_deg": 200.0, "speed_kmh": 30.0, "gusts_kmh": 48.0},
            "spread_rate_mh": 1500.0,
            "head_bearing_deg": 20.0,
            "cone_half_angle_deg": 30.0,
        },
    }
