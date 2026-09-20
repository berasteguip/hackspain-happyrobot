# `api/` — Crisis State API

El **cerebro y la única fuente de verdad** del sistema de evacuación guiada. Todo lo demás habla con
ella: el motor de escenario (`engine/`) le manda lo que pasa, HappyRobot le manda lo que la gente
dice por teléfono, el dashboard (`web/`) la lee y la corrige, y ella decide **y escribe por qué**.

Contrato vinculante: [`docs/06-producto/03-contrato-de-datos.md`](../docs/06-producto/03-contrato-de-datos.md). Esta API no inventa
campos ni endpoints que no estén ahí.

## Lo que hace que no es un CRUD

1. **Prioriza sin datos completos.** La fórmula del contrato §4 incluye un factor de *incertidumbre*:
   lo que **no** se sabe SUBE la prioridad. Alguien de quien solo se sabe que existe pesa más que un
   vecino con coche y GPS.
2. **Estima el frente con decaimiento angular.** `minutes_to_front` no es distancia / velocidad: es
   distancia corregida por el ángulo respecto a la cabeza del fuego (`0.45 + 0.45·cosθ + 0.10·cos2θ`).
   Alguien a 3 km a favor del viento sale peor que alguien a 800 m en contra — eso está fijado en un
   test (`tests/test_fire.py`), porque es la tesis del proyecto.
3. **Resta antes de mandar a nadie al fuego.** Para cada casa sin contestar:
   `minutes_to_front − patrol_eta_min`. Si el margen es **negativo**, la patrulla no sale: se crea
   una aprobación pendiente y decide una persona.
4. **Forma convoyes.** Quien sale por el mismo corredor va junto con un coche guía; al resto se le
   dice *a quién seguir*, no una ruta distinta a cada uno.
5. **Todo cambio deja motivo en español.** `decision_log` con `trigger_event_id`, así que el timeline
   se lee como causa → consecuencia. Un evento raíz (perímetro nuevo, llamada, orden del mando) no
   tiene disparador; lo que sale detrás cuelga de él.

## Requisitos

