# HappyRobot: mapa de API, SDKs y plataforma (investigación técnica)

> Investigación hecha el 19 sep 2026, SIN acceso a `docs.happyrobot.ai` (confirmado: todas las rutas
> redirigen a `/login`, ver §0). Toda la información de API viene de fuentes públicas verificables sin
> login: **el código fuente publicado de los SDKs oficiales de HappyRobot en npm/GitHub**, que es más
> fiable que cualquier resumen porque es el contrato real que ejecuta el cliente.
>
> Método: se descargaron y desempaquetaron los tarballs npm de `@happyrobot-ai/sdk@0.1.50`,
> `@happyrobot-ai/mcp@0.1.25`, `@happyrobot-ai/mcp-twin@0.1.1` y `@happyrobot-ai/workflow-sdk@0.1.11`
> (todos publicados por `happyrobot.ai` con cuentas `@happyrobot.ai`, y `@happyrobot-ai/sdk` publicado
> vía GitHub Actions OIDC desde `happyrobot-ai/app-v2`), y se leyeron README + `.d.ts` + `.js` reales.
> No es documentación de marketing: es el código que compilan.

---

## 0. Acceso a docs.happyrobot.ai

**[VERIFICADO]** `curl -I https://docs.happyrobot.ai/<cualquier-ruta>` devuelve `307` con
`location: /login?redirect=...` para **todas** las rutas probadas (`/`, `/introduction`,
`/api-reference`, `/developer-tools/mcp`, `/claude-desktop`, `/quickstart`). Es un Mintlify doc site
protegido con login/access-code, confirmando lo que decía el equipo. No hay manera pública de leerlo sin
la cuenta.

Hay una copia cacheada en Wayback Machine pero es de **marzo/junio 2023** — de una versión del producto
muy anterior (probablemente un pivot de plataforma distinto al actual "Engine V3"). **No la uses como
referencia**, la marco solo para que nadie pierda tiempo con ella: `web.archive.org/web/*/docs.happyrobot.ai*`.

---

## 1. API REST

### Base URL y clusters

**[VERIFICADO — código fuente `@happyrobot-ai/sdk`, `core/http.js`]**

```
US (default): https://platform.happyrobot.ai/api/v2
EU:           https://platform.eu.happyrobot.ai/api/v2
```

El SDK **prohíbe explícitamente overridear la baseUrl** salvo con `HR_TESTING=true` — está hardcodeado
por diseño (`if (customBaseUrl && !isTesting) throw new Error("baseUrl can not be overridden")`). Como
nuestro workspace es EU (`platform.eu.happyrobot.ai`, confirmado por el equipo en el navegador), la API
pública que nos corresponde es **`https://platform.eu.happyrobot.ai/api/v2`**, seleccionable en el SDK
con `cluster: "eu"`.

### Autenticación

**[VERIFICADO — `core/http.js`]** Header `Authorization: Bearer <API_KEY>` — **no** es `x-api-key`. La
API key tiene el formato `sk_live_...` (producción) o `sk_test_...` (test), coherente con la pantalla de
Settings → API Keys que vio el equipo. Reintentos automáticos con backoff exponencial en `429` y `5xx`
(2 reintentos por defecto), timeout 30s por defecto.

### SDK oficial: `@happyrobot-ai/sdk` (TypeScript)

**[VERIFICADO — npm, GitHub `happyrobot-ai/app-v2` (privado; solo el README es visible vía npm)]**
Paquete: `npm install @happyrobot-ai/sdk`. Publicado el 14 sep 2026 (v0.1.50), 10 mantenedores con
emails `@happyrobot.ai` — es el SDK público **oficial y activo**, no una integración de tercero.

Recursos expuestos (`client.<resource>.<método>` → verbo HTTP + ruta), **todos verificados leyendo el
README y el `.js` de cada resource**:

