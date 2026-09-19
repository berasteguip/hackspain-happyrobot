"""`make test` corre `cd backend/engine && .venv/bin/python -m pytest -q`, así que en `sys.path`
entra `backend/engine/`, no `backend/`. Sin este bootstrap `import engine.*` no resuelve."""

import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[2]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))
