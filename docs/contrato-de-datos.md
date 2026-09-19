# Contrato de datos y API — fuente de verdad para todos los componentes

> Escrito el 19 sep 2026 como contrato compartido antes de construir en paralelo. **Ningún componente
> inventa campos.** Si algo falta aquí, se añade aquí primero y luego se implementa.
> Nombres de campo en inglés, explicaciones en español (convención del repo).

## 0. Arquitectura y quién escribe qué

```
motor de escenario (engine/)  ──POST /events/*──────┐
página GPS (web/gps/)         ──POST /positions─────┤
HappyRobot workflows          ──POST /calls/outcome─┼──►  API estado de crisis (api/)
                              ◄──GET  /instructions─┤         │  estado en memoria + JSONL append-only
dashboard (web/dashboard/)    ◄──GET  /state,/diff──┘         │
simulador (sim/)              ◄──GET  /state, POST /sim/run───┘
```

Una sola fuente de verdad en runtime: el proceso de `api/`. Twin de HappyRobot se usa como espejo para
que los agentes de voz consulten sin salir de la plataforma, pero **el cálculo vive en `api/`**.

> ⚠️ **Dos límites de plataforma verificados** (`docs/research/happyrobot-api.md`) que condicionan este
> diagrama, y conviene tenerlos claros antes de escribir código contra ellos:
> 1. **El Python Sandbox no tiene red saliente** (lista blanca de módulos confirmada: `math, datetime,
>    pytz, re, dateutil, random, collections, json, _strptime, time, base64`). O sea que `requests` no
>    funciona ahí y **ningún nodo de Python puede llamar a nuestra API**. Todo lo que salga de la
>    plataforma hacia nosotros va por nodos `webhook.*`. Esto refuerza la decisión de que el cálculo
>    viva en `api/`: en el Sandbox no cabía.
> 2. **Twin no tiene API REST pública confirmada fuera de un workflow** (se accede por nodos
>    `twin.read`/`twin.write` o por su MCP). Así que Twin sirve como espejo *para los agentes*, pero
>    el dashboard **lee de `api/`, nunca de Twin**. Si Twin resulta inaccesible desde fuera, no se cae
>    nada: es espejo, no fuente.

Regla de oro: el estado solo cambia por un evento con motivo. Todo cambio escribe una entrada en el
`decision_log`, y el dashboard muestra el diff. Esto es literalmente el criterio "Adaptación" de la
rúbrica, así que no es opcional.

## 1. Convenciones transversales

| Cosa | Regla |
|---|---|
| Tiempos | ISO-8601 con zona, UTC (`2026-09-19T17:52:00Z`). El dashboard traduce a hora local. |
| Coordenadas | `lat`, `lon` en grados decimales WGS84. Siempre en ese orden en objetos JSON. |
| Geometrías | GeoJSON puro (`Polygon`, `LineString`) con orden `[lon, lat]` (spec GeoJSON). Ojo a la inversión. |
| IDs | prefijo + guion + número: `p-001` persona, `h-001` casa, `x-a` salida, `s-1` sector, `c-1` convoy, `pt-1` patrulla, `ev-000001` evento. |
| Distancias | metros (`_m`). Velocidades: km/h (`_kmh`) para viento/coches, m/h (`_mh`) para avance del fuego. |
| Tiempos calculados | minutos en float (`minutes_to_front`), segundos en int para rutas (`duration_s`). |
| Teléfonos | E.164, siempre con prefijo país (`+34600990012`). **Todo teléfono del repo va en el rango reservado `+3460099xxxx`**, incluidos ejemplos, fixtures de test y datos de arranque. Nunca un prefijo geográfico real como `+34980` (Zamora): con `ALLOW_REAL_CALLS=true` eso marca a una persona. |
| Nulos | Un campo no calculado todavía es `null`, nunca `0`. `0` significa cero de verdad. |
| Versión de estado | `state_version` entero que sube en cada mutación. El dashboard hace long-poll con él. |

## 2. Entidades

### 2.1 `Person` — una persona (o núcleo familiar) a la que hay que sacar