| Resource | Qué gestiona | Endpoints clave |
|---|---|---|
| `workflows` | CRUD, publish/unpublish, duplicar, cancelar runs, plantillas, listar versiones/runs/sesiones, **disparar un run** | `GET/POST /workflows`, `GET/PATCH/DELETE /workflows/:id`, `POST /workflows/:id/publish`, `POST /workflows/:id/runs` ← **esto es "trigger" universal, sirva el trigger que sea (webhook, schedule, etc.)** |
| `versions` | Fork, publish, lock/unlock, test-all, prompt issues | `/versions/:id/*` |
| `nodes` | CRUD de nodos dentro de una versión, **schema de config de un nodo**, variables disponibles, test de un nodo | `GET/POST /versions/:vId/nodes`, `GET /versions/:vId/nodes/:nId/config-schema`, `POST /versions/:vId/nodes/:nId/test` |
| `runs` | Detalle, sesiones, grabaciones, quality flags, cancelar, anotar | `/runs/:id/*` |
| `sessions` | Detalle, mensajes paginados, **stream SSE** de la conversación | `GET /sessions/:id/stream` |
| `messages` | Quality flags por mensaje | `/messages/:id/flags` |
| `variables` | Variables de workflow (env vars scoped) | `/workflows/:wId/variables` |
| `phoneNumbers` | Comprar/gestionar números, toll-free verification, SIP trunk | `/phone-numbers/*` |
| `sipTrunks` | SIP trunks | `/sip-trunks/*` |
| `integrations` | Listar integraciones + sub-recursos (Google Sheets, Slack, Teams, Twilio SMS, WhatsApp) | `/integrations/*` |
| `contacts` | Lookup por teléfono/email, historial, "memorias" de IA | `/contacts/*` |
| `knowledgeBases` | Documentos, upload URLs, chunking | `/knowledge-bases/*` |
| `workflowFolders` | Carpetas de organización | `/workflow-folders/*` |
| `mcp` | Registrar/listar/refrescar **servidores MCP externos** que un workflow puede llamar | `/mcp/*` |
| `billing` | Usage details/totals | `/billing/usage/*` |
| `apiKey` | Introspección de la key actual | `/api-key/describe` |
| `artifacts` | URLs firmadas de descarga de adjuntos | `/artifacts/*` |
| `adversarialSuites` / `adversarialTests` | Historial de red-teaming retenido (solo lectura) | — |
| `northstars` | Criterios de calidad (ver §8) | `/northstars/:id/*` |
| `customEvals` | Evals custom por nodo de prompt | `/custom-evals/:id/*` |
| `issues` | Estado de quality flags | `/issues/:id` |
| `auditRemarks` | Feedback sobre un grade de northstar | `/audit-remarks/:id/*` |
| `chat` / `voice` | Tokens para los widgets de chat/voz embebibles (ver §9) | `/chat/tokens`, `/voice/tokens` |
| `e2eScenarios` | Crear y correr escenarios de test adversarial | — |

**Paginación**: `list()` devuelve `{data, pagination}`; hay `listAll()` como async generator sobre todas
las páginas.

### SDK Python: paquete `happyrobot` en PyPI

**[VERIFICADO pero OBSOLETO]** `pip install happyrobot` existe (`pypi.org/project/happyrobot/`), pero
su metadata dice `Development Status :: 2 - Pre-Alpha`, versión `0.1.0` publicada el **11 mar 2024**, con
un README de una sola línea ("First release on PyPI"). Es un placeholder muy antiguo, de dos años antes
del pivote actual de la plataforma. **No lo usemos** — no hay SDK Python oficial mantenido hoy. Si
necesitamos Python, hay que llamar la REST API a mano con `requests` usando el contrato de
`@happyrobot-ai/sdk` como referencia (mismo `Authorization: Bearer`, misma base URL EU).

### Otros paquetes npm de HappyRobot descubiertos (mapa completo del ecosistema)

**[VERIFICADO — npm registry search]**

| Paquete | Versión | Qué es |
|---|---|---|
| `@happyrobot-ai/sdk` | 0.1.50 (14 sep 2026) | El SDK TS oficial, cubierto arriba |
| `@happyrobotai/web-client` | 2.16.0 (15 sep 2025) | Cliente WebRTC de bajo nivel — **depende de `@livekit/protocol` y `@livekit/mutex`**: confirma que la voz de HappyRobot corre sobre **LiveKit** (infra WebRTC open-source) |
| `@happyrobot-ai/mcp` | 0.1.25 | Servidor MCP para gestionar workflows (§6) |
| `@happyrobot-ai/mcp-twin` | 0.1.1 | Servidor MCP para la base de datos Twin (§3) |
| `@happyrobot-ai/workflow-sdk` | 0.1.11 (24 mar 2026) | SDK TS **tipado para construir workflows enteros por código** — trae el catálogo completo de tipos de nodo generado desde su schema interno (§6 y todo el resto del documento se apoya en él) |
| `@happyrobot-ai/happyrobot-js` | 1.0.4 (feb 2024) | Versión antigua/anterior del SDK JS, previa al pivote — no usar |

### GitHub: `github.com/happyrobot-ai`

**[VERIFICADO — GitHub API]** Repos públicos relevantes: `happyrobot-python` (el mismo placeholder de
PyPI), `web-sdk` (ejemplo mínimo de Web Call), **`livekit-agents`, `egress`, `livekit-protocol`,
`livekit-media-sdk`, `livekit-sipgo`, `livekit-server-sdk-go`** (forks/vendoring de LiveKit — refuerza
que todo el stack de voz en tiempo real es LiveKit), `chatbot-sdk-example`, `voice-sdk-example`,
`custom-llm-server` (ejemplos oficiales, leídos completos abajo). El repo `app-v2` (el backend/frontend
real, según el `homepage` del `package.json` del SDK) **no está en la lista de repos públicos** → es
privado.

---

## 2. Webhook trigger — cómo arrancar un workflow desde fuera

**[VERIFICADO — `@happyrobot-ai/workflow-sdk`, `dist/generated/integrations/webhook.d.ts`, y
`@happyrobot-ai/sdk` README]**

Hay **dos maneras** de arrancar un run, y no son excluyentes:

1. **Vía API pública genérica** (la que probablemente usaremos): sin que importe qué trigger tenga el
   workflow, `POST /workflows/:id/runs` (`client.workflows.triggerRun(workflowId, { payload, environment })`)
   devuelve `{ run_id }`. Esto es lo que usa el helper `triggerAndWait()` del SDK.

