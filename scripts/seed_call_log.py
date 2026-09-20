#!/usr/bin/env python3
"""Siembra el log de llamadas con anotaciones de prueba, para ver el panel con algo dentro.

Uso:
    python scripts/seed_call_log.py                      # contra http://localhost:8000
    python scripts/seed_call_log.py --api http://... --drip 2

DATOS DE PRUEBA. Ninguna de estas frases la ha dicho nadie: son lo que diría un
vecino o un cuerpo oficial en el escenario de la Sierra de la Culebra, escritas a
mano para poder mirar la pantalla antes de que existan llamadas reales.

`--drip N` las manda de una en una cada N segundos, que es como se ven de verdad:
apareciendo. Sin `--drip` entran todas de golpe.
"""
from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.error
import urllib.request

# (topic, question, answer, source_id, source_detail, locality_id, road, place_text, validity_min)
ANOTACIONES = [
    ("person_situation", "¿cuántos hay en casa y cómo salen?",
     "Está sola con su madre de 87 años, que no anda. No tienen coche.",
     "vecino", "", "n-losacio", "", "", None),
    ("road_status", "¿está cortada la ZA-P-2434?",
     "Abierta a las 14:10, con paso alternativo por el desvío de Sesnández.",
     "bomberos", "bomberos de Zamora", "", "ZA-P-2434", "", 60),
    ("fire_observed", "humo en la pista de La Cernada",
     "Humo denso, no se ve el final de la pista. No hay llamas a la vista.",
     "vecino", "", "n-ferreruela-de-tabara", "", "la pista de La Cernada", 15),
    ("shelter_capacity", "¿cabe gente en el colegio de Tábara?",
     "Sí, van 86 de 400 plazas. Entran por la puerta de atrás.",
     "ayuntamiento", "Ayuntamiento de Tábara", "n-tabara", "", "", 120),
    ("evacuation_order", "¿han mandado evacuar Sesnández?",
     None, "cecopi", "", "n-sesnandez-de-tabara", "", "", None),
    ("road_status", "¿se puede salir por la N-631 hacia Tábara?",
     "Cortada desde el km 42. Visibilidad nula por el humo.",
     "guardia_civil", "Guardia Civil de Tábara", "", "N-631", "", 60),
    ("person_situation", "¿tiene sitio en el coche?",
     "Lleva dos plazas libres y se ofrece a llevar a quien haga falta.",
     "vecino", "", "n-sesnandez-de-tabara", "", "", None),
    ("fire_observed", "¿se ve fuego desde Losacio?",
     "Se ve resplandor hacia el suroeste, detrás del monte. Sin llamas cerca.",
     "vecino", "", "n-losacio", "", "", 15),
    ("road_status", "¿sigue abierta la ZA-P-2434?",
     "Ya no. La acaban de cortar los bomberos hace un momento.",
     "patrulla", "patrulla de Tábara", "", "ZA-P-2434", "", 30),
]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--api", default="http://localhost:8000")
    parser.add_argument("--drip", type=float, default=0.0, help="segundos entre anotaciones")
    args = parser.parse_args()

    base = args.api.rstrip("/")
    ok = 0
    for topic, pregunta, respuesta, fuente, detalle, zona, via, paraje, vigencia in ANOTACIONES:
        cuerpo = {
            "topic": topic,
            "question": pregunta,
            "answer": respuesta or "",
            "source_id": fuente,
            "source_detail": detalle,
            "locality_id": zona,
            "road": via,
            "place_text": paraje,
            "validity_min": vigencia if vigencia is not None else "",
            "simulated": True,
        }
        peticion = urllib.request.Request(
            f"{base}/calls/log",
            data=json.dumps(cuerpo).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(peticion, timeout=5) as respuesta_http:
                respuesta_http.read()
            ok += 1
            print(f"  ✓ {fuente:15} {pregunta[:52]}")
        except urllib.error.URLError as e:
            print(f"  ✗ {pregunta[:52]} → {e}", file=sys.stderr)
            return 1
        if args.drip:
            time.sleep(args.drip)

    print(f"\n{ok}/{len(ANOTACIONES)} anotaciones en el log.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
