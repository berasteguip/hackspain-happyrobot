# sim/centralita — prototipo de centralita Vigía

Pone a hablar entre sí dos agentes de chat de HappyRobot:

- **A = WF-1 "Vigía · vecino (chat)"** (`HR_WF_VIGIA_CHAT`): agente de Protección Civil,
  habla primero (mensaje inicial).
- **V = WF-P "Vigía · vecino simulado"** (`HR_WF_VECINO_SIMULADO`): interpreta al vecino,
  no tiene mensaje inicial.

## Puente HTTP integrado — 2026-09-19

Arranque actual: `npm ci && npm run bridge`. Node 24, puerto 8787 por defecto.
Lee el `.env` de la raíz o el archivo indicado por `BRIDGE_ENV_FILE`, sin enviarlo al navegador.
Requiere `HR_API_KEY`, `HR_WF_VIGIA_CHAT`, `HR_WF_VECINO_SIMULADO`.
Configuración opcional: `BRIDGE_PORT`, `BRIDGE_API_KEY`, `PUBLIC_BASE_URL`.
`BRIDGE_ALLOWED_ORIGINS` añade orígenes explícitos separados por coma para otras previews.
`BRIDGE_RECOVERY_URL=http://127.0.0.1:PUERTO` permite trasladar conversaciones ya terminadas
desde otro puente local en ejecución y volver a leer sus extracciones, sin abrir chats.
Rechaza orígenes externos y snapshots con conversaciones todavía en curso.

- `POST /wave/start`: de 1 a 4 fichas `{agent, persona, instruction, tracking_id}`;
  `agent.person_id` y `persona.person_id` deben coincidir. Concurrencia limitada a 4.
  El frontend usa IDs únicos por ola y conserva `tracking_id` para el enlace `/track`.
- `GET /wave/status`: estado del chat, transcript, outcome y `resultState`
  (`pending`, `ready`, `failed`). Terminar el chat no implica haber recibido la extracción.
- `GET /health`: comprueba que el puente está levantado, sin crear runs.
- `POST /calls/outcome`: callback autenticado; admite resultados parciales sin tratarlos
  como finales. Si el webhook no llega, se consulta Extract por la API.
- El pull refresca los nodos pendientes y prioriza la coincidencia de sesión, para no
  atribuir un run anterior a una nueva conversación con el mismo contacto.
- El estado está en memoria. No hay llamadas telefónicas ni SMS en esta centralita.
  Un error de transporte no se convierte en una negativa o en ausencia de respuesta del vecino.

Tests sin red: `npm test`. Navegador: `npm run test:e2e` (Chrome, mapa en 5174;
`E2E_BASE_URL` permite otro origen). Por defecto todas las peticiones externas son controladas.
**`E2E_LIVE_HR=1` consume créditos y abre ocho runs; ejecutarlo solo con autorización.**
Incluso en ese modo, Mapbox usa respuestas de prueba: no verifica rutas reales de carretera.
`E2E_RECOVER_HR=1 npm run test:e2e` comprueba la recuperación de cuatro conversaciones existentes
sin crear runs, usando la acción «Recuperar última ola del puente». No combinar ambos flags.

Documentación del frontend: [`apps/command-center/README.md`](../../apps/command-center/README.md).

## Uso histórico del prototipo CLI

El script `conversar.mjs` no se incorpora a esta integración; el fragmento siguiente se conserva
como referencia del prototipo original. Para esta rama usar el puente HTTP descrito arriba.

Uso:

```bash
export PATH="$HOME/.local/bin:$PATH"   # Node 24
cd sim/centralita
node conversar.mjs
```

Salida: `out/<timestamp>-p-001.jsonl` (un evento por línea, con `ts`, `speaker`, `text`)
y `out/<timestamp>-p-001.txt` (transcripción legible).

## Contrato del SDK (`@happyrobot-ai/sdk@0.1.48`)

Fuentes consultadas (en `node_modules/@happyrobot-ai/sdk/`):

- `client.d.ts` — `new HappyRobotClient({ apiKey, cluster?: "us"|"eu", timeout, maxRetries, fetch })`.
- `resources/chat.d.ts` — `client.chat.createToken(body)`.
- `types/chat.types.d.ts` — todos los tipos de chat y eventos WS.
- `chat-client.d.ts` / `chat-client.js` — `HappyRobotChatClient`.
- `core/http.js` — `CLUSTER_URLS`: `us → https://platform.happyrobot.ai/api/v2`,
  `eu → https://platform.eu.happyrobot.ai/api/v2`.

### Server-side (API key)

```ts
const client = new HappyRobotClient({ apiKey, cluster: "eu" });
const { token, expires_at } = await client.chat.createToken({
  workflow_id: string,
  data?: Record<string, unknown>,   // payload del trigger "Chatbot Request"
  env?: "production"|"staging"|"development",
  ttl_seconds?: number,             // 60..86400, default 3600
});
```

`POST /chat/tokens`. Devuelve `{ token, expires_at }`.

### Client-side (scoped token, sin API key)

```ts
// OJO: se importa del subpath "/chat", no del root (el root no lo reexporta).
import { HappyRobotChatClient } from "@happyrobot-ai/sdk/chat";
const chat = new HappyRobotChatClient({ token, cluster: "eu" });
const { session_id } = await chat.createSession();        // POST /chat/sessions

const conn = chat.connect(session_id, {                    // WS /chat/sessions/:id/ws?token=...
  onConnected?: (sessionId) => void,
  onResponseStart?: () => void,                            // el agente empieza a generar
  onResponseChunk?: (content: string) => void,             // streaming parcial
  onResponseEnd?: (content: string) => void,               // respuesta COMPLETA del agente
  onSessionClosed?: (event: { type:"session-closed", session_id, status, reason, duration, timestamp }) => void,
  getToken?: () => Promise<string>,                        // refresh in-band si se pide
  onTokenRefreshed?: (expiresAt) => void,
  onTokenExpired?: () => void,
  onError?: (event) => void,
  onClose?: ({ code, reason }) => void,
});

await conn.sendMessage({ content: "texto del usuario" });  // WS, resuelve con message-ack
await conn.endSession();                                   // POST /chat/sessions/:id/close + cierra WS
conn.close();                                              // solo cierra el WS
```

Notas:

- En Node 24 funciona tal cual: usa `globalThis.WebSocket` y `crypto.randomUUID`,
  no necesita dependencias extra (`ws` no hace falta).
- El texto completo de cada turno del agente llega en `onResponseEnd`
  (`response-end`); los chunks parciales en `onResponseChunk`.
- Fin de conversación: evento `session-closed` (`onSessionClosed`) o cierre del WS.
- El mensaje inicial del agente (si el workflow lo tiene) llega como un
  `response-start`/`response-chunk`/`response-end` tras conectar, sin enviar nada.
- `chat.getHistory(session_id)` (`GET /chat/sessions/:id/history`) devuelve
  `{ messages: [{id, role, content, timestamp}], status, ... }` por si hace falta
  recuperar la conversación a posteriori.
- Errores HTTP: el SDK lanza `Error` con `parsed.error || parsed.message ||
  "Request failed with status N"` (no conserva el body completo; por eso
  `conversar.mjs` re-pide el endpoint en crudo si `createToken` falla, para
  capturar el cuerpo exacto).