2. **Vía el nodo trigger "Webhook"** propiamente dicho, que existe en **dos variantes** (nodos reales del
   motor, verificados por su schema Zod exportado):
   - **`webhook.incoming_hook`** (`webhookIncomingHook`): trigger genérico de webhook entrante. Config:
     `enhanced_security: boolean`, `auth_type: "api_key" | "oauth2"`, `api_key`, `oauth2_credential: {mode: "static"|"dynamic", credential_id, header}`.
   - **`webhook.predefined_request`** (`webhookPredefinedRequest`): la variante **recomendada** por el
     propio código ("Really useful for scaffolding out workflows") — declaras de antemano las propiedades
     (`params: string[]`) que el webhook va a recibir, con el mismo `auth_type`/`api_key`/`oauth2_credential`.

   Es decir: el "tipado de los parámetros" que pide la tarea se declara en `params` (array de nombres) para
   `predefined_request`, o queda sin tipar (payload libre) en `incoming_hook`.

**Callback al revés (HappyRobot → nuestro servidor)**: **[NO ENCONTRADO en el código del SDK]**. No existe
ningún resource de "webhooks salientes" ni ningún campo `callback_url` en `triggerRun`. El propio helper
oficial `triggerAndWait()` **hace polling** —llama a `client.runs.get(run_id)` cada `pollIntervalMs`
(2s por defecto) hasta un estado terminal (`completed|succeeded|failed|canceled|skipped`)—, lo cual es la
prueba más fuerte posible de que **no hay callback nativo**: si existiera, el propio SDK oficial lo usaría
en vez de hacer poll. Para "avisarnos" al terminar un run, la opción dentro de un workflow es añadir un
nodo `webhook.post`/`webhook.put`/`webhook.patch` (HTTP action, con `authType` configurable incl. Bearer/
API key/OAuth2) al final del workflow que llame a un endpoint nuestro.

---

## 3. Twin

**[VERIFICADO — `@happyrobot-ai/workflow-sdk` `twin.d.ts` + `@happyrobot-ai/mcp-twin` README]**

Twin es, en la práctica, **una base de datos relacional ligera scoped a tu organización**, con dos
superficies de acceso distintas y complementarias:

**(a) Dentro de un workflow — nodos `twin.read` / `twin.write`:**
- `twinRead(tableName, filters: [{column, value}], limit)` — lee filas de una tabla con filtros por columna.
- `twinWrite(tableName, columnValues: [{columnName, type, isPrimary, value}])` — escribe/upsert una fila.

Estos nodos son la manera de que **un workflow en ejecución** lea o escriba el estado compartido. Como
varios runs concurrentes pueden ejecutar nodos `twin.read`/`twin.write` sobre la misma tabla, Twin
funciona exactamente como el "espejo del estado de crisis" que queremos: cada llamada de evacuación
(un run) puede leer el estado del fuego/zona actual y escribir la posición/estado de esa persona, y otro
proceso (otro workflow, o nuestro dashboard) puede leerlo.

**(b) Desde fuera, por MCP — `@happyrobot-ai/mcp-twin`:**
Servidor MCP dedicado (deprecado en su forma stdio; la versión viva es el remoto
`https://mcp.platform.happyrobot.ai/twin/mcp` con OAuth, mismo patrón que el MCP de workflows, §6) con
tools: `get_schema` (lista tablas/vistas con columnas, tipos y PKs), `get_table_data` (paginado),
`create_table`, `execute_sql` (**SQL arbitrario**: SELECT/INSERT/UPDATE/DELETE/DDL), `insert_row`,
`update_row`, `delete_rows`, `drop_table`.

**Límites explícitos y verificados**: consultas SQL con **timeout de 5 segundos**; los `SELECT` están
**topados a 500 filas / 1 MB**. No hay límite de escrituras documentado en el README (más allá del
timeout de 5s por query).

**No hay endpoint REST público de Twin** en `@happyrobot-ai/sdk` (`client.*`) — no existe
`client.twin.*`. Es decir: **fuera de un workflow, la única vía verificada para leer/escribir Twin es el
protocolo MCP** (con nuestra API key), no una llamada HTTP directa desde nuestro backend. Si queremos que
nuestro dashboard lea Twin directamente (sin ser un cliente MCP), **no hay confirmación de que exista un
endpoint REST equivalente** — esto hay que preguntarlo en el stand (ver §Preguntas).

---

## 4. Tools de un agente de voz (llamar a nuestra API a mitad de conversación)

**[VERIFICADO parcialmente — `custom-llm-server` example + `@happyrobot-ai/workflow-sdk` `builder.d.ts`]**

Hay dos mecanismos distintos, no confundirlos:

**(a) Tools nativas del agente (Prompt/Agent node → Tool hijo).** En el `workflow-sdk`,
`wf.addTool(name, parentPrompt, { description, parameters: [{name, description, required}] })` crea un
nodo `tool` hijo del prompt del agente; el agente lo ve como una función que puede invocar durante la
conversación. La **acción real** que ejecuta esa tool es cualquier nodo normal (p. ej. `code.run_python`
o `webhook.post`) que dependa del nodo tool y lea sus argumentos vía `variable(tool, "nombre_del_arg")`.
Es decir: **la tool en sí no golpea nuestra API directamente — es el nodo hijo (típicamente un
`webhook.get/post/put/patch`) el que hace la llamada HTTP**, con el `authType` que declaremos
(`none|apiKey|bearer|basic|oauth2`) y con `ignore5XX` opcional para no reventar la conversación si el
endpoint falla (fallo gracioso: la respuesta de error simplemente se devuelve como resultado de la tool al LLM,
que puede reintentar o seguir hablando).

