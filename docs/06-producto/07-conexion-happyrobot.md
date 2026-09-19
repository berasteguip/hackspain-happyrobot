# Cómo está conectado el mapa con HappyRobot (y cómo conectar otra app igual)

> **Actualizado:** 2026-09-19 · **Estado:** funcionando, probado con olas reales desde el mapa.
> Escrito para que otra versión del frontend (p. ej. `web/dashboard`) se conecte **igual** sin
> tocar nada de HappyRobot. Todo lo de aquí está en la rama `devin/vigia-grupos-puntos-encuentro`.

## 1. Qué hay y quién habla con quién

```
Frontend (apps/command-center)                    HappyRobot (cuenta hackspainteam11)
  Play ──POST /wave/start──►  PUENTE  ──chat tokens──►  WF "Vigía · vecino (chat)"   (agente Protección Civil)
                              (Node,   ──chat tokens──►  WF "Vigía · vecino simulado" (vecino con personalidad)
  poll GET /wave/status ◄──   :8787)   ◄── mensajes de uno se reenvían al otro (centralita)
                                       ◄── POST /calls/outcome (webhook, si hay túnel)
                                       ──► pull del resultado por la API de HappyRobot (siempre)
```

- **Puente**: `sim/centralita/server.mjs`. Proceso Node local. Abre, por cada persona, dos sesiones de
  chat en HappyRobot y pasa los mensajes entre ambas. Guarda transcripción y resultado en memoria.
- **Agente Vigía** (workflow `01a0b937-7bf9-7a6d-be1a-ad6b824dedc0`, versión 5 live): trigger *Chatbot
  Request* → *Inbound Text Agent* (gpt-4.1, prompt `prompts/01` adaptado, sin tools) → *AI Extract*
  (12 campos del contrato + `agent_notes` + `answered`) → *POST /calls/outcome* al puente.
- **Vecino simulado** (workflow `01a0b942-b5d6-7823-8d61-3e936478dd04`, live): trigger *Chatbot Request*
  con la ficha del vecino → *Inbound Text Agent* que interpreta a la persona (cooperative / anxious /
  reluctant / confused / wrong_info). Sin mensaje inicial: contesta a lo que le llega.
- **No hay tools** en el agente: en este canal la plataforma no las ejecuta (el modelo disparaba
  `end_conversation` en su lugar). El punto de encuentro viaja en el trigger (`say_this`) y el
  consentimiento/vulnerables salen de la extracción. El "SMS" con el enlace lo simula el puente.
- **No hace falta ninguna clave de LLM**: los modelos los paga la cuenta. Solo la **API key del workspace**.

## 2. Arrancar (dos terminales + el frontend)

Requisitos: Node 24 (`~/.local/bin` si se instaló en este Mac), `.env` en la raíz del repo:

```
HR_API_KEY=sk_live_...                 # Settings → API Keys del workspace (no se comitea)
HR_BASE_URL=https://platform.eu.happyrobot.ai/api/v2
HR_WF_VIGIA_CHAT=01a0b937-7bf9-7a6d-be1a-ad6b824dedc0
HR_WF_VECINO_SIMULADO=01a0b942-b5d6-7823-8d61-3e936478dd04
BRIDGE_PORT=8787
BRIDGE_API_KEY=cambiame                 # debe coincidir con la variable API_KEY del workflow
PUBLIC_BASE_URL=                        # URL del túnel si lo hay; si no, vacío
ALLOW_REAL_CALLS=false
```

```bash
cd sim/centralita && npm ci && npm run bridge        # puente en 127.0.0.1:8787
cd apps/command-center && npm ci && npm run dev      # mapa en 127.0.0.1:5173
```

**Túnel (opcional).** Solo sirve para que el `POST /calls/outcome` del workflow llegue directo. Si no
hay túnel, el puente **va a buscar el resultado a la API de HappyRobot** al terminar cada conversación
(`pull.mjs`), así que funciona igual. Si se quiere: `cloudflared tunnel --url http://localhost:8787`,
y poner la URL en `PUBLIC_BASE_URL` y en la variable `API_BASE_URL` del workflow del agente (MCP o UI).
La wifi de la UPM bloquea los túneles; con hotspot funciona.

## 3. Contrato del puente (esto es lo que otra app tiene que usar)

Todas las rutas devuelven JSON. CORS abierto para `localhost:5173` y `127.0.0.1:5173` (añadir el
origen de la otra app en `server.mjs` si es distinto).

### `POST /wave/start` — lanzar una ola

```json
{
  "concurrency": 4,
  "people": [
    {
      "agent": {
        "person_id": "c-116", "house_id": "h-c-116", "phone": "+34600990016",
        "first_name": "Raúl", "village": "Guisando", "address": "dirección censada en Guisando",
        "priority": "0.80",
        "assigned_shelter": "PE-01 La Dehesa · Guisando",
        "say_this": "Salga hacia La Dehesa, en Guisando. No suba hacia el monte y no cruce la zona del incendio.",
        "vulnerable_flag": "no", "known_context": "núcleo de 3 según censo"
      },
      "persona": {
        "person_id": "c-116", "name": "Raúl Sánchez", "age": "62", "village": "Guisando",
        "address": "Calle Real 17", "household": "2 adultos, 1 menor",
        "mobility": "walking", "has_car": "false", "seats_free": "0", "has_smartphone": "true",
        "personality": "cooperative", "neighbors_known": "María Ortega",
        "vulnerable_note": "ninguna", "is_away": "false", "true_location": "Calle Real 17",
        "has_animals": "un perro"
      },
      "instruction": {
        "exit_name": "PE-01 La Dehesa · Guisando",
        "say_this": "Salga hacia La Dehesa, en Guisando. No suba hacia el monte y no cruce la zona del incendio.",
        "minutes_to_front": null, "urgency": "high"
      }
    }
  ]
}
```

