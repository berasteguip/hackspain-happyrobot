"""Configuración de pytest para `api/`.

Los módulos de la API se importan planos (`import planner`, no `api.planner`) porque en producción
el proceso arranca dentro de `api/` (`uvicorn main:app`). Para que pytest los vea igual, se mete
`api/` en `sys.path` **antes** de importar nada.

Los tests son herméticos: nunca dependen de `data/scenarios/`, ni escriben en `api/state.jsonl`, ni
pueden llamar por teléfono (`ALLOW_REAL_CALLS` se fuerza a `false`).
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

API_DIR = Path(__file__).resolve().parent
if str(API_DIR) not in sys.path:
    sys.path.insert(0, str(API_DIR))

# Entorno de test fijado ANTES de importar settings (se lee una vez, en import time).
#
# `settings.py` carga `.env` del repo, así que TODA variable que el ensayo pueda tener puesta
# ahí tiene que estar fijada aquí o los tests dejan de ser herméticos: pasan o fallan según lo
# que tenga cada uno en su `.env`. Pasó de verdad — un `CALL_ALLOWLIST` de un ensayo bloqueó
# los teléfonos del fixture y tumbó tres tests que no tenían nada que ver.
os.environ.setdefault("ALLOW_REAL_CALLS", "false")
os.environ.setdefault("CALL_ALLOWLIST", "")  # sin lista blanca: el fixture marca lo que quiera
os.environ.setdefault("HR_WORKFLOW_WEBHOOK", "")
os.environ.setdefault("HR_API_KEY", "")
os.environ.setdefault("HR_SHARED_SECRET", "")  # sin auth: los tests llaman directo
os.environ.setdefault("API_BASE_URL", "http://localhost:8000")
os.environ.setdefault("PUBLIC_BASE_URL", "")
os.environ.setdefault("CAMPANA_ORGANISMO", "Protección Civil")
os.environ.setdefault("CAMPANA_ZONA", "su zona")
os.environ.setdefault("ORDEN_AUTORIDAD", "ninguna")
os.environ.setdefault("ROUTING_PROVIDER", "straight")  # sin red en los tests
os.environ.setdefault("PHONE_OVERRIDES", "")
# Vacío NO es cero: `_int` cae al valor por defecto del código. Se fijan así a propósito, para
# que los tests de la ráfaga midan el tope que lleva el repo y no el que tenga cada uno en su
# `.env` — que es justo la variable que alguien baja para un ensayo y se deja bajada.
os.environ["CALL_MAX_BATCH"] = ""
os.environ["CALL_PARALLELISM"] = ""
# Un roster de ensayo en data/private/ pisaría los nombres y teléfonos del fixture, y los tests
# empezarían a depender de qué lista tenga cargada cada uno. Se apunta a un fichero que no existe.
os.environ["ROSTER_CSV"] = str(API_DIR / "tests" / "fixtures" / "sin-roster.csv")
os.environ["STATE_JSONL"] = str(API_DIR / "tests" / ".state-test.jsonl")
os.environ["SCENARIOS_DIR"] = str(API_DIR / "tests" / "fixtures")
os.environ["SCENARIO"] = "test-mini"