**(b) Modo "Custom LLM" (headless) — para lógica de tools 100% nuestra.** Confirmado en el repo oficial
`custom-llm-server`: se puede configurar un nodo Agent con **Model = Custom LLM** y una
**Endpoint URL** propia compatible con `POST /v1/chat/completions` (formato OpenAI Chat Completions,
streaming o no). HappyRobot nos manda el historial de conversación **y los schemas de sus tools
built-in** (`_hangup`, `_stay_silent`, `_voice_mail`, `_press_digit`) en el payload `tools=[...]`; nuestro
servidor decide el system prompt, el modelo, y puede añadir sus propias "native tools" que ejecuta
localmente sin que HappyRobot las vea nunca. Si el LLM llama una tool de HappyRobot (`_hangup`, etc.), la
pasamos tal cual y HappyRobot la ejecuta (cuelga, transfiere...).

**Timeout / qué ve el agente del resultado**: **[NO ENCONTRADO explícitamente]** el `workflow-sdk` no
declara un campo `timeout` en el tipo de nodo `tool` ni en los nodos HTTP (`webhookGet/Post/...`) — sí
existe `ignore5XX` para no abortar en error de servidor, pero no vimos un timeout configurable en el
schema. Pregunta pendiente para el stand.

---

## 5. Python Sandbox (`code.run_python`)

**[VERIFICADO — `@happyrobot-ai/workflow-sdk`, `code.d.ts`, comentario literal del propio schema]**

```
"!IMPORTANT: Only math, datetime, pytz, re, dateutil, random, collections, json,
_strptime, time, base64 modules are available for import."
```

Esto es un dato durísimo y muy útil para nosotros: **la whitelist de módulos NO incluye ningún módulo de
red** (`requests`, `urllib`, `http`, `socket` — nada de eso está permitido). Conclusión directa: **el
Python Sandbox de HappyRobot NO tiene salida de red** (o si la tuviera a nivel de sandbox de ejecución,
no hay ninguna librería permitida para usarla, que en la práctica es equivalente a no tenerla). Nuestra
idea de "meter lógica con `requests` dentro de la plataforma" **no es viable dentro del Python Sandbox**.
La vía correcta para llamar a servicios externos desde un workflow es el nodo **`webhook.get/post/put/patch`**
(§2/§4), no `code.run_python`.

El nodo recibe sus inputs como diccionario `input_data` (definido como `input_data: [{key, value}]`) y
devuelve su salida asignando `output = {...}`. No hay datos verificados sobre límites de tiempo de
ejecución (CPU) o memoria del sandbox — **[NO ENCONTRADO]**, pregunta para el stand.

---

## 6. MCP Server de HappyRobot

**[VERIFICADO — README de `@happyrobot-ai/mcp` y `@happyrobot-ai/mcp-twin`, y el `mcp__happyrobot__*`
disponible en esta misma sesión]**

Hay **dos servidores MCP oficiales distintos**, ambos con una versión stdio (vía `npx`, deprecada) y una
versión remota **HTTP + OAuth** (la recomendada hoy):

| Servidor | Remoto (recomendado) | Qué gestiona |
|---|---|---|
| `happyrobot-workflows` | `https://mcp.platform.happyrobot.ai/workflows/mcp` | Workflows completos: crear desde cero/plantilla/nodos inline, editar nodos, versiones, runs, variables, teléfonos, integraciones, SIP trunks, MCP servers, credenciales, northstars, custom evals, adversarial tests/suites, prompt issues |
| `happyrobot-twin` | `https://mcp.platform.happyrobot.ai/twin/mcp` | La base de datos Twin (§3) |

Autenticación: OAuth2 (flow interactivo: `authenticate` da una URL, el usuario autoriza en el navegador,
y se completa con el `callback_url`). **Esta sesión de Claude Code tiene el servidor `happyrobot`
configurado** (`https://mcp.platform.eu.happyrobot.ai`, variante EU) pero **no autenticado** — hay dos
tools disponibles (`mcp__happyrobot__authenticate` / `mcp__happyrobot__complete_authentication`) que
arrancan y completan el OAuth. No lo ejecuté en esta investigación porque requiere que un humano del
equipo abra el navegador y autorice — es una acción con estado que corresponde hacer a quien vaya a
usar esa sesión, no a esta tarea de research. **Recomendación**: cualquiera del equipo con Kiro/Claude
Code puede correr `mcp__happyrobot__authenticate` y autorizar con la cuenta del equipo; a partir de ahí,
Claude podría **crear e inspeccionar workflows enteros por conversación**, incluyendo leer los
`config-schema` reales de nodos que este documento no pudo confirmar (Approval Process, límites de Python
Sandbox, timeouts de tools) con más precisión que inferir del SDK.

