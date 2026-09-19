"""Simulador de evacuación (feature B1): simula la evacuación completa y elige el plan que pierde menos gente.

Uso: `cd backend/sim && .venv/bin/python -m sim.cli --scenario ../data/scenarios/sierra-culebra.json --variants 200 --out out/`
"""

__all__ = ["geo", "fire", "graph", "routing", "model", "plans", "scenario", "search"]
