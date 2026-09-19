"""`make test` corre `cd engine && .venv/bin/python -m pytest -q`, así que en `sys.path` entra
`engine/`, no la raíz del repo. Sin este bootstrap `import engine.*` no resuelve."""

import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))
