#!/usr/bin/env python3
"""Vacía el tablero de llamadas de una API de crisis (local o desplegada).

    python3 scripts/reset.py                              # vacia el tablero de llamadas
    python3 scripts/reset.py --url https://… --key XXX    # contra el desplegado
    python3 scripts/reset.py --todo                       # ademas recarga el escenario entero

Por qué existe en vez de un `curl` a pelo: la clave viaja en una cabecera HTTP, y una cabecera
es una secuencia de bytes **latin-1** (RFC 9110). Si el secreto lleva acentos, `curl` desde una
terminal UTF-8 manda dos bytes donde el servidor espera uno y devuelve 401 — con la misma clave
que funciona en el navegador. Aquí se codifica bien y se acabó el misterio.

Por defecto usa `POST /calls/reset`, que **solo** retira los intentos de llamada. `--todo` usa
`POST /reset`, que recarga el escenario entero: se lleva por delante el decision_log, las
posiciones compartidas por GPS y todo lo ocurrido. Entre tandas de ensayo da igual; con el
jurado delante, no se pulsa. Por eso el suave es el que está a mano y el otro hay que pedirlo.
"""

from __future__ import annotations

import argparse
import json
import os
import pathlib
import sys
import urllib.error
import urllib.parse
import urllib.request

# Solo biblioteca estándar, a propósito: esto se corre desde cualquier checkout, con o sin
# `make install`, y fallar con «.venv/bin/python: No such file or directory» cuando lo que
# quieres es limpiar un tablero en mitad de un ensayo es una broma pesada.

REPO = pathlib.Path(__file__).resolve().parent.parent


def clave_del_env() -> tuple[str, str]:
    """Lee `HR_SHARED_SECRET` y `SCENARIO` del `.env` del repo, sin importar `api/`."""
    secreto, escenario = os.getenv("HR_SHARED_SECRET", ""), os.getenv("SCENARIO", "")
    env = REPO / ".env"
    if env.is_file():
        for linea in env.read_text(encoding="utf-8").splitlines():
            if linea.startswith("#") or "=" not in linea:
                continue
            k, _, v = linea.partition("=")
            if k.strip() == "HR_SHARED_SECRET" and not secreto:
                secreto = v.strip()
            elif k.strip() == "SCENARIO" and not escenario:
                escenario = v.strip()
    return secreto, escenario or "sierra-culebra"


def main() -> int:
    por_defecto, escenario_env = clave_del_env()
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--url", default="http://localhost:8000", help="base de la API")
    p.add_argument("--key", default=por_defecto, help="x-api-key (por defecto, la del .env)")
    p.add_argument("--scenario", default=escenario_env, help="escenario a recargar (con --todo)")
    p.add_argument(
        "--todo",
        action="store_true",
        help="recarga el escenario ENTERO (borra decision_log y posiciones), no solo las llamadas",
    )
    args = p.parse_args()

    if not args.key:
        print("falta la clave: pásala con --key o pon HR_SHARED_SECRET en .env", file=sys.stderr)
        return 2

    url = args.url.rstrip("/")
    # latin-1: lo que dice el RFC y lo que manda el navegador. Con UTF-8 una `ñ` da 401.
    # latin-1 es lo que dice el RFC 9110 y lo que manda el navegador. Con UTF-8 una `ñ` da 401.
    cabecera = args.key.encode("latin-1", errors="replace").decode("latin-1")
    if args.todo:
        ruta, cuerpo = "/reset", json.dumps({"scenario": args.scenario}).encode()
    else:
        quien = urllib.parse.quote(os.getenv("USER", "puesto de mando"))
        ruta, cuerpo = f"/calls/reset?operator={quien}", b"{}"

    peticion = urllib.request.Request(
        f"{url}{ruta}",
        data=cuerpo,
        method="POST",
        headers={"x-api-key": cabecera, "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(peticion, timeout=30) as respuesta:
            datos = json.loads(respuesta.read() or b"{}")
    except urllib.error.HTTPError as exc:
        detalle = exc.read().decode("utf-8", "replace")[:200]
        print(f"FALLO {exc.code}: {detalle}", file=sys.stderr)
        if exc.code == 401:
            print(
                "  (401 = clave equivocada. La del desplegado NO tiene por qué ser la del .env\n"
                "   local: mírala en Railway → Variables → HR_SHARED_SECRET)",
                file=sys.stderr,
            )
        elif exc.code == 404:
            print(
                "  (404 = ese despliegue todavía no tiene /calls/reset. ¿Está mergeado el PR?)",
                file=sys.stderr,
            )
        return 1
    except Exception as exc:
        print(f"no se pudo hablar con {url}: {exc}", file=sys.stderr)
        return 1

    que = (
        f"escenario '{args.scenario}' recargado ENTERO (decision_log y posiciones incluidos)"
        if args.todo
        else "tablero de llamadas vaciado (el resto del estado, intacto)"
    )
    print(f"reset ok · {url} · {que} · state_version {datos.get('state_version')}")
    try:
        comprobar = urllib.request.Request(f"{url}/calls", headers={"x-api-key": cabecera})
        with urllib.request.urlopen(comprobar, timeout=20) as respuesta:
            print(f"  tablero: {len(json.loads(respuesta.read()))} llamadas")
    except Exception:
        pass  # la confirmación es un extra, no vale la pena fallar por ella
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