```json
{
  "id": "p-001",
  "house_id": "h-012",
  "name": "Antonio Prieto",
  "phone": "+34600990012",
  "lat": 41.8203, "lon": -6.0114,
  "position_source": "gps",
  "position_updated_at": "2026-09-19T17:41:03Z",
  "trajectory": [{"lat": 41.8199, "lon": -6.0121, "t": "2026-09-19T17:39:00Z"}],
  "heading_deg": 47.0,
  "speed_kmh": 38.0,
  "household_size": 3,
  "mobility": "car",
  "seats_free": 2,
  "has_smartphone": true,
  "status": "moving",
  "sector_id": "s-2",
  "assigned_exit_id": "x-a",
  "assigned_route": {
    "polyline": "encoded...", "distance_m": 7400, "duration_s": 640,
    "updated_at": "2026-09-19T17:40:00Z", "source": "osrm"
  },
  "convoy_id": "c-1",
  "convoy_role": "leader",
  "minutes_to_front": 26.5,
  "priority_score": 0.82,
  "last_instruction": {
    "text": "Sal por la ZA-P-2434 hacia Tábara. No cojas la N-631.",
    "sent_at": "2026-09-19T17:40:05Z", "channel": "sms"
  },
  "consent_position": true,
  "call_attempts": 1,
  "notes": "Tiene sitio para 2 vecinos más."
}
```

`position_source`: `declared` (dicho por teléfono) · `gps` (página del enlace) · `inferred` (última
conocida + rumbo). **Un punto `declared` nunca se pinta con la misma confianza que un `gps`**: el
dashboard lo dibuja con borde discontinuo. El jurado va a preguntar por esto.

`mobility`: `car` · `walking` · `reduced` (anda despacio, necesita que alguien la lleve) ·
`immobile` (encamada, no sale sin ambulancia o vecino).

⚠️ **`mobility` en `reduced`/`immobile` es probablemente dato de salud** en el sentido del art. 4.15 del
RGPD, y por tanto categoría especial del art. 9, no dato ordinario. Consecuencia para quien implemente:
ese campo no se pinta en el mapa junto al nombre sin más, no sale en logs de depuración, y si algún día
esto fuese producto necesitaría acceso restringido y base jurídica propia documentada. Detalle en
`docs/escenario-incendio.md` §15.2.

`seats_free` son los asientos libres que la persona declara en la llamada. Es el campo que hace posible
un convoy: sin él, "tiene sitio para dos vecinos" se queda en `notes` y ningún algoritmo lo puede usar.
`null` mientras no lo haya dicho, `0` si dice que va lleno — y ahí la distinción nulo/cero del §1 importa
de verdad, porque a quien no ha contestado todavía se le puede preguntar.

`status` (máquina de estados, transiciones permitidas):

```
unknown ──llamada sin respuesta──► no_answer ──2º intento fallido──► unreachable
   │                                   │                                 │
   │                                   └──contesta──┐                    └──patrulla la encuentra──┐
   └──contesta────────────────────────────────────► contacted ──se mueve──► moving ──llega──► safe
                                                          │                    │
                                                          └──se niega a salir──► refusing
                                                                               │
                                                        moving ──se para 5 min o va hacia el fuego──► at_risk
```

`refusing` y `at_risk` no son adornos: son las dos razones por las que una evacuación real falla, y
cada una dispara una acción distinta (a `refusing` se le vuelve a llamar con otro guion; a `at_risk`
se le llama **en el acto**).

### 2.2 `House` — la unidad que la patrulla visita

```json
{
  "id": "h-012", "address": "Calle Mayor 4, Losacio", "village": "Losacio",
  "lat": 41.8203, "lon": -6.0114, "phone": "+34600990012",
  "residents_expected": 3, "vulnerable": true, "vulnerability_reason": "teleasistencia",
  "sector_id": "s-2",
  "call_attempts": 2, "last_call_at": "2026-09-19T17:38:00Z", "answered": false,
  "status": "no_answer",
  "minutes_to_front": 18.0,
  "assigned_patrol_id": "pt-1",
  "patrol_eta_min": 11.0,
  "priority_rank": 3
}
```

`status`: `pending` · `calling` · `answered` · `no_answer` · `cleared_by_patrol` · `empty` (la
patrulla confirma que no vive nadie) · `occupants_refuse`.

La lista viva de la sección 4.1 del escenario es exactamente `houses` con `status == "no_answer"`
ordenada por `priority_rank`, que se calcula con `minutes_to_front` **menos** `patrol_eta_min`: una
casa a la que la patrulla no llega antes que el fuego baja de prioridad, porque mandar allí a la
patrulla es matarla. Esa resta es la decisión difícil del criterio "Prioridad".