- `agent` = datos del trigger del agente Vigía (todos string). **`say_this` es lo que el agente dirá
  literalmente** como instrucción de salida: la decide vuestra app (refugio, aforo, ruta), no HappyRobot.
- `persona` = ficha del vecino simulado (todos string). `personality` ∈ `cooperative | anxious |
  reluctant | confused | wrong_info`. `mobility` ∈ `car | walking | reduced | immobile`.
- `instruction` = lo que devolvería `GET /instructions/:id` si el agente tuviera tools (hoy no las usa).
- Respuesta: `{"ok": true, "queued": n}`. Ids ya en curso o terminados se ignoran.

### `GET /wave/status` — estado de todas las conversaciones (poll cada 2 s)

```json
{"calls":[{
  "person_id":"c-116","state":"queued|talking|done|failed",
  "startedAt":"…","endedAt":"…","endReason":"sesión V cerrada (user_requested)",
  "transcript":[{"ts":"…","speaker":"A","text":"Le escribo de Protección Civil…"},{"ts":"…","speaker":"V","text":"Sí, estoy en casa…"}],
  "outcome":{
    "run_id":"…","transcript_url":"https://platform.eu.happyrobot.ai/hackspainteam11/runs/…",
    "answered":true,"agent_notes":"",
    "extracted":{"people_at_home":5,"declared_location":"Calle Real 49","declared_lat":null,"declared_lon":null,
      "mobility":"walking","has_car":false,"seats_free":null,"has_smartphone":true,
      "consent_position":true,"will_evacuate":true,
      "neighbors_mentioned":[{"name":"Rosa","phone":null,"address":"la casa de al lado","at_home":true}],
      "vulnerable_people":[{"description":"madre, 87 años, anda despacio","needs":"traslado"}]}
  },
  "links":[{"ts":"…","channel":"sms","simulated":true,"url":"…/track?id=c-116"}],
  "consent_position":true
}]}
```

- `speaker`: `A` = agente Vigía, `V` = vecino.
- `outcome` es `null` hasta que termina la extracción (webhook o pull, ~5–15 s tras cerrar el chat).
- Lo que hace el mapa con `extracted` (copiar tal cual en otra app):
  `answered:false` → sin respuesta · `will_evacuate:true` → se mueve al refugio de `say_this` ·
  `will_evacuate:false` → pendiente de asistencia / rellamada · `consent_position:true` → ubicación
  compartida (la posición sigue siendo la censada: **no se inventa GPS**) · `people_at_home` → tamaño del
  grupo · `vulnerable_people` → prioridad de traslado.

### Rutas que llama el workflow (solo con túnel)

- `POST /calls/outcome` (cuerpo del contrato §3 de `03-contrato-de-datos.md`, `x-api-key`).
- `GET /instructions/:person_id`, `POST /links/send` existen por compatibilidad; hoy el agente no las usa.

## 4. Cómo lo hace `apps/command-center` (referencia de integración)

- `src/bridge.ts`: `pickWaveCitizens` (4 de Guisando), `buildWavePeople` (mapea Citizen → `agent` /
  `persona` / `instruction`, alternando PE-01 y PE-02), `startWave`, `fetchWaveStatus`, `applyWaveStatus`
  (aplica `extracted` al estado).
- `src/CommandCenter.tsx`: primer Play → ola; poll cada 2 s mientras haya conversaciones activas; ficha con
  la transcripción y enlace al run.
- `src/simulation.ts`: con ola activa (`onlyHr`) **solo se mueven los llamados**; el simulador prefiere el
  refugio que dijo el agente (`hrCall.zoneId`).

## 5. Dónde mirar si algo falla

- `sim/centralita/out/bridge.log`: cada mensaje, cada POST entrante, `outcome por pull · c-xxx`.
- `curl -s http://127.0.0.1:8787/wave/status` (sin auth).
- Runs: [agente](https://platform.eu.happyrobot.ai/hackspainteam11/workflows/z38ck8uuypre/runs) ·
  [vecinos](https://platform.eu.happyrobot.ai/hackspainteam11/workflows/8yj9tmk34vg4/runs).
- `createToken … fetch failed` en el log = corte de red (hotspot). El puente reintenta 4 veces.
- Una conversación con 1 solo mensaje y `idle_timeout` = el vecino simulado no contestó; cuenta como
  "sin respuesta".
- Cada ola de 4 = 8 runs y consume créditos de la cuenta.

## 6. Lo que NO está hecho todavía

- `api/` (Python) no participa: el puente hace de fuente de verdad temporal para las conversaciones.
  Cuando `api/` esté en Gredos, sustituye al puente hablando el mismo contrato (`/calls/outcome`, etc.).
- Rellamadas (bucle ámbar), bucle azul (vecinos mencionados → nuevas llamadas), voz real (sin número/SIP).
- Ficha del vecino generada desde el censo real de `data/` (hoy se deriva del escenario del mapa).

## Fuentes

- Workflows y runs leídos por MCP el 19 sep 2026. SDK `@happyrobot-ai/sdk@0.1.48` (contrato en
  `sim/centralita/README.md`). Decisiones 002 y 003 en `docs/07-decisiones/`.
