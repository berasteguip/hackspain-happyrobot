# Plan de montaje — de tres islas a un sistema que se demuestra

> **Actualizado:** 2026-09-19 (noche) · **Estado:** propuesto, pendiente de reparto en el equipo
> Arquitectura objetivo y hueco actual: [`02-pipeline-evacuacion.md`](02-pipeline-evacuacion.md).
> Contrato de datos (vinculante): `docs/contrato-de-datos.md` en `context/reto-happyrobot`.

## 0. Decisiones que fija este plan

| Decisión | Valor | Motivo |
|---|---|---|
| Escenario | **Sierra de Gredos / valle del Tiétar** (Guisando, Arenas, El Hornillo, El Arenal) | Es el que está validado visualmente y con puntos de encuentro documentados. `api/engine/sim` se portan de Culebra a Gredos. |
| Frontend de mando | **`apps/command-center` (Mapbox)** | Diseño cerrado con el equipo. `web/dashboard` (Leaflet) queda como respaldo y no se borra. |
| Fuente de verdad en runtime | **`api/`** (FastAPI, estado en memoria + `decision_log`) | Ya existe con prioridad, aforo, rutas y bucles. El mapa pasa a ser un cliente. |
| Rutas | **Mapbox Directions `alternatives=true` + filtro contra polígono en `api/`**, sin Valhalla | Sin infraestructura extra; es literalmente el dibujo de la biblia. Valhalla queda como opción si sobra tiempo. |
| Sin ruta segura | **No se emite ruta.** Estado `needs_rescue`, decisión `rescue_required`, sube a patrulla | Principio de la biblia. Se elimina el suelo `StraightProvider` de la cadena por defecto. |
| Workflows HappyRobot | **Nuevos, con prefijo `Vigía ·`**; `Triaje incendios — MVP` y `test` de Pablo **no se tocan** | Se reutiliza el prompt de Triaje como base (fork del contenido, no de la versión). Nada publicado ni llamadas reales sin revisión del equipo. |
| Vecinos simulados | **LLM en `api/` interpretando personas (`POST /persona/{id}/reply`)** como camino seguro; **canal chat/e2e de HappyRobot** como camino preferido si se verifica mañana | El primero depende solo de nosotros; el segundo "exprime HappyRobot" y deja transcripciones en Runs. |
| Datos sintéticos | Teléfonos en `+3460099xxxx`, etiqueta "DATOS SINTÉTICOS" visible, `ALLOW_REAL_CALLS=false` | Regla del contrato §6. |
| Rama de trabajo | `integracion/vigia`, creada desde `context/reto-happyrobot` + `devin/vigia-grupos-puntos-encuentro` | `main` no se toca hasta que haya demo end-to-end. |

## 1. Lo que ya está y se reutiliza (no se reescribe)

- `api/`: modelos, `state`, `decision_log`, `priority` (fórmula con desglose), `assign_exits` (greedy con aforo
  proyectado), `recompute_routes` (solo afectados), `_absorb_neighbors` (bucle azul), `notify` con
  `ALLOW_REAL_CALLS`, `GET /instructions/{id}` con `say_this`, `POST /calls/outcome` upsert, `POST /events/fire`.
- `engine/`: reloj a escala, modelo de avance del fuego por rayos, eventos con guion YAML.
- `apps/command-center`: mapa, fuego, personas, puntos de encuentro, fichas, filtro de ruta contra la huella,
  reservas por grupo, 12 tests, `/track` con GPS real y consentimiento.
- HappyRobot: prompt de `Triaje incendios — MVP` (tres preguntas, niveles, replanificación asimétrica) y
  su extractor de señales.
- `prompts/01..07` del equipo del agente: guiones por personalidad, esquema de extracción, guion de demo.

## 2. Fases

Cada fase tiene un entregable comprobable. El orden es el camino mínimo hasta una demo completa;
lo que está en "recorte" se cae primero si falta tiempo.

### F1 · Un solo escenario: Gredos en todas partes

**Entregable:** `data/scenarios/gredos.json` + `engine/scenarios/gredos.yaml`, cargados por `api/` y por el mapa.

- Generar `gredos.json` **desde el mismo generador que el mapa** (`scenario.ts`: 300 contactos, composición
  del grupo, movilidad, PE-01/02/03 con aforo, huella del fuego). Script Node `scripts/export-scenario.mjs`
  → JSON con el esquema de `data/` (`Person`, `House`, `SafeZone`, `Fire`). Así el mapa y `api/` no divergen.
