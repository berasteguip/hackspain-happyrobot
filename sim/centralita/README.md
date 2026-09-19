# sim/centralita — prototipo de centralita Vigía

Pone a hablar entre sí dos agentes de chat de HappyRobot:

- **A = WF-1 "Vigía · vecino (chat)"** (`HR_WF_VIGIA_CHAT`): agente de Protección Civil,
  habla primero (mensaje inicial).
- **V = WF-P "Vigía · vecino simulado"** (`HR_WF_VECINO_SIMULADO`): interpreta al vecino,
  no tiene mensaje inicial.

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