**¿Permite construir un workflow completo por programación?** Sí, confirmado por la tool
`create_workflow` ("Create a workflow from scratch, template, or inline nodes") + `update_workflow_nodes`
+ `manage_versions` (fork/publish/lock). Es exactamente lo mismo que permite `@happyrobot-ai/workflow-sdk`
(§ganas de construir el motor de eventos), solo que vía MCP conversacional en lugar de vía TypeScript.
Para nuestro caso (automatizar la inyección de eventos de la crisis o generar workflows dinámicamente),
**el camino más controlable es `@happyrobot-ai/workflow-sdk`+ SDK público**, no el MCP — el MCP está
pensado para que un asistente de IA edite workflows de forma conversacional/interactiva, no para
integrarlo como dependencia de nuestro backend de producción del hackathon.

---

## 7. Approval Process y Transfer

### Transfer

**[VERIFICADO — `@happyrobot-ai/workflow-sdk`]** Dos nodos relacionados, distintos:

- **`phone.direct_transfer`** (`phoneDirectTransfer`): transferencia real de la llamada a un número. Config
  muy completa y verificada: `number`, `extension`, `fallback_number`, `agent` (transferir a "otro agente"
  estático o dinámico), **`warm_handoff: boolean`** (el agente IA se queda en línea y hace un resumen antes
  de colgar), `handoff_message`, **`whisper_transfer`** + `whisper_message` (susurra contexto a quien
  recibe antes de conectar al caller), `transfer_timeout`, `record_transfer_conversation`,
  `respect_business_hours`, headers UUI (`uui_data_format: json|text`, `uui_encoding: hex|ascii|base64`) —
  esto último es interoperabilidad con centralitas telefónicas empresariales (User-to-User Information de
  SIP/ISDN).
- **`transfer_popup.create_popup`** (`transferPopupCreatePopup`): esto es la pieza de **Control** que
  buscamos — crea una "tarjeta" de traspaso con `phone_number`, `transfer_summary`, `location {lat, lng,
  description, timestamp}`, `transcript`, `enable_feedback`, `ttl_days` (1–365) y `data` (pares clave-valor
  libres). Es, con alta probabilidad, lo que alimenta la vista humana de "esta llamada se está transfiriendo,
  aquí tienes resumen + ubicación + transcript" — exactamente el tipo de superficie que necesitamos para
  que el operador de Protección Civil vea qué está pasando y pueda intervenir. No hay confirmación de
  **dónde se renderiza** esa popup (¿en la UI de HappyRobot? ¿se puede leer por API para pintarla en
  nuestro propio dashboard?) — pregunta para el stand.

### Approval Process

**[NO ENCONTRADO — búsqueda exhaustiva]** Ni el SDK público (`@happyrobot-ai/sdk`), ni el catálogo
completo de tipos de nodo de `@happyrobot-ai/workflow-sdk` (~100 event types listados, ver §Node catalog
más abajo), ni el MCP server, mencionan nada de "approval" en ningún sitio. Esto sugiere fuertemente que
**"Approval Process" es una feature de gobernanza a nivel de workflow/versión** (p. ej. exigir sign-off
humano antes de publicar una versión a producción) — coherente con que el equipo la vio como pestaña al
mismo nivel que "Out of Office" y "Signals" (que tampoco aparecen como nodos), no como un nodo dentro del
flujo de una llamada. Pero es una inferencia, no una verificación: no hay evidencia de que exista una API
para resolverla programáticamente. **Pregunta obligatoria para el stand.**

---

## 8. Northstars, Runs, Experiments, Signals

**[VERIFICADO — `@happyrobot-ai/sdk` README, resources `northstars.js`, `runs.js`]**