- Añadir a cada persona sintética: `personality` (`cooperative 60 % · anxious 15 % · reluctant 10 % ·
  confused 7 % · no_answer 5 % · wrong_info 3 %`), `neighbors_known` (0–2), `has_smartphone`, `has_car`,
  `seats_free`. Determinista por semilla.
- `gredos.yaml` para `engine/`: foco al NO de Guisando, viento que gira para amenazar primero Guisando y
  después la carretera Guisando–Arenas (AV-924). Duración ≤ 3 min a escala.
- `data/validate.py` y tests de contrato pasan con el nuevo escenario.

**Verificación:** `make data SCENARIO=gredos`, `make test`; `POST /reset {scenario: gredos}` devuelve 300 personas y 3 zonas.

### F2 · El mapa Mapbox se conecta a `api/`

**Entregable:** `apps/command-center` pinta lo que dice `GET /state` y cada acción del operador es un `POST`.

- Cliente `src/api.ts`: long-poll `GET /state/diff?since=state_version`; mapeo `Person → Citizen`
  (`position_source` → `locationSource`; estados; `assigned_route.polyline` → recorrido; `score_breakdown`;
  `assigned_exit_id` → punto de encuentro). Mapeo `SafeZone` con `occupancy/capacity/status`.
- El **feed de eventos** pasa a ser `decision_log` (con `reason` legible), no los eventos locales.
- **Play** deja de simular en el navegador: hace `POST /reset` y `POST /wave/start` (nuevo endpoint: encola
  la oleada por prioridad y la despacha vía `notify`). **Pausa** → `POST /clock/pause` (nuevo; congela
  `engine` y el simulador de población). La simulación local queda como **modo offline** detrás de un flag
  `VITE_API_BASE_URL` vacío, para que la demo no muera si `api/` se cae.
- **Dibujar / arrastrar el polígono de riesgo** (Mapbox GL Draw): al soltar → `POST /events/fire` con el
  polígono. La huella roja de celdas se sigue pintando como capa visual; el polígono operativo va encima,
  discreto.
- Ficha de persona: añadir desglose de prioridad, instrucción (`say_this`), última llamada (enlace al run de
  HappyRobot), y `needs_rescue` con motivo. Ficha de punto de encuentro: ocupación real de `api/`.
- **GPS real** (`/track`) → `POST /positions` de `api/`, no al middleware de Vite. Sigue sin animarse.
- Etiqueta "DATOS SINTÉTICOS" y marca de "SIMULACIÓN" visibles.

**Verificación:** con `api/` y `engine/` arrancados, el mapa muestra el frente avanzando, personas cambiando de
estado y rutas apareciendo; `npm test`, `build`, `lint` limpios; test de navegador con `api/` real.

### F3 · Capa geo honesta

**Entregable:** `api/routing.py` con proveedor `mapbox` y `no_safe_route` de verdad.

- `MapboxProvider`: Directions `alternatives=true`, perfil `walking` o `driving` según `mobility`,
  `geometries=polyline`; para cada alternativa `path_intersects_polygon(avoid)` (polígono + cono de avance);
  elegir la más rápida de las que no cruzan. Caché por (origen redondeado, destino, versión del polígono).
  Límite de peticiones por segundo. Token desde `.env` (`MAPBOX_TOKEN`), nunca en el repo.
- Cadena por defecto `mapbox` **sin** `straight`. `StraightProvider` solo con `ALLOW_STRAIGHT_ROUTES=true` para
  desarrollo sin red, y marcado en `notes`.
- `assign_exits`: si ninguna candidata tiene ruta limpia con plaza → `PersonStatus.needs_rescue`, decisión
  `rescue_required` con motivo, entra en `GET /houses/no-answer`-equivalente para patrulla (`/rescue-queue`).
- Velocidad del núcleo = la del más lento (adulto 5 km/h, >75 años 3, `reduced` 1,5–2, coche por tramo).
  ETA = duración de la ruta a esa velocidad; comprobación "llega antes de que el frente alcance la ruta".
- Tests: ruta que cruza se descarta; tres que cruzan → `needs_rescue`; aforo por núcleo familiar; caché.

**Verificación:** `pytest api`; en el mapa, arrastrar el polígono sobre una carretera reasigna a los afectados y
alguien queda en rescate con motivo visible.

### F4 · Entregable HappyRobot (workflows nuevos `Vigía ·`)

**Entregable:** tres workflows en borrador, probados con `test_all`, revisados por Pablo antes de publicar.

