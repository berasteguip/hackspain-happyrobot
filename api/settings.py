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
    """`p-001:+34600990111,p-002:+34600990222` → `{"p-001": "+34600990111", ...}`.

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


def _phone(name: str) -> str:
    """Un teléfono suelto del entorno → E.164 sin espacios ni guiones."""
    raw = os.getenv(name, "") or ""
    return "".join(ch for ch in raw if ch.isdigit() or ch == "+")


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
    # Canal de SMS propio, si lo hay. Vacío = no hay SMS: el webhook de voz NO vale de respaldo,
    # porque hace sonar el teléfono diga lo que diga `action` (ver `notify._dispatch`).
    hr_sms_webhook: str = field(default_factory=lambda: os.getenv("HR_SMS_WEBHOOK", ""))
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
    # Aquí vivía `CALL_ALLOWLIST`, una lista blanca de teléfonos. Se quitó: el agente llama a
    # números que le dicta la persona durante la conversación (la madre que se quedó en casa),
    # y eso es incompatible con una lista escrita de antemano. Lo que frena ahora una ráfaga
    # mal dibujada es `ALLOW_REAL_CALLS`, `CALL_MAX_BATCH` y `CALL_MAX_RADIUS_M`, más el hecho
    # de que los teléfonos del escenario son del rango reservado.
    # `p-001:+34...,p-002:+34...` — sustituye el teléfono de esas personas al cargar el
    # escenario. Los móviles reales de los ensayos viven aquí, nunca en un fichero versionado.
    phone_overrides: dict[str, str] = field(
        default_factory=lambda: _phone_map("PHONE_OVERRIDES")
    )
    # Lo mismo que `PHONE_OVERRIDES` pero para una lista larga, y con nombre además del
    # teléfono: una variable de entorno con 70 pares deja de ser editable a mano. Es un CSV
    # `person_id,name,phone` en un directorio ignorado por git (`data/private/`). Si el fichero
    # no existe no pasa nada: se cargan los nombres genéricos y los números del rango reservado.
    # `ROSTER_CSV` vacío NO desactiva el roster: cae al sitio por defecto. Desactivarlo es
    # borrar el fichero, que es lo que uno espera al no tener uno.
    roster_csv: Path = field(
        default_factory=lambda: Path(
            (os.getenv("ROSTER_CSV") or "").strip()
            or str(REPO_ROOT / "data" / "private" / "roster.csv")
        )
    )
    # El mismo CSV, pero entero dentro de una variable y en base64. Es la única forma de llevar
    # el roster a Railway: allí no hay disco donde dejar el fichero y subirlo al repo es
    # exactamente lo que `data/private/` evita. Se decodifica EN MEMORIA al arrancar; no se
    # escribe nada en el contenedor. El valor lo genera `python3 data/roster_secret.py`.
    #
    # Si además existe el fichero local, gana el fichero: la precedencia y su porqué están en
    # `loader._roster_source`.
    roster_b64: str = field(default_factory=lambda: os.getenv("ROSTER_B64", ""))
    # Ensayo con el enlace (`POST /people/register`): con `true`, solo suenan los teléfonos que
    # se registraron ellos mismos desde `/track`. Los del dataset quedan bloqueados aunque
    # `ALLOW_REAL_CALLS` esté encendido. No sustituye a la lista blanca que se quitó: es opt-in.
    register_only_calls: bool = field(default_factory=lambda: _bool("REGISTER_ONLY_CALLS", False))
    # `false`: el planner no llama ni manda SMS por su cuenta (rutas nuevas, convoyes, riesgo);
    # solo suena lo que el operador rodea en el mapa. Para ensayos donde el mando decide.
    auto_notify: bool = field(default_factory=lambda: _bool("AUTO_NOTIFY", True))
    # Llamadas simultáneas que se lanzan al rodear un círculo en Vigía: el tamaño del pool de
    # hilos que hace los POST. Es un TECHO, no un objetivo — `dispatcher` nunca abre más hilos
    # que personas hay en el círculo.
    #
    # Estaba en 8 y eso convertía "90 llamadas en paralelo" en once tandas de ocho, que es otra
    # cosa y se nota en el mapa: los puntos se encienden por grupos. El número que importa es
    # el de un ensayo con el grupo entero (~90), así que el techo va por encima. Si algo tiene
    # que ceder con 90 conversaciones a la vez, que sea la plataforma —y que se vea, porque un
    # 429 aterriza en el tablero como `failed` con su detalle—, no un `min()` nuestro.
    call_parallelism: int = field(default_factory=lambda: _int("CALL_PARALLELISM", 128))
    # Radio máximo que se acepta en /calls/dispatch: un círculo de 200 km no es una zona.
    call_max_radius_m: float = field(default_factory=lambda: _float("CALL_MAX_RADIUS_M", 20000.0))
    # Tope de llamadas por ráfaga. Sigue existiendo para que rodear el mapa entero de
    # sierra-culebra (300 personas) no lance 300 runs de golpe, pero estaba en 25 y cortaba en
    # seco un ensayo con el grupo: 65 de 90 salían como "fuera del tope", que es un fallo
    # nuestro disfrazado de decisión. Por encima de 90 y por debajo del mapa entero.
    call_max_batch: int = field(default_factory=lambda: _int("CALL_MAX_BATCH", 150))
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
    # El móvil que hace de «organismo oficial» cuando el agente usa `llamar_a_organismo_oficial`
    # en mitad de una llamada. El workflow NO lo elige ni se lo pregunta a nadie. Desde la v9 el
    # nodo lleva un número fijo y usa este solo si llega: sirve para cambiar el mando de la
    # demo sin tocar el workflow. Vacío = se queda el fijo del nodo.
    demo_org_phone: str = field(default_factory=lambda: _phone("DEMO_ORG_PHONE"))

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
            "roster_csv": (
                str(self.roster_csv)
                if self.roster_csv.is_file()
                else "sin fichero (nombres genéricos del escenario)"
            ),
            # El tamaño, nunca el contenido: esa variable son nombres y móviles de gente real.
            "roster_b64": (
                f"{len(self.roster_b64.strip())} caracteres (se decodifica en memoria)"
                if self.roster_b64.strip()
                else "sin variable"
            ),
            "demo_org_phone": (
                self.demo_org_phone
                if self.demo_org_phone
                else "VACÍO (el agente no podrá consultar a ningún organismo)"
            ),
            "auth": (
                "⚠️  CLAVE PÚBLICA (está en el repo: cámbiala)"
                if self.secret_is_public
                else "on"
                if self.hr_shared_secret
                else "OFF (HR_SHARED_SECRET vacío)"
            ),
            "webhook_happyrobot": "configurado" if self.hr_workflow_webhook else "sin configurar",
            "webhook_sms": (
                "configurado"
                if self.hr_sms_webhook
                else "sin configurar (los SMS se registran, no salen)"
            ),
            "state_jsonl": str(self.state_jsonl),
        }


settings = Settings()


def reload_settings() -> Settings:
    """Vuelve a leer el entorno. Solo se usa en tests."""
    global settings
    settings = Settings()
    return settings
