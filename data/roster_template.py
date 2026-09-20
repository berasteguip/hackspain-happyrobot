"""Escribe la plantilla de `data/private/roster.csv` con los ids del escenario ya puestos.

El roster es el fichero SIN VERSIONAR donde viven los nombres y móviles reales de un ensayo
(`api/loader.py` lo aplica al arrancar). Rellenarlo a mano obliga a saberse de memoria qué
`person_id` le toca a cada uno, así que esto lo genera: una fila por persona, con el nombre
genérico del escenario en un comentario al lado del id.

    python3 data/roster_template.py ucm-grupo          # a data/private/roster.csv
    python3 data/roster_template.py ucm-grupo --grupo  # solo el bloque del grupo, sin el equipo

No sobrescribe un roster que ya exista: la lista real cuesta de reunir y no está en git, así
que perderla por volver a lanzar el comando sería un mal día.
"""

import argparse
import csv
import json
import pathlib
import sys

DATA = pathlib.Path(__file__).resolve().parent
DESTINO = DATA / "private" / "roster.csv"


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("escenario", help="nombre sin .json, p. ej. ucm-grupo")
    ap.add_argument("--salida", type=pathlib.Path, default=DESTINO)
    ap.add_argument(
        "--grupo",
        action="store_true",
        help="salta a las personas cuyas notas no son del grupo (equipo y vecindario sintético)",
    )
    ap.add_argument("--forzar", action="store_true", help="sobrescribe el roster existente")
    args = ap.parse_args()

    origen = DATA / "scenarios" / f"{args.escenario}.json"
    if not origen.is_file():
        print(f"no existe {origen}", file=sys.stderr)
        return 1
    if args.salida.exists() and not args.forzar:
        print(f"{args.salida} ya existe. Usa --forzar si de verdad quieres pisarlo.", file=sys.stderr)
        return 1

    personas = json.loads(origen.read_text(encoding="utf-8"))["people"]
    if args.grupo:
        personas = [p for p in personas if (p.get("notes") or "").startswith("Participante")]

    args.salida.parent.mkdir(parents=True, exist_ok=True)
    with args.salida.open("w", encoding="utf-8", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(["person_id", "name", "phone"])
        for p in personas:
            w.writerow([p["id"], "", ""])

    print(f"{args.salida} · {len(personas)} fila(s) por rellenar (name, phone)")
    print("OJO: este fichero NO se comitea. data/private/ está en .gitignore.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
