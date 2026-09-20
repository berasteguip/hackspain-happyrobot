# hackspain-happyrobot · equipo router123

Repo del equipo **router123** en **HackSpain 2026**, track **HappyRobot**. Luis (luismols / 34lumo),
Pablo (berasteguip), Mateo y Allan.

Sistema agéntico de **guiado individual de evacuación en incendios forestales** para Protección Civil.

> Sabemos dónde está cada persona y dónde está el fuego, y guiamos a cada una hasta que sale viva.

El CECOPI hoy ve el fuego pero no ve a la gente. La llamada masiva es el *onboarding*: saca a la
persona de casa y nos da su posición. El producto es el mapa de personas sobre el mapa del fuego y
lo que sale de ahí: rutas individuales que se recalculan, convoyes con coche guía, la lista viva de
casas sin contestar que recibe la patrulla, y la prioridad de medios aéreos decidida por dónde está
la gente. El motor de la demo son **300 vecinos simulados con personalidad propia** que conversan
con el agente de HappyRobot, más unas pocas llamadas de voz reales.

## Empieza aquí

| Si eres… | Lee |
| --- | --- |
| Persona nueva en el equipo | [`docs/README.md`](docs/README.md) (índice) y [`docs/01-evento/02-reto-happyrobot.md`](docs/01-evento/02-reto-happyrobot.md) (enunciado oficial) |
| Un agente de IA | [`AGENTS.md`](AGENTS.md) (reglas) y [`CLAUDE.md`](CLAUDE.md) (estado del proyecto) |
| Quien decide el producto | [`docs/06-producto/02-escenario-incendio.md`](docs/06-producto/02-escenario-incendio.md) y [`docs/06-producto/01-vigia.md`](docs/06-producto/01-vigia.md) |
| Quien escribe código | [`docs/06-producto/03-contrato-de-datos.md`](docs/06-producto/03-contrato-de-datos.md) (**vinculante**: entidades, API, prioridad) |
| Quien construye el agente de HappyRobot | [`docs/06-producto/04-brief-equipo-agente.md`](docs/06-producto/04-brief-equipo-agente.md) |
| Quien toca la plataforma | [`docs/02-happyrobot/03-workspace-y-limites-verificados.md`](docs/02-happyrobot/03-workspace-y-limites-verificados.md) (qué expone de verdad, verificado) |

## Componentes

```
engine/  motor de escenario: el incendio avanza y la situación cambia en runtime
  │      (POST /events/* con el perímetro que crece, el viento que gira, la carretera cortada)
  ▼
api/     estado de crisis: única fuente de verdad. Decide prioridad, rutas, convoyes,
  │      patrullas y prioridad aérea. Cada cambio deja una entrada con motivo en el decision_log.
  ├──────► web/dashboard/       puesto de mando (MapLibre + OSM): mapa, timeline, intervención
  ├──────► apps/command-center/ CECOP (Vite + React + Mapbox), frontend de router
  ├──────► web/gps/             la página del enlace que comparte la ubicación del vecino
  ├──────► sim/                 simula la evacuación completa y elige el plan que pierde a menos gente
  └──◄──── HappyRobot           conversaciones con los 300 vecinos, llamadas, SMS, Slack
data/    dataset sintético de ~120 casas / 300 personas, reproducible por semilla
prompts/ guiones del agente de HappyRobot (onboarding, rerruta, patrulla, extracción) y guion de la demo
docs/    base de conocimiento (ver docs/README.md); docs/_inbox/ es material crudo
```

Hay dos frontends (`web/dashboard` y `apps/command-center`). Unificarlos es una decisión pendiente
del equipo; hasta entonces ambos consumen la misma `api/`.

## Arranque

Backend y dashboard MapLibre requieren **Python 3.12+** (el `python3` del sistema en un Mac es 3.9) y `uv`:

```bash
brew install uv && uv python install 3.12
make install        # venv y dependencias de cada componente
make env            # crea .env desde .env.example — rellénalo
make data           # genera y valida el dataset sintético
make test           # tests de todos los componentes
```

Luego, una pestaña por proceso:

```bash
make api            # :8000  estado de crisis
make dashboard      # :8080  puesto de mando
make engine         #        empieza a moverse el escenario
```

`make help` lista todo. `make demo` recuerda la secuencia del día del pitch.

CECOP (Mapbox):

```bash
cd apps/command-center
npm install
npm run dev
```

Hace falta un token público de Mapbox. La app lo pide al abrir si no está en `.env`.

## Reglas que no se saltan

1. **Los datos son sintéticos y se declaran como tales.** Todos los teléfonos están en el rango
   reservado `+3460099xxxx` y el dashboard lleva una etiqueta visible.
2. **`ALLOW_REAL_CALLS=false` por defecto.** El sistema simula el envío de llamadas y SMS y lo
   registra. La bandera se activa solo en el momento de la demo, con allowlist explícita de teléfonos.
3. **Todo lo que aprendamos se escribe en `docs/`, con fuente y fecha.** Lo que solo está en el
   chat, no existe.
