"""Configuración por entorno.

Lee `api/.env` (si existe) y el entorno del proceso. Nada de valores mágicos repartidos por el
código: todo umbral que un humano pueda querer tocar durante la hackathon vive aquí.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import load_dotenv

API_DIR = Path(__file__).resolve().parent
REPO_ROOT = API_DIR.parent

# Cargamos api/.env sin sobrescribir lo que ya venga del entorno (docker/make manda).
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


def _int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, "") or default)
    except ValueError:
        return default


def _phone_map(name: str) -> dict[str, str]:
    """`p-001:+34600112233,p-002:+34600445566` → `{"p-001": "+34600112233", ...}`.

    Existe para que **ningún teléfono real entre en el repo**. El escenario se comitea con
    números del rango reservado y los de verdad se inyectan desde `.env`, que no se comitea.
    El repo es público: un móvil en un fichero versionado se queda en el historial de git para
    siempre, y normalmente no es tuyo el móvil que publicas.
    """
    mapa: dict[str, str] = {}
    for trozo in (os.getenv(name, "") or "").split(","):
        if ":" not in trozo:
            continue
        pid, _, tel = trozo.partition(":")
        limpio = "".join(ch for ch in tel if ch.isdigit() or ch == "+")
        if pid.strip() and limpio:
            mapa[pid.strip()] = limpio
    return mapa


def _phone_set(name: str) -> set[str]:
    """Lista de teléfonos separada por comas → conjunto en E.164 sin espacios ni guiones."""
    raw = os.getenv(name, "") or ""
    limpio = {
        "".join(ch for ch in trozo if ch.isdigit() or ch == "+")
        for trozo in raw.split(",")
        if trozo.strip()
    }
    return {t for t in limpio if t}


# Secretos que están escritos en un fichero versionado de un repo PÚBLICO. Quien lea el repo
# los tiene. Si alguno de estos es la clave de un despliegue, ese despliegue está abierto.
SECRETOS_PUBLICOS = frozenset(
    {
        "cambiame-por-algo-largo",
        "clave-de-ensayo",
        "changeme",
        "secret",
        "test",
    }
)


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

    hr_workflow_id: str = field(default_factory=lambda: os.getenv("HR_WORKFLOW_ID", ""))

    # La bandera que impide llamar a 120 teléfonos de verdad por accidente.
    allow_real_calls: bool = field(default_factory=lambda: _bool("ALLOW_REAL_CALLS", False))

    # --- Reparto de llamadas ------------------------------------------------------------
    # Segundo cerrojo, y el que de verdad protege durante los ensayos: aunque
    # `ALLOW_REAL_CALLS` esté en true, solo se marcan los teléfonos de esta lista. Vacía =
    # sin lista blanca, se marca lo que diga el escenario (que es lo que hace falta el día
    # de la demo, con el dataset sintético cargado).
    call_allowlist: set[str] = field(default_factory=lambda: _phone_set("CALL_ALLOWLIST"))
    # `p-001:+34...,p-002:+34...` — sustituye el teléfono de esas personas al cargar el
    # escenario. Los móviles reales de los ensayos viven aquí, nunca en un fichero versionado.
    phone_overrides: dict[str, str] = field(
        default_factory=lambda: _phone_map("PHONE_OVERRIDES")
    )
    # Quien se registra desde el enlace con su propio teléfono entra en la lista blanca: es la
    # persona dando su consentimiento, no un número del dataset. `false` para exigir `.env`.
    register_auto_allow: bool = field(default_factory=lambda: _bool("REGISTER_AUTO_ALLOW", True))
    # Ensayo con el enlace: aunque `CALL_ALLOWLIST` esté vacía, solo suenan los teléfonos que se
    # registraron desde el enlace. Así los +3460099xxxx del dataset no consumen llamadas.
    register_only_calls: bool = field(default_factory=lambda: _bool("REGISTER_ONLY_CALLS", False))
    # `false`: el planner no llama ni manda SMS por su cuenta (rutas nuevas, convoyes, riesgo);
    # solo suena lo que el operador rodea en el mapa. Para ensayos donde el mando decide.
    auto_notify: bool = field(default_factory=lambda: _bool("AUTO_NOTIFY", True))
    # Llamadas simultáneas que se lanzan al rodear un círculo en Vigía.
    call_parallelism: int = field(default_factory=lambda: _int("CALL_PARALLELISM", 8))
    # Radio máximo que se acepta en /calls/dispatch: un círculo de 200 km no es una zona.
    call_max_radius_m: float = field(default_factory=lambda: _float("CALL_MAX_RADIUS_M", 20000.0))
    # Tope de llamadas por ráfaga. Rodear el mapa entero no debe lanzar 120 runs.
    call_max_batch: int = field(default_factory=lambda: _int("CALL_MAX_BATCH", 25))
    # Minutos tras los cuales un intento sin desenlace deja de bloquear otro. Existe porque el
    # resultado llega por un callback que puede no llegar nunca (API en localhost, túnel caído),
    # y sin esto una llamada de dos minutos bloquea a esa persona el resto de la crisis.
    call_stale_minutes: float = field(default_factory=lambda: _float("CALL_STALE_MINUTES", 5.0))

    # --- Contexto que el agente de voz lee al descolgar ----------------------------------
    # El prompt del workflow los interpola literalmente ("le llama el asistente automático de
    # {CAMPANA_ORGANISMO} por el incendio en {CAMPANA_ZONA}"), así que un valor vacío se oye
    # como un hueco en mitad de la frase.
    campaign_org: str = field(
        default_factory=lambda: os.getenv("CAMPANA_ORGANISMO", "Protección Civil")
    )
    campaign_zone: str = field(default_factory=lambda: os.getenv("CAMPANA_ZONA", "su zona"))
    # "ninguna" o la orden en vigor. Si NO es "ninguna", el agente la transmite sin ofrecer
    # alternativas: no es un texto decorativo.
    authority_order: str = field(default_factory=lambda: os.getenv("ORDEN_AUTORIDAD", "ninguna"))
    # El workflow tiene su PROPIO cerrojo (un nodo Python que valida el destino antes de
    # marcar) y exige que la petición se declare como simulacro. Ponerlo a false hace que el
    # workflow rechace todas las llamadas: es el freno de mano del lado de HappyRobot.
    demo_mode: bool = field(default_factory=lambda: _bool("DEMO_MODE", True))

    # --- Escenario y persistencia -----------------------------------------
    scenario: str = field(default_factory=lambda: os.getenv("SCENARIO", "sierra-culebra"))
    state_jsonl: Path = field(
        default_factory=lambda: Path(os.getenv("STATE_JSONL", str(API_DIR / "state.jsonl")))
    )
    scenarios_dir: Path = field(
        default_factory=lambda: Path(
            os.getenv("SCENARIOS_DIR", str(REPO_ROOT / "data" / "scenarios"))
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

    @property
    def secret_is_public(self) -> bool:
        """¿La clave de nuestra API es una que está escrita en el repo?"""
        return self.hr_shared_secret.strip().lower() in SECRETOS_PUBLICOS

    def summary(self) -> dict:
        """Lo que se imprime al arrancar (sin secretos)."""
        return {
            "scenario": self.scenario,
            "routing_provider": self.routing_provider,
            "allow_real_calls": self.allow_real_calls,
            "phone_overrides": (
                f"{len(self.phone_overrides)} teléfono(s) sustituido(s) desde el entorno"
                if self.phone_overrides
                else "ninguno (se usan los del escenario)"
            ),
            "call_allowlist": (
                f"{len(self.call_allowlist)} teléfono(s)"
                if self.call_allowlist
                else "VACÍA (se marca lo que diga el escenario)"
            ),
            "auth": (
                "⚠️  CLAVE PÚBLICA (está en el repo: cámbiala)"
                if self.secret_is_public
                else "on"
                if self.hr_shared_secret
                else "OFF (HR_SHARED_SECRET vacío)"
            ),
            "webhook_happyrobot": "configurado" if self.hr_workflow_webhook else "sin configurar",
            "state_jsonl": str(self.state_jsonl),
        }


settings = Settings()


def reload_settings() -> Settings:
    """Vuelve a leer el entorno. Solo se usa en tests."""
    global settings
    settings = Settings()
    return settings
