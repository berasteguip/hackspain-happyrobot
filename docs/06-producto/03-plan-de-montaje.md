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
| Workflows HappyRobot | **Nuevos, en la carpeta `Vigía`**; `Triaje incendios — MVP` y `test` de Pablo **no se tocan** | Se reutilizan los guiones de `prompts/01` y `05`. Nada publicado ni llamadas reales sin revisión del equipo. |
| Vecinos simulados | **Chat de HappyRobot**: trigger *Chatbot Request* + *Inbound Text Agent* (canal chatbot). `api/` abre las sesiones con `chat.createToken` y un LLM contesta en carácter | Verificado el 19 sep por MCP: los dos nodos existen. Es "agentes que se contestan" dentro de la plataforma, con transcripciones en Runs y sin números de teléfono. Respaldo: `POST /persona/{id}/reply` con `Generate` + `Loop` (decisión 002). |
| Demo | **Ejecutada antes de presentar y grabada.** El jurado no llama ni recibe nada | Lo que se enseña son los Runs de HappyRobot, el mapa y el `decision_log`. No hay workflow "web call para el jurado". |
| Datos sintéticos | Teléfonos en `+3460099xxxx`, etiqueta "DATOS SINTÉTICOS" visible, `ALLOW_REAL_CALLS=false` | Regla del contrato §6. |
| Rama de trabajo | `main` ya integra `context/reto-happyrobot`. El trabajo de Mapbox se integra desde `devin/vigia-grupos-puntos-encuentro` | Sin force-push. |

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

### F4 · Entregable HappyRobot (carpeta `Vigía`)

**Estado 19 sep, 12:40 — WF-1 ya creado en borrador por MCP** (no publicado, `test_all` pendiente):
`Vigía · vecino (chat)`, id `01a0b937-7bf9-7a6d-be1a-ad6b824dedc0`, versión `01a0b937-7c0a-776b-a36a-d70a17fd6dbb`,
editor: https://platform.eu.happyrobot.ai/hackspainteam11/workflows/z38ck8uuypre/editor/fr4t4hipau37

```
Trigger Chatbot Request  params: person_id, house_id, phone, first_name, village, address,
   │                             priority, assigned_shelter, vulnerable_flag, known_context
   ▼
Inbound Text Agent "Vigía" (canal chatbot, es, gpt-5.6-luna, máx 6 min, cierre fijo)
   ├─ Prompt: guion prompts/01 adaptado a Gredos/Ávila y a texto (usted, límite duro de cifras,
   │          say_this literal, consentimiento libre, vulnerables, negativa, estafa, vecinos, 5 casos de humano)
   ├─ tool get_instructions      → GET  {{API_BASE_URL}}/instructions/{{person_id}}   (x-api-key)
   ├─ tool send_gps_link         → POST {{API_BASE_URL}}/links/send  {person_id, phone, channel, consent_quote}
   ├─ tool register_vulnerable   → POST {{API_BASE_URL}}/calls/outcome  {partial: true, extracted.vulnerable_people[]}
   └─ AI Extract "Extraer datos de la casa": los 12 campos de prompts/05 + agent_notes + answered
        └─ POST {{API_BASE_URL}}/calls/outcome  payload completo del contrato §3 (+ channel: "chat", transcript_url)
Variables: API_BASE_URL (dev: http://localhost:8000; prod: túnel), API_KEY (oculta), ORGANISMO
```

**Pendiente en WF-1 (bloquea `test_all`):** el validador de la plataforma sigue diciendo "Missing name;
Channel must be selected" en el nodo del agente aunque la configuración lleva `name` y `channel: chatbot`.
Falta un ajuste en el editor (seleccionar el canal Chatbot a mano) o descubrir el campo exacto. El nodo
Extract ya se probó solo y devuelve `null` en todo con transcript vacío, como debe.

**Dos endpoints nuevos que `api/` tiene que aceptar** (añadir al contrato `03-contrato-de-datos.md`):
- `POST /links/send {person_id, phone, channel, consent_quote}` → simula/envía el SMS con `/track?id=` y
  registra `consent_position: true` con la cita literal.