**WF-1 `Vigía · llamada vecino`**
- Trigger **Webhook** con el contrato 02→03: `person_id, phone, name, priority, assigned_shelter,
  known_context{village, address, household_hint, prior_level}`, `channel` (`text|voice`).
- **Agente** (texto para simulados, voz para reales; mismo prompt). Prompt = Triaje de Pablo +
  secciones nuevas: identificarse como IA (art. 50), pedir consentimiento y **enviar enlace de ubicación**,
  preguntar **composición del grupo y movilidad**, comunicar el **punto de encuentro que diga
  `get_instructions`** (el agente no decide destino), preguntar por **vecinos**, nunca ordenar evacuar.
- Tools: `get_instructions` → Webhook GET `/instructions/{person_id}`; `send_location_link` → Webhook POST
  `/links/send` (api simula el SMS si `ALLOW_REAL_CALLS=false`, y devuelve la URL `/track?id=`);
  `report_neighbor` → Webhook POST `/calls/outcome` parcial. Transfer al operador en los cinco criterios.
- **AI Extract** con el contrato 03→05 exacto (`declared_location, will_evacuate, casualty, mobility,
  vulnerable_people[], neighbor_mention[], location_coords, location_confidence, consent_position,
  people_at_home[]`), `null` cuando no se dijo. Descripción obligatoria en cada parámetro.
- **Webhook POST `/calls/outcome`** al final, también en `answered: false`.
- Variables de workflow: `API_BASE_URL` (túnel), `API_KEY` (`x-api-key`).

**WF-2 `Vigía · rellamada`** — trigger webhook `{person_id, reason, say_this, urgency}`, un turno, extrae
`acknowledged`, POST `/calls/outcome`. Lo dispara `notify` en `route_recalculated`, `exit_reassigned`, `at_risk`.

**WF-3 `Vigía · llamada web (jurado)`** — trigger Web call, mismo agente de voz, `person_id` elegido desde
el mapa ("añadir como una casa más"). Es la demo sin número de teléfono.

**Recorte:** WF-4 aviso a patrulla (SMS/Slack con aprobación humana) solo si sobra tiempo.

**Pendiente de la organización:** número de teléfono / SIP trunk para 3–4 llamadas reales (pedir en el stand),
créditos disponibles, límite de conversaciones en paralelo, y si el nodo Webhook espera respuesta síncrona.

**Verificación:** `test_all` en desarrollo; un run manual por webhook con una persona sintética y
`ALLOW_REAL_CALLS=false`; la ficha de esa persona en el mapa cambia con lo extraído.

### F5 · Vecinos simulados que contestan (el canal de mensajería)

**Entregable:** 150 conversaciones sintéticas por pasada, el resto de la población simulada solo en estado.

**Camino A (preferido, a verificar mañana a primera hora):** HappyRobot habla consigo mismo.
- Opción A1: tokens de chat (`/chat/tokens`) para abrir sesiones de texto con el agente de WF-1; un proceso
  nuestro (`sim/personas.py`) actúa de "usuario" con el LLM de persona. Transcripciones y Northstars en Runs.
- Opción A2: `e2eScenarios` (tests adversariales con interlocutor simulado) si permiten definir la persona
  y disparar en lote.

**Camino B (seguro, solo depende de nosotros):**
- `POST /persona/{person_id}/reply {run_id, turn, agent_text}` → `{persona_text, ended}` en `api/`, con el
  LLM que tengamos en `.env` (`PERSONA_LLM_API_KEY`), prompt por personalidad y ficha del vecino
  (casa, familia, movilidad, vecinos conocidos, si miente sobre dónde está).
- En HappyRobot, WF-1 en modo texto: `Loop` de `Generate` (turno del agente) + Webhook POST a
  `/persona/{id}/reply`, 4–6 turnos, después el mismo Extract y `/calls/outcome`. Si `Loop` falla, el
  fan-out de turnos lo hace `api/` disparando un workflow-turno por webhook.
- Si los créditos no dan para 150, `WAVE_HR_LIMIT=N` en `api/`: N conversaciones van por HappyRobot y el
  resto se resuelven con el LLM de persona contra un "agente Vigía" local con el mismo prompt, marcadas
  `source: local`. Que se vea la diferencia en la ficha.

**Movimiento de la población:** `engine/population.py` (nuevo) mueve a los sintéticos por
`assigned_route` a la velocidad del más lento del núcleo, a escala del reloj, y hace `POST /positions`
cada N s. Reglas heredadas de `simulation.ts`: nadie se mueve sin consentir + confirmar + ruta + plaza +
preparación; `needs_rescue` y `pickup` no se mueven; pausa congela; el GPS real jamás se toca.
Los `wrong_info` declaran una ubicación y el GPS los pone en otra: `api/` marca la discrepancia.