- **Northstars**: criterios de calidad que gradúan automáticamente las conversaciones. API completa:
  `get/update/delete`, `getHistory` (cadena completa de regeneración), `submitFeedback` (puntuar de −2 a
  +2, con `trigger_regeneration` opcional), `deleteFeedback`. Un thumbs-up en un **audit remark**
  (`client.auditRemarks.submitFeedback({polarity: true})`) **añade automáticamente ese remark como
  ejemplo positivo del northstar** — esto es la pieza de auto-mejora ("aprender de ejecuciones
  anteriores") más concreta y verificada que encontramos: es un bucle de feedback humano→criterio
  documentado y con API.
- **Runs**: `get`, `getSessions`, `getRecordings`, `getFlags`, `cancel`, `mark` (anotar
  correct/incorrect/critical). Es la unidad de "una ejecución de un workflow" (una llamada, un chat, un
  webhook procesado).
- **Custom Evals**: tests que corren contra un nodo de prompt concreto, con `run()` async y
  `listRuns()` para ver pass/fail + razonamiento del juez — la vía obvia para "revisar decisiones pasadas
  y ajustar" de forma automatizada (podríamos generar evals a partir de runs reales de nuestra demo).
- **Adversarial Tests/Suites**: red-teaming retenido, solo lectura por API pública (`adversarialTests`,
  `adversarialSuites`) — para *crear* nuevos, se usa `e2eScenarios.create()` + `.run()`.
- **Experiments**: **[NO ENCONTRADO]** — no hay ningún resource `experiments` en el SDK público ni en el
  catálogo de nodos. La pestaña "Experiments" que vio el equipo en el Workflow editor no tiene contraparte
  de API confirmada; puede ser A/B testing de versiones a nivel UI únicamente.
- **Signals**: **[NO ENCONTRADO]** — mismo caso que Experiments, ninguna traza en SDK/MCP/catálogo de
  nodos. Pregunta para el stand.

---

## 9. Interfaces / Web SDK — cómo meter el botón de llamada en nuestro dashboard

**[VERIFICADO — repo oficial `voice-sdk-example` y `chatbot-sdk-example`, leídos completos]**

**No hace falta ningún snippet/iframe/widget preconstruido.** El patrón oficial (con código de ejemplo
completo en los repos, probado por el propio HappyRobot) es:

1. **Nuestro backend** (que guarda la API key en secreto) llama:
   ```ts
   import { HappyRobotClient } from "@happyrobot-ai/sdk";
   const client = new HappyRobotClient({ apiKey: process.env.HAPPYROBOT_API_KEY, cluster: "eu" });
   const { url, token, room_name, run_id } = await client.voice.createToken({
     workflow_id: WORKFLOW_ID,           // debe tener un nodo "Web Call" (ai.web_call)
     data: { /* payload libre pasado como participant attributes al agente */ },
   });
   ```
2. **Nuestro frontend** recibe `{url, token}` de nuestro propio endpoint y conecta por WebRTC vía LiveKit:
   ```ts
   import { HappyRobotVoiceClient } from "@happyrobot-ai/sdk/voice"; // requiere instalar livekit-client
   const voice = new HappyRobotVoiceClient({ url, token });
   const connection = await voice.connect({ onConnected, onAgentConnected, onDisconnected });
   // connection.mute() / .unmute() / .disconnect()
   ```
3. Para **intervenir/escuchar en directo una llamada en curso** (muy relevante para nuestra pantalla de
   Control): `client.voice.createToken({ session_id, should_takeover: true })` para tomar el control y
   que el agente IA se retire, o sin `should_takeover` + `.listen()` en el cliente para escuchar en
   silencio sin que el caller se entere. **Esto es directamente la feature de "ver qué hace el sistema e
   intervenir" de la rúbrica, con código ya escrito por HappyRobot.**

Hay un modo equivalente para **texto/chat** (`client.chat.createToken` + `HappyRobotChatClient`,
WebSocket con streaming de respuesta, ver §1) si preferimos un botón de chat en vez de llamada de voz
para el jurado.

No existe (que hayamos visto) un snippet `<script>`/iframe de "pega esto en tu HTML" — la vía oficial es
código, no embed declarativo. Coherente con que el paquete `@happyrobotai/web-client` (el cliente WebRTC
de bajo nivel del que depende `@happyrobot-ai/sdk/voice`) no trae ningún componente de UI, solo la
conexión.

---

## 10. Límites y cuotas

**[VERIFICADO, parcial]**
- Créditos de uso: **ya verificado directamente por el equipo en la UI** (Settings → Usage): ~24
  créditos/min de voz, ~7/mensaje de texto. No repetido aquí.
- Reintentos del SDK: 429 y 5xx se reintentan automáticamente (2 veces, backoff exponencial) — esto es
  evidencia indirecta de que **sí existe rate limiting** (si no, no tendría sentido manejar 429
  explícitamente en el cliente oficial), pero **no hay ningún número público de rate limit** (requests/min,
  llamadas concurrentes del plan de prueba, duración máxima de llamada). **[NO ENCONTRADO]** — esto es el
  riesgo más grande de la lista y hay que preguntarlo primero en el stand.
- Twin: SQL con timeout 5s, `SELECT` topado a 500 filas/1MB (§3) — esto sí es un límite duro y verificado.
- `client.chat.createToken`: `ttl_seconds` del token de chat, default 3600s, mínimo 60, máximo 86400 — no
  es un rate limit pero es un límite de sesión verificado.

---

## 11. La empresa

**[VERIFICADO — happyrobot.ai (home pública) + blog post oficial del anuncio de Series C]**

- **Producicto**: se autodenominan "AI operating system for the real economy" / "Enterprise
  Superintelligence". Cuatro pilares: Agents, Governance, Context, Interfaces (coincide 1:1 con lo que el
  equipo ya vio en el sidebar de la plataforma).
- **Verticales que dicen atacar** (más allá de logística/transporte, que es su origen y foco fuerte):
  utilities, aerolíneas, finanzas, seguros, manufactura, retail, telecom.
- **Clientes nombrados**: DHL, Kuehne+Nagel, Naturgy, Repsol, Uber (los dos últimos y Uber vía el blog de
  fundraising, no la home). Afirman "150+ enterprises" como clientes.
- **Métricas que presumen**: 10M+ interacciones/mes, 70%+ resolución autónoma, 75% reducción de coste,
  10x capacidad, casos concretos como "9.4/10 CSAT", "28.000 horas/mes automatizadas" en un cliente, "5x
  más ingresos" en ventas para otro.