- `POST /calls/outcome` con `partial: true`: actualiza solo los campos presentes sin mover el `status`.

**WF-2 `Vigía · rellamada`** — igual que WF-1 pero trigger webhook `{person_id, reason, say_this, urgency}`
lanzado por `notify` en `route_recalculated` / `exit_reassigned` / `at_risk`; un turno; extrae
`acknowledged`; POST `/calls/outcome`. Para el canal chat, `api/` abre la sesión y el vecino simulado contesta.

**WF-3 `Vigía · vecino (voz)`** — mismo agente y prompt con *Outbound Voice Agent*, para las 3–4 llamadas
reales a móviles del equipo. **Solo si la organización consigue número/SIP.** No es para el jurado.

**Recorte:** WF-4 aviso a patrulla (Slack con aprobación humana) solo si sobra tiempo.

**Pendiente de la organización (stand):** número/SIP, créditos (150 chats × ~8 mensajes × ~7 créditos ≈ 8–9k
por pasada), límite de sesiones de chat en paralelo, y si el `chat.createToken` está habilitado en la cuenta.

### F5 · Vecinos simulados que contestan (el canal de mensajería)

**Entregable:** 150 conversaciones por pasada dentro de HappyRobot; el resto de la población simulada solo
en estado.

- `sim/personas.py` (nuevo): para cada persona de la cola, `POST /chat/tokens` de la API v2 de HappyRobot
  (`Authorization: Bearer HR_API_KEY`, `workflow_id` de WF-1, `data` = payload del trigger 02→03), abre el
  WebSocket del chat, recibe el mensaje inicial del agente y responde con el LLM de persona hasta que el
  agente cierra o se llega a 8 turnos. Concurrencia configurable (`WAVE_CONCURRENCY`, empezar en 5).
- LLM de persona: clave en `.env` (`PERSONA_LLM_API_KEY`, `PERSONA_LLM_MODEL`). Prompt por personalidad
  (`cooperative 60 % · anxious 15 % · reluctant 10 % · confused 7 % · no_answer 5 % · wrong_info 3 %`) con
  la ficha del vecino: casa, familia, movilidad, coche, smartphone, vecinos conocidos, si está fuera. Los
  `no_answer` no abren sesión: `api/` registra `answered: false` directamente. Los `wrong_info` declaran un
  sitio y su GPS simulado los pone en otro.
- Opción para enseñar "los dos lados en la plataforma": WF-P `Vigía · vecino simulado` (webhook → AI Generate
  en carácter). Solo si sobran créditos; por defecto la persona vive en `api/`.
- Si `chat.createToken` no está disponible: respaldo de la decisión 002 (`POST /persona/{id}/reply` +
  `Generate` + `Loop` en HappyRobot), o `WAVE_HR_LIMIT=N` con el resto resuelto por un agente local con el
  mismo prompt y marcado `source: local`.

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
  que se confirman, 4) rutas y aforos, 5) mover el polígono, 6) rellamadas, 7) un rescate físico. **Se
  ejecuta entero antes de presentar y se graba**; en la presentación se enseñan el vídeo, los Runs de
  HappyRobot y el mapa. El jurado no participa.

## 3. Reparto propuesto

| Quién | Qué |
|---|---|
| Mateo + Devin | HappyRobot: WF-1 (hecho en borrador), WF-2, arreglo del canal, `test_all`. `sim/personas.py` (chat tokens + LLM de persona). F2 (mapa contra `api/`, polígono arrastrable). |
| Pablo (workflows) | Revisar prompt y Extract de WF-1 frente a `prompts/01` y `05`; deprecar `test`; stand: número/SIP, créditos, chat tokens, sesiones en paralelo. |
| Equipo `api/` (Luis/Allan) | F1 (escenario Gredos en `data/` y `engine/`), `POST /links/send`, `partial: true` en `/calls/outcome`, `POST /wave/start`, `POST /clock/pause`, `needs_rescue` + `MapboxProvider` (F3), `engine/population.py`. |
| Todos | LLM de persona y su clave (`PERSONA_LLM_*`); `HR_API_KEY` en `.env`; decidir cuándo activar `ALLOW_REAL_CALLS`. |

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
