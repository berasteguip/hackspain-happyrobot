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
os.environ.setdefault("ALLOW_REAL_CALLS", "false")
os.environ["REAL_CALL_ALLOWLIST"] = ""  # ni heredando el .env del equipo se marca nada
os.environ.setdefault("HR_WORKFLOW_WEBHOOK", "")
os.environ.setdefault("HR_SHARED_SECRET", "")  # sin auth: los tests llaman directo
os.environ.setdefault("ROUTING_PROVIDER", "straight")  # sin red en los tests
os.environ["STATE_JSONL"] = str(API_DIR / "tests" / ".state-test.jsonl")
os.environ["SCENARIOS_DIR"] = str(API_DIR / "tests" / "fixtures")
os.environ["SCENARIO"] = "test-mini"