- **Funding**: **Serie C de $150M** (ronda anunciada recientemente), ~$200M levantados en total,
  **valoración post-money $1.200M** (unicornio). Lideran **Prysm Capital** y **Eurazeo** (co-lead).
  Inversores previos que continúan: **a16z, Base10, Y Combinator**. Inversores estratégicos nuevos:
  Koch Disruptive Technologies (KDT), Kfund, **Orange**, **T.Capital (Deutsche Telekom)**, **Bankinter**,
  Endeavor Catalyst, Wave-X. La presencia de Orange, Deutsche Telekom (vía T.Capital) y Bankinter como
  inversores estratégicos es un dato de pitch fuerte: son justo el tipo de gran cuenta europea /
  regulada que necesitaría exactamente el tipo de gobernanza (Approval Process, Northstars, audit
  remarks) que ya construyeron para logística — el argumento "esto también sirve para el sector público"
  no es descabellado, ya están vendiendo a telecom/banca reguladas.
- **Fundador**: **Pablo Palafox**, co-founder y CEO (el único nombre que aparece en las fuentes
  consultadas; no hay lista de cofundadores adicional confirmada).
- **Huella**: "ocho localizaciones en Norteamérica, Europa, LATAM y Australia" (desde dos oficinas
  iniciales) — no dan headcount ni año de fundación exactos en las fuentes leídas.
- **Certificaciones** (footer de la web): SOC 2, ISO 27001, GDPR, HIPAA, EU AI Act, NIST CSF, DORA — muy
  relevante si en el pitch decimos que esto es apto para un uso B2G/crítico (CECOPI), porque ya cumplen
  marcos de riesgo/regulación fuertes (EU AI Act, DORA) pensados para sectores regulados.
- **No hay caso de uso público de sector público / emergencias** en ninguna fuente consultada — nuestra
  propuesta (B2G, evacuación de incendios) sería, según lo que vimos, **un vertical nuevo para ellos**, no
  uno que ya estén explotando. Esto es bueno para el pitch ("les abrimos categoría") pero significa que no
  hay wikis/casos previos en los que apoyarnos: hay que asumir que el equipo del stand tampoco tiene una
  respuesta ya enlatada para "emergencias/protección civil".

---

## Catálogo de tipos de nodo verificado (para referencia rápida del equipo)

**[VERIFICADO — `@happyrobot-ai/workflow-sdk`, `dist/generated/events.js`, lista completa de
`event_dot_name` soportados por el motor]**. Aparte de los ya detallados arriba (`webhook.*`, `twin.*`,
`code.run_python`, `phone.*`, `ai_agent.*`, `mcp_server.call`, `mcp.find_carriers`,
`transfer_popup.create_popup`, `schedule.sleep_for/until`), el motor soporta de forma nativa (confirmando
que el foco de producto sigue siendo muy logístico/TMS, y el resto son integraciones horizontales
reutilizables para nuestro caso):

- **Horizontales útiles para nosotros**: `ai.generate`, `ai.extract`, `ai.classify`, `ai.chatbot_request`,
  `ai.web_call`, `conditionals.paths`, `conditionals.conditional_output`, `file.*` (upload, OCR, parse,
  knowledge base), `redis.read_value`/`write_value`, `google_maps.distance_matrix/geocoding/timezone`
  (¡directamente útil para calcular rutas de evacuación!), `sheets.*`, `slack.*`, `teams.*`, `text.inbound_message`/`send_text` (SMS), `salesforce.*`, `gmail.*`/`outlook.*`/`sendgrid.*` (email),
  `snowflake.execute_query`, `contact_intelligence.*`.
- **Verticales de logística/TMS (no aplican a nuestro caso)**: `broker_app.*`, `brokers_custom_tms.*`,
  `mcleod.*`, `tpro.*`, `turvo.*`, `three_pl.*`, `capacity.carriers`, `negotiation.split_up`,
  `cxone.send_transcript`.

---

## Preguntas para el stand de HappyRobot

Ordenadas por cuánto nos bloquea si no tenemos respuesta antes de construir.

1. **Límites del plan de hackathon**: ¿cuántas llamadas de voz **concurrentes** soporta nuestra cuenta/API
   key ahora mismo, y cuál es el rate limit (requests/min) de la REST API? Nuestra demo depende de poder
   simular varias llamadas de evacuación en paralelo — si el plan limita a 1-2 concurrentes, necesitamos
   saberlo hoy para rediseñar la demo (p. ej. secuencial con overlay, en vez de paralelo real).
2. **¿Existe algún endpoint REST (no-MCP) para leer/escribir Twin desde fuera de un workflow?** El SDK
   público (`@happyrobot-ai/sdk`) no tiene `client.twin.*`; solo vimos acceso vía nodos `twin.read`/
   `twin.write` dentro de un workflow, o vía el servidor MCP `mcp-twin` (que habla protocolo MCP, no REST
   simple). Si vamos a usar Twin como "espejo del estado de crisis" leído por nuestro propio dashboard en
   tiempo real, necesitamos saber si hay una vía HTTP directa o si tenemos que pasar siempre por un
   workflow o por MCP.
