"""Configuración por entorno.

Lee `backend/api/.env` (si existe) y el entorno del proceso. Nada de valores mágicos repartidos por el
código: todo umbral que un humano pueda querer tocar durante la hackathon vive aquí.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import load_dotenv

API_DIR = Path(__file__).resolve().parent
BACKEND_DIR = API_DIR.parent          # backend/ (api, engine, sim, data)
REPO_ROOT = BACKEND_DIR.parent        # raíz del repo (donde vive .env)

# Cargamos backend/api/.env sin sobrescribir lo que ya venga del entorno (docker/make manda).
load_dotenv(API_DIR / ".env", override=False)
load_dotenv(REPO_ROOT / ".env", override=False)


def _bool(name: str, default: bool = False) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "si", "sí", "on"}


def _float(name: str, default: float) -> float:
    try:
        return float(os.getenv(name, "") or default)
    except ValueError:
        return default


@dataclass
class Settings:
    # --- HappyRobot / auth -------------------------------------------------
    hr_shared_secret: str = field(default_factory=lambda: os.getenv("HR_SHARED_SECRET", ""))
    hr_api_key: str = field(default_factory=lambda: os.getenv("HR_API_KEY", ""))
    hr_workflow_webhook: str = field(default_factory=lambda: os.getenv("HR_WORKFLOW_WEBHOOK", ""))
    hr_base_url: str = field(
        default_factory=lambda: os.getenv("HR_BASE_URL", "https://platform.eu.happyrobot.ai")
    )
    api_base_url: str = field(
        default_factory=lambda: os.getenv("API_BASE_URL", "http://localhost:8000")
    )
    public_base_url: str = field(default_factory=lambda: os.getenv("PUBLIC_BASE_URL", ""))

    # La bandera que impide llamar a 120 teléfonos de verdad por accidente.
    allow_real_calls: bool = field(default_factory=lambda: _bool("ALLOW_REAL_CALLS", False))

    # --- Escenario y persistencia -----------------------------------------
    scenario: str = field(default_factory=lambda: os.getenv("SCENARIO", "sierra-culebra"))
    state_jsonl: Path = field(
        default_factory=lambda: Path(os.getenv("STATE_JSONL", str(API_DIR / "state.jsonl")))
    )
    scenarios_dir: Path = field(
        default_factory=lambda: Path(
            os.getenv("SCENARIOS_DIR", str(BACKEND_DIR / "data" / "scenarios"))
        )
    )

    # --- Rutas -------------------------------------------------------------
    routing_provider: str = field(
        default_factory=lambda: os.getenv("ROUTING_PROVIDER", "straight").strip().lower()
    )
    osrm_url: str = field(
        default_factory=lambda: os.getenv("OSRM_URL", "http://localhost:5000").rstrip("/")
    )
    valhalla_url: str = field(
        default_factory=lambda: os.getenv("VALHALLA_URL", "http://localhost:8002").rstrip("/")
    )
    routing_timeout_s: float = field(default_factory=lambda: _float("ROUTING_TIMEOUT_S", 3.0))
    # Velocidad media para el proveedor `straight` (carretera rural de noche con humo).
    straight_speed_kmh: float = field(default_factory=lambda: _float("STRAIGHT_SPEED_KMH", 45.0))
    patrol_speed_kmh: float = field(default_factory=lambda: _float("PATROL_SPEED_KMH", 55.0))

    # --- Umbrales del planner ---------------------------------------------
    convoy_min_members: int = 2
    convoy_cohesion_m: float = field(default_factory=lambda: _float("CONVOY_COHESION_M", 1500.0))
    # Si el GPS se mueve menos que esto, no recalculamos nada (planner barato).
    position_significant_move_m: float = field(
        default_factory=lambda: _float("POSITION_SIGNIFICANT_MOVE_M", 150.0)
    )
    safe_zone_filling_ratio: float = field(
        default_factory=lambda: _float("SAFE_ZONE_FILLING_RATIO", 0.8)
    )
    safe_zone_threatened_m: float = field(
        default_factory=lambda: _float("SAFE_ZONE_THREATENED_M", 3000.0)
    )
    stalled_minutes: float = field(default_factory=lambda: _float("STALLED_MINUTES", 5.0))
    at_risk_horizon_min: float = field(default_factory=lambda: _float("AT_RISK_HORIZON_MIN", 10.0))
    max_houses_per_patrol: int = 3
    escalate_after_attempts: int = 2

    def summary(self) -> dict:
        """Lo que se imprime al arrancar (sin secretos)."""
        return {
            "scenario": self.scenario,
            "routing_provider": self.routing_provider,
            "allow_real_calls": self.allow_real_calls,
            "auth": "on" if self.hr_shared_secret else "OFF (HR_SHARED_SECRET vacío)",
            "webhook_happyrobot": "configurado" if self.hr_workflow_webhook else "sin configurar",
            "state_jsonl": str(self.state_jsonl),
        }


settings = Settings()


def reload_settings() -> Settings:
    """Vuelve a leer el entorno. Solo se usa en tests."""
    global settings
    settings = Settings()
    return settings