**Verificación:** una pasada completa con 20 vecinos: llamadas, extracciones, asignación, movimiento,
llegadas contadas por personas en los PE; luego 150.

### F6 · Los dos bucles y el guion

- **Bucle ámbar en vivo:** arrastrar el polígono → `POST /events/fire` → `recompute_routes(only_affected)`
  → `notify` dispara WF-2 a los afectados → sus fichas muestran la nueva instrucción. Debe verse en < 10 s.
- **Bucle azul:** un vecino menciona a "Rosa" → `_absorb_neighbors` crea casa+persona → entra en la cola con
  prioridad alta → WF-1 la llama. Debe verse el punto nuevo aparecer en el mapa.
- Túnel `cloudflared` para `api/` y `/track` (HTTPS obligatorio para GPS en móvil).
- Ensayo del guion (`prompts/07-guion-demo.md`) con el mapa: 1) censo gris, 2) Play, 3) llamadas y puntos
  que se confirman, 4) rutas y aforos, 5) mover el polígono, 6) rellamadas, 7) un rescate físico, 8) llamada
  web del jurado. Grabar el vídeo con datos sintéticos etiquetados.

## 3. Reparto propuesto

| Quién | Qué |
|---|---|
| Yo (Mateo + Devin) | F1, F2, F3, `engine/population.py`, integración y ensayo. Borradores de WF-1/2/3 por MCP para que Pablo los revise. |
| Pablo (workflows) | Revisar y afinar prompts de WF-1/2/3, tools, Extract; deprecar `test`; preguntar en el stand por número/SIP, créditos, Loop y chat API. |
| Equipo `api/` (Luis/Allan) | `POST /wave/start`, `POST /clock/pause`, `POST /persona/{id}/reply`, `needs_rescue`, `MapboxProvider` si prefieren hacerlo ellos, `WAVE_HR_LIMIT`. |
| Todos | Elegir el LLM de persona y su clave; decidir cuándo activar `ALLOW_REAL_CALLS` el día de la demo. |

## 4. Orden en el tiempo (36 h, ya consumidas ~20)

1. **Esta noche:** F1 y arranque de F2 (cliente `api.ts`, `/state` pintado). Borrador WF-1 en HappyRobot.
2. **Mañana temprano:** verificar en el stand chat API / e2eScenarios / Loop / número. F3. Cerrar F2.
3. **Mañana mediodía:** F4 revisado por Pablo; F5 con 20 vecinos.
4. **Mañana tarde:** F5 a 150; F6; túnel; vídeo.
5. **Recortes por orden:** WF-4 patrulla → convoyes → prioridad aérea → dibujo libre del polígono (queda
   arrastre de un polígono predefinido) → 150 conversaciones (bajar a 50 por HappyRobot + resto local).

## 5. Riesgos y qué hacemos con cada uno

| Riesgo | Mitigación |
|---|---|
| Sin número/SIP el día de la demo | Web call del jurado (WF-3) + 150 simulados. La demo no depende del teléfono. |
| Créditos de HappyRobot insuficientes | `WAVE_HR_LIMIT` y agente local con el mismo prompt, etiquetado. |
| Cuota de Mapbox Directions | Caché por polígono; solo se recalculan afectados; `alternatives` limitadas a 3. |
| `api/` se cae en la demo | Modo offline del mapa (simulación local actual) con aviso visible. |
| `Loop` de HappyRobot no se comporta | Fan-out desde `api/` (un webhook por casa / por turno). |
| Dos equipos tocando `api/` a la vez | Contrato de datos como frontera; cada endpoint nuevo se añade primero al contrato. |
| Discurso ante el jurado | Todo lo simulado se llama simulado; la incertidumbre sube la prioridad; nadie ordena evacuar salvo la autoridad. |

## Fuentes

- `docs/contrato-de-datos.md`, `docs/brief-equipo-agente.md`, `prompts/06-workflows-happyrobot.md`,
  `docs/research/happyrobot-api.md` (rama `context/reto-happyrobot`, 19 sep 2026).
- Organización HappyRobot `hackspainteam11` consultada por MCP el 19 sep 2026 (solo lectura).
- [`01-vigia.md`](01-vigia.md), [`02-pipeline-evacuacion.md`](02-pipeline-evacuacion.md).
