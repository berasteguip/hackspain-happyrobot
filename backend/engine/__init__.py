"""Motor de escenario: hace que la crisis se mueva debajo del sistema.

El motor es el único componente que no reacciona: empuja. Lee un guion declarativo
(`scenarios/*.yaml`), hace crecer el incendio de forma continua y dispara los eventos del
timeline contra la API de estado de crisis (`backend/api/`).

Punto de entrada: `engine.run` (ver `backend/engine/README.md`).
"""

__all__ = ["clock", "client", "fire_model", "geo", "scenario"]
