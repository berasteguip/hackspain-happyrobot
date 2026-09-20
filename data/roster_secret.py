"""Empaqueta `data/private/roster.csv` en la variable `ROSTER_B64` que se pega en Railway.

En Railway no hay disco donde dejar el roster y subirlo al repo es justo lo que `data/private/`
evita, así que el CSV entero viaja como un secreto de entorno en base64. `api/loader.py` lo
decodifica en memoria al arrancar y no escribe nada en el contenedor.

    python3 data/roster_secret.py              # la línea, lista para pegar
    python3 data/roster_secret.py | pbcopy     # directa al portapapeles (macOS)

Por stdout sale SOLO `ROSTER_B64=...`; los avisos van por stderr para que la tubería quede
limpia. Esa línea lleva dentro los móviles de todo el grupo: no la pegues en un chat, no la
dejes en el historial del terminal más de lo necesario y **borra la variable de Railway al
acabar el evento** — cualquiera con acceso al proyecto la ve en el panel.
"""

import argparse
import base64
import pathlib
import sys

DATA = pathlib.Path(__file__).resolve().parent
ORIGEN = DATA / "private" / "roster.csv"

# Lo que damos por seguro que acepta un campo de variable de entorno. No es el límite de
# Railway —no está publicado en ninguna parte que hayamos verificado—, es el umbral a partir
# del cual preferimos avisar. Un roster de 90 personas ronda los 5 kB, así que hay sitio de
# sobra antes de llegar aquí.
AVISO_BYTES = 16 * 1024


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--origen", type=pathlib.Path, default=ORIGEN)
    ap.add_argument(
        "--solo-valor",
        action="store_true",
        help="escupe el base64 pelado, sin el 'ROSTER_B64=' delante",
    )
    args = ap.parse_args()

    if not args.origen.is_file():
        print(
            f"no existe {args.origen}\n"
            "Créalo con `python3 data/roster_template.py ucm-grupo --grupo` y rellénalo.",
            file=sys.stderr,
        )
        return 1

    crudo = args.origen.read_bytes()
    valor = base64.b64encode(crudo).decode("ascii")

    filas = sum(1 for linea in crudo.decode("utf-8-sig").splitlines() if linea.strip())
    personas = max(filas - 1, 0)  # la cabecera no es nadie

    print(valor if args.solo_valor else f"ROSTER_B64={valor}")

    print(
        f"{args.origen.name}: {personas} fila(s) · {len(crudo)} bytes de CSV → "
        f"{len(valor)} caracteres en base64",
        file=sys.stderr,
    )
    if len(valor) > AVISO_BYTES:
        print(
            f"OJO: {len(valor)} caracteres es mucho para una variable de entorno. Si Railway lo "
            "rechaza, parte el roster o vuelve al fichero local.",
            file=sys.stderr,
        )
    print(
        "Pégalo en Railway → tu servicio → Variables. Ahí lo ve cualquiera con acceso al "
        "proyecto: BÓRRALO al acabar el evento.",
        file=sys.stderr,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