### 2.3 `Fire` — el frente

```json
{
  "perimeter": {"type": "Polygon", "coordinates": [[[-6.05,41.80],[-6.02,41.80],[-6.02,41.83],[-6.05,41.83],[-6.05,41.80]]]},
  "wind": {"direction_deg": 225, "speed_kmh": 34, "gusts_kmh": 52},
  "spread_rate_mh": 1800,
  "head_bearing_deg": 45,
  "cone_half_angle_deg": 30,
  "updated_at": "2026-09-19T17:40:00Z",
  "history": [{"t": "2026-09-19T17:20:00Z", "perimeter": {"...": "..."}}]
}
```

`wind.direction_deg` es **de dónde viene** el viento (convención meteorológica). `head_bearing_deg`
es **hacia dónde** avanza la cabeza del fuego. Son casi opuestos y confundirlos invierte la demo
entera; por eso van los dos campos explícitos en vez de calcular uno del otro.

`cone_half_angle_deg` define el cono de avance: el sector circular con vértice en la cabeza del
fuego, orientado a `head_bearing_deg`, de semiángulo 30°. Si la trayectoria de una persona entra en
ese cono, se le llama. Ese es el geofence de la sección 3 del escenario.

### 2.4 `SafeZone` — zona de salida

```json
{
  "id": "x-a", "name": "Tábara (CRA León Felipe)", "lat": 41.82611, "lon": -5.95889,
  "capacity": 400, "occupancy": 86, "status": "open",
  "access_roads": ["ZA-P-2434"], "distance_to_fire_m": 9200
}
```

Coordenadas y carreteras son las reales de la zona (`docs/research/geografia-zona.md`), no inventadas:
la **ZA-P-2434** es el único acceso provincial a Tábara desde los pueblos del escenario, y por eso
cerrarla los aísla aunque estén a menos de 15 km. La otra salida es Alcañices por la N-122.

`status`: `open` · `filling` (>80% capacidad) · `threatened` (el fuego a menos de 3 km o el cono
apunta a ella) · `closed`. Que una zona de salida pase a `threatened` es el evento más brutal del
motor de escenario, porque invalida a la vez todas las rutas que van allí.

### 2.5 `RoadClosure`, `Sector`, `Convoy`, `Patrol`

```json
{"id": "rc-1", "road_name": "N-631", "geometry": {"type":"LineString","coordinates":[[-6.04,41.81],[-6.01,41.84]]},
 "reason": "humo, visibilidad nula", "since": "2026-09-19T17:35:00Z", "source": "guardia_civil",
 "status": "closed", "reopened_at": null}

{"id": "s-2", "name": "Sector 2 — Losacio norte",
 "polygon": {"type":"Polygon","coordinates":[["..."]]},
 "people_inside": 8, "people_unknown": 2, "vulnerable_inside": 1,
 "minutes_to_front": 18.0, "air_priority_rank": 1,
 "air_priority_reason": "8 personas dentro, 1 vulnerable, frente a 18 min"}

{"id": "c-1", "exit_id": "x-a", "leader_person_id": "p-001",
 "member_ids": ["p-001","p-004","p-011"], "vehicle_description": "Seat León blanco",
 "route": {"polyline": "...", "distance_m": 7400, "duration_s": 640},
 "status": "forming", "formed_at": null, "cohesion_ok": true}

{"id": "pt-1", "name": "Guardia Civil Tábara 2", "lat": 41.8501, "lon": -5.9902,
 "assigned_house_ids": ["h-012","h-031"], "status": "en_route", "channel": "+34600990900"}
```

`RoadClosure.status`: `closed` · `reopened`. Una carretera se reabre (el humo se va, entra contraflujo),
y eso invalida rutas igual que cerrarla, así que es un estado y no un borrado. `reopened_at` es `null`
mientras siga cerrada. **Una carretera reabierta nunca se elimina del estado**: el `decision_log` tiene
que poder explicar por qué una ruta cambió dos veces.

`Patrol.status`: `standby` (en el cuartel, sin casa asignada) · `en_route` · `on_scene` · `unavailable`.
`standby` es el estado inicial de las tres patrullas del dataset, no un error.

