"""Punto de entrada del motor de escenario.

Dos formas de invocarlo, las dos válidas:

    # desde la raíz del repo (forma de módulo)
    backend/engine/.venv/bin/python -m engine.run --scenario backend/engine/scenarios/sierra-culebra.yaml

    # desde backend/engine/ (forma de script, la que usa `make engine`)
    cd backend/engine && .venv/bin/python run.py --scenario scenarios/sierra-culebra.yaml --time-scale 60

Regla de oro del componente: **arrancar sin la API delante no es un error**. En una demo en vivo
el orden de arranque se equivoca siempre, así que el motor espera, avisa con una línea clara y
sigue adelante; el cliente reintenta y entra en modo degradado él solo (ver `client.py`).
"""

from __future__ import annotations

import argparse
import os
import signal
import sys
from pathlib import Path


# --- bootstrap de import ---------------------------------------------------------------
# Ejecutado como script (`python run.py`) no hay paquete y los `from . import ...` de los
# módulos fallan. Metemos backend/ (el padre del paquete `engine`) en sys.path y usamos
# imports absolutos.
if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from engine.client import CrisisApiClient  # noqa: E402
from engine.clock import SimClock  # noqa: E402
from engine.scenario import Console, Scenario, ScenarioRunner  # noqa: E402

DEFAULT_API_BASE_URL = "http://localhost:8000"
HEALTH_WAIT_ATTEMPTS = 5
HEALTH_WAIT_SLEEP_S = 1.0


# --- entorno ----------------------------------------------------------------------------


def load_dotenv(path: Path) -> int:
    """Lector mínimo de `.env` (no hay python-dotenv en requirements.txt).

    No sobreescribe lo que ya venga del entorno real: la variable de la shell manda.
    """
    if not path.exists():
        return 0
    loaded = 0
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip().strip("'\"")
        if key and key not in os.environ:
            os.environ[key] = value
            loaded += 1
    return loaded


def repo_root() -> Path:
    """Raíz del repo: backend/engine/run.py -> backend/ -> raíz. Ahí vive el .env."""
    return Path(__file__).resolve().parents[2]


def default_scenario_path() -> Path:
    """`scenarios/<SCENARIO>.yaml`, relativo a este fichero (no al cwd)."""
    name = os.environ.get("SCENARIO", "sierra-culebra")
    return Path(__file__).resolve().parent / "scenarios" / f"{name}.yaml"


# --- CLI --------------------------------------------------------------------------------


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="engine.run",
        description="Motor de escenario: mueve la crisis por debajo del sistema.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "Ejemplos:\n"
            "  python run.py --scenario scenarios/sierra-culebra.yaml --time-scale 60\n"
            "  python run.py --dry-run --time-scale 0        # sin API, a toda velocidad\n"
            "  python run.py --from-min 26                   # ensayar desde el giro de viento\n"
        ),
    )
    p.add_argument(
        "--scenario",
        type=Path,
        default=None,
        help="guion YAML a ejecutar (por defecto scenarios/$SCENARIO.yaml)",
    )
    p.add_argument(
        "--time-scale",
        type=float,
        default=None,
        help="segundos simulados por segundo real. 60 = 1 min simulado/s. 0 = sin esperas",
    )
    p.add_argument("--api", default=None, help=f"URL base de la API (def. $API_BASE_URL o {DEFAULT_API_BASE_URL})")
    p.add_argument("--api-key", default=None, help="valor de x-api-key (def. $HR_SHARED_SECRET)")
    p.add_argument("--dry-run", action="store_true", help="no envía nada: imprime lo que enviaría")
    p.add_argument("--from-min", type=float, default=0.0, help="empieza en el minuto N (aplica lo anterior de golpe)")
    p.add_argument("--until-min", type=float, default=None, help="corta el guion en el minuto N")
    p.add_argument("--seed", type=int, default=None, help="semilla del azar (pavesas, gente sintética)")
    p.add_argument("--show-payloads", action="store_true", help="imprime el cuerpo de cada POST")
    p.add_argument("--no-reset", action="store_true", help="no llama a POST /reset al arrancar")
    p.add_argument("--no-wait", action="store_true", help="no espera a que la API responda antes de empezar")
    return p


# --- arranque ---------------------------------------------------------------------------


