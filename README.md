# hackspain-happyrobot · equipo router123

Sistema agéntico de **guiado individual de evacuación en incendios forestales**, para el track de
HappyRobot de HackSpain 2026. Luis (luismols / 34lumo) y Pablo (berasteguip).

> Sabemos dónde está cada persona y dónde está el fuego, y guiamos a cada una hasta que sale viva.

El CECOPI hoy ve el fuego pero no ve a la gente. La llamada masiva es el *onboarding*: saca a la
persona de casa y nos da su posición. El producto es el mapa de personas sobre el mapa del fuego, y
las tres cosas que salen de ahí y hoy no existen: la lista viva de casas sin contestar que recibe la
patrulla, los convoyes con coche guía, y la prioridad de medios aéreos decidida por dónde está la
gente y no solo por dónde está el fuego.

## Por dónde empezar a leer

| Documento | Qué es |
|---|---|
| `docs/reto-happyrobot.md` | El enunciado oficial. Fuente de verdad, se lee primero. |
| `docs/escenario-incendio.md` | La idea con el alcance cerrado, el guion de la demo y el backlog. |
| `docs/contrato-de-datos.md` | **Vinculante para todo el código**: entidades, API, fórmula de prioridad. |
| `docs/plataforma-happyrobot.md` | Qué expone la plataforma de verdad, con marcas de verificado. |
| `docs/research/` | Investigación de respaldo del pitch (datos reales, legal, modelos, competencia). |

## Componentes

```
engine/  motor de escenario: el incendio avanza y la situación cambia en runtime
  │      (POST /events/* con el perímetro que crece, el viento que gira, la carretera cortada)
  ▼
api/     estado de crisis: única fuente de verdad. Decide prioridad, rutas, convoyes,
  │      patrullas y prioridad aérea. Cada cambio deja una entrada con motivo en el decision_log.
  ├──────► web/dashboard/  puesto de mando: mapa, timeline de cambios, botones de intervención
  ├──────► web/gps/        la página del enlace que comparte la ubicación del vecino
  ├──────► sim/            simula la evacuación completa y elige el plan que pierde a menos gente
  └──◄──── HappyRobot      llamadas, SMS, Slack; el agente de voz consulta /instructions
data/    dataset sintético de 3 pueblos de Zamora (~120 casas), reproducible por semilla
```

## Arranque

Requiere **Python 3.12+** (el `python3` del sistema en un Mac es 3.9 y no sirve) y `uv`:

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

## Dos reglas que no se saltan

1. **Los datos son sintéticos y se declaran como tales.** Todos los teléfonos están en el rango
   reservado `+3460099xxxx` y el dashboard lleva una etiqueta visible. En una demo de emergencias
   esto no es opcional.
2. **`ALLOW_REAL_CALLS=false` por defecto.** El sistema simula el envío de llamadas y SMS y lo
   registra. La bandera se activa solo en el momento de la demo. Un bucle que llame de verdad a 120
   teléfonos arruina el proyecto y algo más.