`Convoy.status`: `forming` · `moving` · `arrived` · `broken` (el guía se desvió o se paró →
el sistema llama). `cohesion_ok` es `false` cuando un miembro se separa más de 1,5 km del guía.

### 2.6 `DecisionLogEntry` — por qué el sistema hizo lo que hizo

```json
{
  "id": "ev-000123", "t": "2026-09-19T17:40:02Z",
  "type": "route_recalculated",
  "subject_type": "person", "subject_id": "p-001",
  "before": {"assigned_exit_id": "x-b"}, "after": {"assigned_exit_id": "x-a"},
  "reason": "El frente entró en la N-631 (cono de avance a 45°). Salida x-b a 11 min del frente.",
  "trigger_event_id": "ev-000120",
  "actor": "system",
  "approved_by": null,
  "notified": [{"person_id": "p-001", "channel": "call", "at": "2026-09-19T17:40:05Z"}]
}
```

`type` (cerrado): `fire_updated` · `road_closed` · `road_reopened` · `person_located` ·
`person_status_changed` · `route_recalculated` · `exit_reassigned` · `exit_status_changed` ·
`entity_created` · `convoy_formed` · `convoy_broken` · `convoy_regrouped` ·
`house_escalated_to_patrol` · `patrol_assigned` · `air_priority_changed` · `call_placed` ·
`sms_sent` · `human_override` · `approval_requested` · `approval_granted` · `plan_discarded`.

`actor`: `system` · `human` · `agent` (el agente de voz decidió en conversación). Tres actores
distintos y trazables es la mitad del criterio "Control".

Tres reglas sobre el log que salieron de construir la API contra este contrato:

- **`entity_created`** es el tipo para cuando un `neighbors_mentioned` hace aparecer una `House` o una
  `Person` que no existía. Es el evento más vistoso de la demo (30 llamadas → 100 números) y necesitaba
  tipo propio: reutilizar `person_located` habría mentido sobre lo que pasó.
- **`exit_status_changed`** cubre la transición `open → filling → threatened → closed` de una `SafeZone`.
  Sin él, el evento más brutal del motor de escenario no dejaba rastro en el timeline.
- **Una entrada puede no tener sujeto.** `subject_type` admite `"system"` con `subject_id: null` para
  registrar algo que no muta una entidad (un plan descartado, un recálculo global). El estado solo cambia
  por un evento con motivo, pero no todo evento con motivo cambia una entidad.

## 3. API HTTP (`api/`, FastAPI, puerto 8000)

Autenticación: header `x-api-key` con el valor de `HR_SHARED_SECRET`. En la demo un secreto en `.env`
compartido con HappyRobot. Sin auth no se puede aceptar webhooks de la plataforma.

### Lectura (dashboard, simulador, tools del agente)

| Método | Ruta | Devuelve |
|---|---|---|
| GET | `/state` | snapshot completo: `{state_version, t, people, houses, fire, safe_zones, road_closures, sectors, convoys, patrols}` |
| GET | `/state/diff?since_version=N` | solo lo que cambió + entradas de `decision_log` desde N. Es lo que alimenta el timeline. |
| GET | `/queue` | personas ordenadas por `priority_score` desc, con el motivo de cada posición |
| GET | `/houses/no-answer` | lista viva para la patrulla, ordenada por `priority_rank` |
| GET | `/sectors/air-priority` | sectores ordenados por prioridad de descarga aérea, con motivo |
| GET | `/people/{id}` | una persona |
| GET | `/instructions/{person_id}` | **tool del agente de voz**: `{instruction, exit_name, route_summary, convoy, urgency, minutes_to_front, say_this}`. `say_this` es la frase literal, ya redactada, para que el TTS no improvise en algo que puede matar a alguien. |
| GET | `/health` | `{ok: true, state_version, people_count, uptime_s}` |

### Escritura