def wait_for_api(client: CrisisApiClient, console: Console, attempts: int = HEALTH_WAIT_ATTEMPTS) -> bool:
    """Sondea `GET /health`. Devuelve si respondió, pero NUNCA impide seguir.

    Requisito explícito del proyecto: el motor arranca aunque `backend/api/` no esté levantada.
    """
    if client.dry_run:
        return False
    # El sondeo hace sus propias vueltas: un intento por vuelta, para no multiplicar mensajes.
    max_attempts, log = client.max_attempts, client.log
    client.max_attempts, client.log = 1, lambda _t: None
    try:
        for attempt in range(1, attempts + 1):
            r = client.get("/health", channel="read")
            if r.ok:
                body = r.body if isinstance(r.body, dict) else {}
                console.write(
                    f"    API viva en {client.base_url} "
                    f"(state_version={body.get('state_version')}, people={body.get('people_count')})"
                )
                return True
            console.write(f"    esperando a la API ({attempt}/{attempts}): {r.error}")
            if attempt < attempts:
                client._sleeper(HEALTH_WAIT_SLEEP_S)  # el sleeper inyectable del cliente
    finally:
        client.max_attempts, client.log = max_attempts, log
        # El sondeo no debe dejar el cliente en modo degradado: los POST del guion empiezan
        # con sus reintentos completos, porque la API puede levantarse un segundo después.
        client.degraded = False
        client.consecutive_failures = 0
    console.write("")
    console.write(f"    !! LA API NO RESPONDE en {client.base_url}")
    console.write("       Arranco igual: el escenario avanza y cada POST se reintenta solo.")
    console.write("       Cuando levantes la API (`make api`) el motor se reengancha sin reiniciar.")
    console.write("       (si querías probar sin API, usa --dry-run)")
    console.write("")
    return False


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)

    load_dotenv(repo_root() / ".env")

    scenario_path = args.scenario or default_scenario_path()
    if not scenario_path.exists():
        # Comodidad: `make engine` hace `cd backend/engine`, pero alguien puede lanzarlo desde la raíz.
        alt = Path(__file__).resolve().parent / scenario_path
        if alt.exists():
            scenario_path = alt
        else:
            print(f"ERROR: no encuentro el guion '{scenario_path}'.", file=sys.stderr)
            print(
                "       Guiones disponibles: "
                + ", ".join(sorted(p.name for p in (Path(__file__).resolve().parent / "scenarios").glob("*.yaml")))
                or "       (ninguno en backend/engine/scenarios/)",
                file=sys.stderr,
            )
            return 2

    try:
        scenario = Scenario.load(scenario_path)
    except Exception as exc:  # guion mal escrito: el mensaje tiene que ser útil, no un traceback
        print(f"ERROR en el guion '{scenario_path}': {exc}", file=sys.stderr)
        return 2

    base_url = args.api or os.environ.get("API_BASE_URL") or DEFAULT_API_BASE_URL
    api_key = args.api_key or os.environ.get("HR_SHARED_SECRET") or None

    console = Console(show_payloads=args.show_payloads)
    if not api_key and not args.dry_run:
        console.write(
            "    AVISO: sin HR_SHARED_SECRET (ni --api-key). Si la API exige x-api-key "
            "devolvera 401. Ejecuta 'make env' y rellenalo."
        )

    if args.time_scale is not None:
        time_scale = args.time_scale
    elif scenario.settings.time_scale is not None:
        time_scale = scenario.settings.time_scale
    else:
        time_scale = 60.0

    if args.no_reset:
        scenario.settings.reset_on_start = False
    if args.seed is not None:
        scenario.settings.seed = args.seed

    client = CrisisApiClient(
        base_url=base_url,
        api_key=api_key,
        dry_run=args.dry_run,
        log=console.write,
    )
    if not args.no_wait:
        wait_for_api(client, console)

    clock = SimClock(time_scale=time_scale, starts_at=scenario.starts_at, start_sim_min=0.0)
    runner = ScenarioRunner(scenario, client, clock, console=console)

    # Ctrl-C en mitad de una demo no debe escupir un traceback.
    def _on_sigint(_sig, _frame):
        console.banner("interrumpido con Ctrl-C")
        console.write(f"    {client.summary()}")
        raise SystemExit(130)

    signal.signal(signal.SIGINT, _on_sigint)

    runner.run(from_min=args.from_min, until_min=args.until_min)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