3. **¿Qué es exactamente "Approval Process" en la pestaña del Workflow editor, y tiene API?** No
   encontramos ningún nodo, endpoint ni tool de MCP relacionado con "approval" en ningún sitio del código
   público. ¿Es solo gobernanza de publicación de versiones (sign-off humano antes de ir a producción), o
   hay algo tipo "pausar un run en mitad de ejecución hasta que un humano apruebe una acción concreta" que
   sí podríamos usar para el criterio de "Control" de la rúbrica?
4. **`transfer_popup.create_popup`**: ¿dónde se renderiza esa tarjeta (resumen + ubicación + transcript) —
   solo dentro de la UI de HappyRobot, o hay manera de leerla/suscribirnos a ella por API/webhook para
   pintarla en nuestro propio dashboard de Protección Civil?
5. **Timeouts y límites del Python Sandbox (`code.run_python`) y de los nodos de tool/webhook**: confirmamos
   que la whitelist de módulos (`math, datetime, pytz, re, dateutil, random, collections, json, _strptime,
   time, base64`) implica que no hay red saliente, pero no encontramos límite de tiempo de CPU/memoria de
   ejecución, ni un campo de timeout en los nodos `webhook.get/post/put/patch` cuando actúan como tool de un
   agente. Si un endpoint nuestro tarda en responder, ¿a los cuántos segundos corta HappyRobot la llamada?
6. **"Experiments" y "Signals"** (pestañas del Workflow editor): no hay ningún resource, endpoint o tool
   MCP correspondiente en el código público. ¿Son solo features de UI (A/B testing visual, señales
   internas de monitorización) sin superficie de API, o se nos escapó algo?
7. **CLI `happyrobot`**: el `workflow-sdk` asume que existe un comando `happyrobot` instalado (para
   `happyrobot workflows editor push`, `happyrobot voices`, `happyrobot phone-numbers`, etc.) pero no
   encontramos el paquete en el registro público de npm. ¿Cómo se instala exactamente?
8. **Duración máxima de una llamada de voz** (Web Call o telefónica) — no encontrado en ninguna fuente
   pública; importante para el guion de demo de 3 minutos y para no cortar una demo en directo delante
   del jurado.

---

## Riesgos de plataforma que pueden hundir la demo

- **Concurrencia real desconocida.** Si el plan de prueba limita llamadas simultáneas (muy probable en un
  plan de hackathon/trial), la promesa de "decenas de llamadas de evacuación en paralelo" se cae en
  directo. Mitigación: diseñar la demo para que funcione igual de bien con 2-3 llamadas simultáneas reales
  + el resto simulado/con datos precargados en el dashboard, y no anunciar un número de llamadas
  concurrentes que no hayamos probado nosotros mismos antes.
- **Sin callback nativo de HappyRobot → nosotros.** Todo lo que dependa de "saber que un run terminó" tiene
  que hacerse por *polling* (`client.runs.get`) o metiendo nosotros un nodo `webhook.post` al final del
  workflow. Si se nos olvida meter ese nodo en algún workflow, nuestro backend nunca se entera de que esa
  llamada terminó — riesgo de estado del dashboard desincronizado con la realidad durante la demo.
- **Twin sin API REST confirmada desde fuera de un workflow.** Si la única vía es MCP (protocolo pensado
  para asistentes conversacionales, no para un backend de producción con requisitos de latencia/reintentos
  claros) o triggerear workflows completos solo para leer una tabla, integrar Twin como "estado en vivo
  del mapa" puede ser más lento/frágil de lo que asumíamos. Mitigación: considerar tener nuestra propia
  base de datos como fuente de verdad del estado de crisis, y usar Twin solo como lo que sí está
  verificado (memoria dentro de un workflow), no como el backend de nuestro dashboard.
- **Python Sandbox sin red.** Cualquier diseño que asumiera "meter lógica de negocio con `requests` dentro
  de un nodo Python" no es viable — hay que rehacerlo como nodos `webhook.*` (HTTP) llamando a nuestro
  propio backend, lo cual además es más fácil de debuggear pero añade un salto de red y un servicio
  nuestro que **tiene que estar public-facing y disponible durante toda la demo** (single point of failure
  nuevo que no existía en el diseño "todo dentro de la plataforma").
- **`docs.happyrobot.ai` cerrado y wayback obsoleto (2023).** Toda nuestra comprensión de campos de
  config exactos de cada nodo viene de leer `.d.ts` generados de un SDK de terceros-oficiales, no de la
  documentación canónica. Es una fuente muy buena pero indirecta: si el equipo del stand nos da acceso al
  access code el primer día, hay que re-verificar rápidamente las piezas marcadas [NO ENCONTRADO] o
  [INFERIDO] contra la doc real antes de comprometernos a un diseño que dependa de ellas (Approval Process
  y límites/timeouts, sobre todo).
- **Cluster equivocado.** Existen `us` y `eu` con URLs y (probablemente) datos completamente separados.
  Todo el código (SDK, MCP, CLI) tiene que fijar `cluster: "eu"` / `HAPPYROBOT_CLUSTER=eu` de forma
  consistente — un solo sitio donde se nos olvide y apunte al cluster US por defecto rompe silenciosamente
  la integración (verá "vacío" en vez de error, porque US es una cuenta/org distinta, no un error de auth).