| Método | Ruta | Cuerpo | Quién llama |
|---|---|---|---|
| POST | `/events/fire` | `{perimeter, wind, spread_rate_mh, head_bearing_deg, t}` | motor de escenario |
| POST | `/events/road-closure` | `RoadClosure` sin `id` | motor de escenario |
| POST | `/events/road-reopened` | `{road_name, reason, t}` | motor de escenario |
| POST | `/events/exit-threatened` | `{exit_id, reason}` | motor de escenario |
| POST | `/positions` | `{person_id, lat, lon, accuracy_m, t}` | página GPS (cada 5 s) |
| POST | `/calls/outcome` | ver abajo | workflow de HappyRobot (AI Extract) |
| POST | `/calls/started` | `{person_id, run_id, direction}` | HappyRobot |
| POST | `/human/override` | `{subject_type, subject_id, field, value, reason, operator}` | dashboard |
| POST | `/human/approve` | `{decision_id, approved, operator, reason}` | dashboard |
| POST | `/sim/run` | `{variants, horizon_min}` | dashboard (botón "simular") |
| POST | `/reset` | `{scenario: "sierra-culebra"}` | motor de escenario al arrancar |

`POST /calls/outcome` — el payload que HappyRobot manda tras cada llamada:

```json
{
  "run_id": "run_abc123", "person_id": "p-001", "phone": "+34600990012",
  "answered": true, "duration_s": 96,
  "extracted": {
    "people_at_home": 3, "declared_location": "Calle Mayor 4", "declared_lat": null, "declared_lon": null,
    "mobility": "car", "has_car": true, "seats_free": 2, "has_smartphone": true,
    "consent_position": true, "will_evacuate": true,
    "neighbors_mentioned": [{"name": "Rosa", "phone": "+34600990031", "address": "Calle Mayor 6", "at_home": true}],
    "vulnerable_people": [{"description": "madre 87 años, no anda", "needs": "traslado"}]
  },
  "agent_notes": "Suena agobiado pero coopera.",
  "transcript_url": "https://platform.eu.happyrobot.ai/..."
}
```

`neighbors_mentioned` es la capa 2 de la sección 9 del escenario (la red vecinal) y por eso es un
campo de primera clase, no una nota libre: cada vecino mencionado **crea o actualiza una `House`**
y entra en la cola de llamadas. Que 30 llamadas generen 100 números tiene que verse pasar en el
dashboard.

Dos detalles de implementación que este endpoint **tiene** que cumplir:

- **Es `upsert`, no `update`.** Un `person_id` desconocido no es un error 404: crea la persona (y su
  casa si hace falta) y registra un `entity_created`. El caso real es exactamente el interesante — un
  vecino que nadie tenía en la lista y que aparece porque otro lo mencionó.
- **Un `answered: false` también escribe.** Sube `call_attempts`, mueve el `status` por la máquina de
  estados del §2.1 y deja entrada en el log. El silencio es información, y es la que alimenta la lista
  de la patrulla.

### Respuesta estándar de escritura

```json
{"ok": true, "state_version": 412, "decisions": [{"id":"ev-000123","type":"route_recalculated","subject_id":"p-001","reason":"..."}]}
```

Devolver las decisiones provocadas por el evento permite que el motor de escenario (y el jurado)
vea el efecto inmediato de cada cambio sin tener que consultar el estado.

## 4. Priorización — la fórmula, escrita una sola vez

`minutes_to_front(persona)` = distancia desde la persona hasta el borde del polígono **en la
dirección de avance** dividida por `spread_rate_mh` efectiva en ese rumbo. La tasa efectiva decae
con el ángulo respecto a `head_bearing_deg`: cabeza 100%, flancos ~35%, cola ~10%. Por eso alguien a
3 km a favor del viento está peor que alguien a 800 m en contra, que es la frase del escenario.

La implementación de esa decaída es una curva coseno de dos armónicos que pasa exactamente por los
tres puntos de arriba, con θ = ángulo entre el rumbo a la persona y `head_bearing_deg`:

```python
factor = 0.45 + 0.45 * cos(theta) + 0.10 * cos(2 * theta)   # θ=0 → 1.00, θ=90° → 0.35, θ=180° → 0.10
```

**Esto es una simplificación deliberada, no el modelo de la literatura**, y hay que saber decirlo si
el jurado pregunta. El modelo serio es la elipse de Huygens de FARSITE (Finney 2004), cuya relación
largo/ancho depende del viento: `LB = 0.936·e^(0.2566U) + 0.461·e^(-0.1548U) - 0.397` con **U en m/s**.
Con esa elipse, si la cola va al 10% el flanco real sale entre el 6% y el 19%, no el 35% que usamos
nosotros: nuestra curva ensancha el fuego de flanco a propósito, lo que hace el sistema más
conservador (avisa a más gente de la que hace falta). Errar hacia avisar de más es el lado correcto
del error en una evacuación. Derivación y fórmulas verificadas en `docs/research/modelo-fuego.md`.

