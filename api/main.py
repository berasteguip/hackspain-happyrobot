"""Arranque de la API de estado de crisis.

La API es el cerebro y la única fuente de verdad del sistema: el motor de escenario le manda lo que
pasa, HappyRobot le manda lo que dice la gente por teléfono, el dashboard la lee y la corrige, y
ella decide. Todo lo que decide queda escrito con un motivo en español en el `decision_log`.

Arrancar: `uvicorn main:app --port 8000` (o `python main.py`). Requiere Python 3.12+.
"""

from __future__ import annotations

import logging
import sys
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

import planner
from loader import load_scenario
from routers import calls, events, human, read
from settings import REPO_ROOT, settings
from state import state

# ------------------------------------------------------------------------------------------
# Logging: la consola se enseña en la demo, así que se lee de un vistazo.
# ------------------------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-5s %(name)-18s %(message)s",
    datefmt="%H:%M:%S",
    stream=sys.stdout,
)
logging.getLogger("httpx").setLevel(logging.WARNING)
log = logging.getLogger("crisis.api")

# Rutas que NO piden `x-api-key`: el latido, la documentación y los preflight del navegador.
PUBLIC_PATHS = {"/", "/health", "/docs", "/redoc", "/openapi.json", "/docs/oauth2-redirect", "/favicon.svg"}

# Rutas que un ciudadano abre desde el enlace del SMS. No pueden exigir `x-api-key`: la página
# corre en su móvil y cualquier secreto que le pasáramos sería legible en el código fuente. Se
# asume: quien tenga un enlace puede escribir una posición. El arreglo real es un token por
# persona en la URL, no un secreto compartido en el cliente.
PUBLIC_PREFIXES = ("/static", "/gps", "/dashboard", "/assets", "/positions", "/instructions/", "/api/locations")


@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("=" * 78)
    log.info("API de estado de crisis — arrancando")
    for clave, valor in settings.summary().items():
        log.info("  %-18s %s", clave, valor)
    resumen = load_scenario(state, settings.scenario)
    log.info("  escenario cargado   %s", resumen)
    decisiones = planner.run_planner(state, full=True)
    log.info(
        "  primera pasada del planner: %d decisiones · state_version=%d",
        len(decisiones),
        state.state_version,
    )
    if not settings.allow_real_calls:
        log.info("  ⚠️  ALLOW_REAL_CALLS=false → llamadas y SMS SIMULADOS (nadie recibe nada)")
    else:
        log.warning("  ☎️  ALLOW_REAL_CALLS=TRUE → se llamará a teléfonos DE VERDAD")
    log.info("=" * 78)
    yield
    log.info("API parada. El estado vivía en memoria: no queda nada que cerrar.")


app = FastAPI(
    title="Crisis State API — evacuación guiada en incendio",
    description=(
        "Estado vivo de la crisis, priorización, rutas y decisiones. "
        "Contrato: `docs/06-producto/03-contrato-de-datos.md`."
    ),
    version="1.0.0",
    lifespan=lifespan,
)

# CORS abierto: el dashboard y la página GPS se sirven desde otro puerto (y desde el móvil de
# alguien durante la demo). No hay datos reales que proteger en una hackathon.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def api_key_guard(request: Request, call_next):
    """`x-api-key` == `HR_SHARED_SECRET` (contrato §3).

    Si el secreto está vacío la puerta queda abierta: en la hackathon vale más que la demo arranque
    que una auth a medias. Se avisa en el log de arranque (`auth: OFF`).
    """
    ruta = request.url.path
    if (
        settings.hr_shared_secret
        and request.method != "OPTIONS"
        and ruta not in PUBLIC_PATHS
        and not ruta.startswith(PUBLIC_PREFIXES)
    ):
        if request.headers.get("x-api-key") != settings.hr_shared_secret:
            log.warning("401 %s %s (x-api-key inválida o ausente)", request.method, ruta)
            return JSONResponse(
                status_code=401,
                content={"ok": False, "error": "x-api-key inválida o ausente"},
            )
    return await call_next(request)


app.include_router(read.router)
app.include_router(events.router)
app.include_router(calls.router)
app.include_router(human.router)


# Un solo proceso sirve la API y las dos páginas: mismo origen, así que la página llama a
# `/positions` sin saber en qué dominio vive y no hace falta CORS ni config.js con URL absoluta.
for _ruta, _dir in (("/gps", "gps"), ("/dashboard", "dashboard")):
    _destino = REPO_ROOT / "web" / _dir
    if _destino.is_dir():
        app.mount(_ruta, StaticFiles(directory=_destino, html=True), name=_dir)
    else:
        log.warning("No encuentro %s; %s no se sirve.", _destino, _ruta)

# Vigía en la raíz: es la cara del puesto de mando. Va el último a propósito — Starlette casa
# las rutas en orden de registro, así que /state, /positions y compañía siguen ganando y solo
# lo que no es de la API cae en el SPA.
_VIGIA = REPO_ROOT / "apps" / "command-center" / "dist"
if _VIGIA.is_dir():
    app.mount("/", StaticFiles(directory=_VIGIA, html=True), name="vigia")
else:
    log.warning("No encuentro %s; la raíz no sirve Vigía (¿falta `npm run build`?).", _VIGIA)


@app.post("/sim/run", status_code=501, tags=["simulador"])
def sim_run(body: dict | None = None) -> JSONResponse:
    """Está en el contrato, pero **no lo implementa la API**.

    El simulador de variantes vive en `sim/` (grafo de carreteras, capacidad de los corredores).
    Este stub existe para que quien lo llame reciba un mensaje claro en vez de un 404 silencioso.
    """
    return JSONResponse(
        status_code=501,
        content={
            "ok": False,
            "error": "/sim/run no se implementa en api/: el simulador de variantes vive en sim/.",
            "state_version": state.state_version,
        },
    )


if __name__ == "__main__":  # pragma: no cover
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=False)