**Python 3.12+** (usa `X | None`, `match`, y Pydantic v2). El `python3` del sistema en macOS suele ser
3.9 y **no sirve**. Con [`uv`](https://docs.astral.sh/uv/):

```bash
cd api
uv venv --python 3.12 .venv
uv pip install --python .venv/bin/python -r requirements.txt
```

## Arrancar

```bash
cd api
./.venv/bin/python -m uvicorn main:app --port 8000
# documentación interactiva: http://localhost:8000/docs
```

Configuración opcional en `api/.env` (plantilla en [`.env.example`](.env.example)). Sin `.env` arranca
en **modo seguro**: no llama a nadie, sin auth, rutas en línea recta.

### ⚠️ El interruptor que importa

`ALLOW_REAL_CALLS` es `false` por defecto. Con `false`, las llamadas y SMS se **simulan**: se
registran en el `decision_log`, devuelven éxito y **no sale una sola petición HTTP**. Un bucle del
planner sobre 120 teléfonos reales por accidente arruina el proyecto, así que la regla está probada
por los dos lados en `tests/test_notify.py` (apagado no sale nada; encendido sí sale).
`GET /health` delata en qué modo está esta instancia.

## Tests

```bash
cd api
./.venv/bin/python -m pytest -q      # 50 passed
```

Son herméticos: `conftest.py` fija el entorno antes de importar `settings` (nunca llama de verdad,
rutas en línea recta, escenario `tests/fixtures/test-mini.json`, JSONL de test aparte).

## Endpoints

### Lectura (dashboard)

| Endpoint | Para qué |
|---|---|
| `GET /health` | Latido + `allow_real_calls` + recuento. No pide `x-api-key`. |
| `GET /state` | Escenario completo. |
| `GET /state/diff?since_version=N` | **Solo lo que cambió** + decisiones desde `N`. Es el long-poll del dashboard. |
| `GET /queue?limit=100` | Personas por `priority_score` desc, con `reason` y `score_breakdown`. `count` = total en cola, `returned` = filas en esta respuesta. |
| `GET /houses/no-answer` | La lista viva de la patrulla, ordenada por margen. |
| `GET /sectors/air-priority` | Sectores ordenados para los medios aéreos, con motivo. |
| `GET /people/{id}` · `GET /houses/{id}` | Ficha. 404 si no existe (no se inventa nada). |
| `GET /instructions/{id}` | La frase que se le dice a esa persona (`say_this`), sin ids ni coordenadas. |
| `GET /decisions?limit=N` | El `decision_log`. |
| `GET /stats` | Contadores para el pitch. |

### Eventos del mundo (`engine/`, página GPS)

| Endpoint | Efecto |
|---|---|
| `POST /events/fire` | Perímetro nuevo. Es el evento que lo mueve todo. |
| `POST /events/road-closure` | Carretera cortada: invalida las rutas que la usaban. |
| `POST /events/exit-threatened` | Una salida deja de valer: se reasigna a quien iba allí. |
| `POST /positions` | Punto GPS → trayectoria → ¿va hacia el fuego? |
| `POST /reset` | Recarga el escenario. `state_version` **no** vuelve a cero (el dashboard hace long-poll con él). |

### HappyRobot (llamadas)

| Endpoint | Efecto |
|---|---|
| `POST /calls/started` | La llamada está en curso. |
| `POST /calls/outcome` | Lo que la llamada dejó: datos, negativa, o silencio. Un vecino mencionado se convierte en casa + persona nuevas. |
| `POST /calls/observation` | **El camino de vuelta**: el nodo `Observación` del workflow postea aquí al colgar. Envuelve a `/calls/outcome` y además guarda el color del triaje (`rojo`/`naranja`/`amarillo`/`verde`), que es lo que colorea a la persona en el mapa. |

### Humano al mando

| Endpoint | Efecto |
|---|---|
| `POST /human/override` | Pincha un campo. **Sticky**: el planner no lo revierte. |
| `POST /human/approve` | Autoriza o rechaza una acción pendiente (mandar una patrulla con margen negativo). |

`POST /sim/run` está en el contrato pero **devuelve 501 a propósito**: el simulador de variantes vive
en `sim/`, fuera de esta API. Existe para que quien lo llame lea el motivo en vez de un 404.

## Secuencia verificada (salida real, escenario `sierra-culebra`)

Copiar y pegar con el servidor arrancado. Esto es la traza real, no un ejemplo inventado.

```bash
# 1. ¿está viva y puede llamar de verdad?
curl -s localhost:8000/health
# {"ok":true,"state_version":609,"people_count":120,"people":120,"houses":120,
#  "uptime_s":6.6,"scenario":"sierra-culebra","allow_real_calls":false}

# 2. escenario limpio
curl -s -X POST localhost:8000/reset
# ok=true  state_version=1219  decisions=242

# 3. el estado
curl -s localhost:8000/state
# state_version 1219 | people 120 | houses 120 | sectors 6 | patrols 3

# 4. entra una llamada: Mercedes contesta y cuenta cosas que el censo no sabía
curl -s -X POST localhost:8000/calls/outcome -H 'Content-Type: application/json' -d '{
  "run_id":"run-demo-1","person_id":"p-001","answered":true,"duration_s":82,
  "extracted":{"people_at_home":2,"mobility":"reduced","has_car":false,"has_smartphone":true,
    "consent_position":true,"will_evacuate":true,
    "neighbors_mentioned":[{"name":"Josefa","address":"Camino del Horno 9","at_home":true}],
    "vulnerable_people":[{"description":"vive sola, 88 años"}]},
  "agent_notes":"Se oye el helicóptero desde la casa."}'
```

8 decisiones, cada una con su motivo y su causa:

```
person_status_changed | trigger None      | Mercedes Cid CONTESTÓ: 2 personas en casa, movilidad reduced, acepta compartir posición
person_status_changed | trigger ev-000243 | Calle de la Iglesia 2, Losacio contestó: 1 persona(s) vulnerable(s) declarada(s)
person_located        | trigger ev-000243 | Casa NUEVA h-121 (Camino del Horno 9) descubierta porque Mercedes Cid mencionó a un
                                            vecino. Sin teléfono: va directa a la lista de la patrulla.
person_located        | trigger ev-000245 | Josefa entra en la cola: mencionada por Mercedes Cid sin teléfono. Estado desconocido,
                                            así que la incertidumbre le SUBE la prioridad.
person_status_changed | trigger ev-000246 | Mercedes Cid pasa a at_risk: Su trayectoria entra en el cono de avance del fuego.
exit_reassigned       | trigger ev-000246 | Josefa → Alcañices (CEIP Virgen de la Salud / IES Aliste) (x-b): 25,6 km por N-122, 34 min.
route_recalculated    | trigger ev-000246 | Ruta a Alcañices: 25,6 km / 34 min por N-122 (straight). No tenía ruta.
patrol_assigned       | trigger ev-000246 | Guardia Civil Tábara 1 → Camino del Horno 9 (puesto 1 de la lista). 366 min hasta el
                                            frente, patrulla a menos de 1 min: 366 min de margen.
```

Una llamada de 82 segundos ha creado una casa y una persona que **no estaban en el censo** y ha
mandado una patrulla a la puerta de una mujer de 88 años sin teléfono.

```bash
# 5. llega su posición GPS
curl -s -X POST localhost:8000/positions -H 'Content-Type: application/json' \
  -d '{"person_id":"p-001","lat":41.716,"lon":-6.034,"accuracy_m":11}'
# person_located     | trigger None      | Mercedes Cid se ha movido 756 m, rumbo 44°
# route_recalculated | trigger ev-000252 | Ruta a Alcañices: 26,1 km / 35 min por N-122 (straight).
# ficha: status=moving, position_source=gps, minutes_to_front=391.1

# 6. el escenario se mueve: el frente avanza hacia ella (rumbo 35°, 2600 m/h)
curl -s -X POST localhost:8000/events/fire -H 'Content-Type: application/json' -d '{
  "perimeter":{"type":"Polygon","coordinates":[[[-6.11,41.66],[-6.03,41.66],[-6.03,41.70],
                                               [-6.11,41.70],[-6.11,41.66]]]},
  "wind":{"direction_deg":229.6,"speed_kmh":52.0,"gusts_kmh":78.0},
  "spread_rate_mh":2600.0,"head_bearing_deg":34.6}'
# fire_updated          | trigger None      | Perímetro actualizado: cabeza rumbo 35° a 2600 m/h.
#                                             2 personas a 20 min o menos del frente.
# person_status_changed | trigger ev-000255 | Mercedes Cid vuelve a ruta segura: ya no va hacia el cono.
```

`minutes_to_front` de Mercedes pasa de **391,1 → 47,7** con un solo perímetro. El resto de los 121
`minutes_to_front` se recalculan sin ensuciar el timeline (son campos derivados: suben
`state_version` pero no escriben decisión).

```bash
# 7. la cola, ordenada y con motivo
curl -s localhost:8000/queue
# count 121 · returned 100
# 1  Pilar Vega      score 0.3847 | 322 min hasta el frente; pesa sobre todo movilidad (+0.20),
#                                   incertidumbre (+0.15) · dato incierto: la ignorancia sube la prioridad
# 3  Pilar Martín    score 0.3845 | 5 min hasta el frente; ...

# 8. el diff: solo lo que cambió
curl -s "localhost:8000/state/diff?since_version=1240"
# since 1240 -> 1612 | fire: sí | people 121 | houses 121 | decisiones 2

# y las vistas operativas
curl -s localhost:8000/houses/no-answer
# #1 h-121 Camino del Horno 9 | margen 32.6 | 33 min hasta el frente, patrulla a menos de 1 min
curl -s localhost:8000/sectors/air-priority
# #1 Sector 4 — Ferreruela de Tábara este | 75 personas localizadas dentro, 77 casas sin contactar,
#                                           27 vulnerable(s), frente a 143 min
curl -s localhost:8000/instructions/p-001
# say_this: "Mercedes, no salga andando. Quédese junto a la puerta de la calle con la luz encendida:
#            va alguien a recogerle y le llevamos a un sitio seguro."
```

## La fórmula de prioridad se cambió porque se midió

La traza del paso 7 destapó un problema **de la fórmula del contrato**, no de la implementación. Está
corregido en el contrato §4 y en `priority.py`; queda escrito aquí porque el razonamiento es lo que
defiende el criterio "prioridad cuando todo es urgente" delante del jurado.

**Lo que estaba mal.** La urgencia era `1 / max(minutes_to_front, 1)` con peso 0.45. Con horizontes de
horas ese término se **satura cerca de cero**: en la cola de 121 personas aportaba entre **0.0012 y
0.0978**, mientras que la movilidad aporta entre 0.0 y 0.20. Medido: alguien a **4,6 min** del frente
quedaba **empatado en el puesto 3** con dos personas a **más de 5 horas** (0.3845 vs 0.3847). La
movilidad decidía por encima de la urgencia en todo el rango realista. Un jurado que mire la cola lo ve.

**Lo que hay ahora.** `exp(-minutes_to_front / 30)`, monótona y sin meseta de empates. Aporta 0.435 a
1 min, 0.381 a 5, 0.273 a 15, 0.166 a 30 y 0.061 a 60. La separación entre 5 minutos y 5 horas pasa de
0.0885 a **0.3809**, que ya es más que un escalón entero de movilidad.

**Comprobado en vivo, no solo en un test.** Corriendo el guion completo del motor contra la API, la
cola resultante ordena así:

```
1. 0.6852  mtf=0,1 min   reduced    urg=0.449
2. 0.4567  mtf=29,2 min  reduced    urg=0.170
3. 0.4494  mtf=17,7 min  car        urg=0.249   <- adelanta a los inmóviles a 58 min
4. 0.4480  mtf=58,2 min  immobile   urg=0.065
```

La fila 3 es la prueba: una persona con coche y sin ninguna vulnerabilidad adelanta a tres personas
inmóviles porque el fuego le llega 40 minutos antes. Con la fórmula vieja no la adelantaba nunca.
Dos tests lo fijan (`tests/test_priority.py`), uno de ellos comparando la separación contra el peso de
la movilidad, para que nadie pueda reintroducir una fórmula que se sature sin que salte el suite.

## Cómo está montado

```
main.py        arranque, CORS, guard de x-api-key, /sim/run (501)
settings.py    variables de entorno (todas con default seguro)
models.py      entidades del contrato (Pydantic v2) + DecisionType
state.py       CrisisState: singleton en memoria, lock, mutate() → decision_log + state_version
loader.py      carga el escenario JSON de data/scenarios/
fire.py        perímetro, cono de avance, minutes_to_front con decaimiento angular
geo.py         haversine, punto-en-polígono, polyline, rumbos
routing.py     rutas (straight | osrm | valhalla) con zona prohibida
priority.py    la fórmula §4 y el orden de las casas (margen patrulla vs fuego)
planner.py     el que decide: salidas, rutas, convoyes, patrullas, prioridad aérea
notify.py      llamadas/SMS vía HappyRobot — con el freno de ALLOW_REAL_CALLS
routers/       read.py · events.py · calls.py · human.py
tests/         50 tests (fire, priority, planner, notify, api de punta a punta)
```

Reglas duras: el estado vive **en memoria** (reiniciar = escenario limpio), `api/state.jsonl` es
**solo auditoría** append-only (nunca se lee para recuperar), y **toda** mutación pasa por
`state.mutate()` — ninguna ruta toca los diccionarios de entidades directamente.