`priority_score` combina, normalizado a [0,1]:

| Factor | Peso | Por qué |
|---|---|---|
| Urgencia temporal `1 / max(minutes_to_front, 1)` | 0.45 | el reloj manda |
| Penalización por movilidad (`immobile` 1.0, `reduced` 0.6, `walking` 0.3, `car` 0.0) | 0.20 | quien no puede salir solo necesita más antelación |
| Incertidumbre (`status` en `unknown`/`no_answer`, o `position_source == "declared"`) | 0.15 | **lo que no se sabe sube la prioridad**, no la baja |
| Tamaño del núcleo familiar `min(household_size,6)/6` | 0.10 | más gente por acción |
| Deriva de trayectoria hacia el cono del fuego | 0.10 | quien va hacia el fuego primero |

El factor de incertidumbre es deliberado y es el que responde a "¿decide algo sensato sin tener
todos los datos?": el sistema trata la ignorancia como un riesgo, no como un vacío.

Cada elemento de `/queue` viaja con `score_breakdown` (el diccionario factor → aportación) para que
el dashboard pueda explicar **por qué** alguien está primero. Un número sin desglose no defiende nada
delante de un jurado.

## 5. Variables de entorno (`.env.example`)

```
HR_SHARED_SECRET=cambiame
HR_API_KEY=                  # sk_live_... de HappyRobot (Settings > API Keys)
HR_WORKFLOW_WEBHOOK=         # URL de webhook del workflow (entorno Development)
HR_BASE_URL=https://platform.eu.happyrobot.ai/api/v2
API_BASE_URL=http://localhost:8000
PUBLIC_BASE_URL=             # túnel público (ngrok/cloudflared) para que HappyRobot nos llame
ROUTING_PROVIDER=valhalla    # valhalla | osrm | straight
VALHALLA_URL=http://localhost:8002
ALLOW_REAL_CALLS=false       # ver regla 3 de la sección 6
SCENARIO=sierra-culebra
```

Dos cosas verificadas que se cuelan aquí y no son cosmética:

- `HR_BASE_URL` lleva **`/api/v2`** y la autenticación de HappyRobot es `Authorization: Bearer sk_live_...`,
  **no** `x-api-key` (eso es solo nuestra API hacia dentro). Ojo a no cruzar los dos esquemas.
- `ROUTING_PROVIDER` por defecto es **valhalla**, no osrm ni google, porque es el único de los tres que
  sabe esquivar el polígono del fuego (`exclude_polygons`). Google Routes API v2 no puede, y esa era la
  suposición equivocada del diseño original. `GOOGLE_MAPS_API_KEY` ya no hace falta y se ha quitado.
  Razonamiento completo en `docs/escenario-incendio.md` §3.

## 6. Reglas para quien implemente

1. **No inventes campos.** Si falta algo, se añade a este documento en el mismo commit.
2. **Datos sintéticos marcados como sintéticos.** Todo teléfono en `+3460099xxxx`, y el dashboard
   lleva una etiqueta visible "DATOS SINTÉTICOS". En una demo de emergencias esto no es opcional.
3. **Nada de llamadas reales sin `ALLOW_REAL_CALLS=true`.** Por defecto el sistema simula el envío y
   lo registra. El día de la demo se activa la bandera. Un bug en un bucle que llama a 120 teléfonos
   de verdad arruina el proyecto y algo más.
4. **Cada componente arranca solo** (`make engine`, `make api`, `make dashboard`) y falla con un
   mensaje claro si le falta una variable de entorno.
5. **Sin estado en disco crítico**: el estado vive en memoria y se persiste en `state.jsonl` solo
   como registro. Reiniciar es rearrancar el escenario, y en 36 h eso se agradece.
6. **El agente de voz se identifica como IA al empezar.** No es cortesía: el art. 50 del AI Act
   (Reglamento UE 2024/1689) está en aplicación desde el 2 de agosto de 2026, o sea ya. Todo guion
   abre identificándose, y el `say_this` de `/instructions` nunca contradice eso. Detalle y fuentes
   en `docs/research/marco-legal.md`.
