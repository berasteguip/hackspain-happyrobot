// Centralita Vigía: conecta dos agentes de chat de HappyRobot entre sí.
// A = WF-1 "Vigía · vecino (chat)" (habla primero), V = WF-P "vecino simulado".
// Uso: node conversar.mjs   (lee ../../.env)

import { writeFileSync, appendFileSync, mkdirSync } from "node:fs";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { HappyRobotClient } from "@happyrobot-ai/sdk";
import { HappyRobotChatClient } from "@happyrobot-ai/sdk/chat";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const OUT = join(HERE, "out");
mkdirSync(OUT, { recursive: true });

// ---- .env manual (sin librerías) ----
function loadEnv(path) {
  const env = {};
  for (const rawLine of readFileSync(path, "utf8").split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim().replace(/^export\s+/, "");
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    env[key] = val;
  }
  return env;
}

const env = loadEnv(join(ROOT, ".env"));
const { HR_API_KEY, HR_WF_VIGIA_CHAT, HR_WF_VECINO_SIMULADO } = env;
for (const [k, v] of Object.entries({ HR_API_KEY, HR_WF_VIGIA_CHAT, HR_WF_VECINO_SIMULADO })) {
  if (!v) {
    console.error(`Falta ${k} en .env`);
    process.exit(1);
  }
}

const EU_BASE = "https://platform.eu.happyrobot.ai/api/v2";
const MAX_VECINO_REPLIES = 8;
const DEADLINE_MS = 4 * 60 * 1000;

const DATA_A = {
  person_id: "p-001",
  house_id: "h-001",
  phone: "+34600990001",
  first_name: "Antonio",
  village: "Guisando",
  address: "Calle Real 12",
  priority: "0.82",
  assigned_shelter: "PE-01 La Dehesa",
  vulnerable_flag: "no",
  known_context: "núcleo de 2 según censo",
};
const DATA_V = {
  person_id: "p-001",
  name: "Antonio Prieto",
  age: "71",
  village: "Guisando",
  address: "Calle Real 12",
  household: "mi mujer Carmen (68) y yo",
  mobility: "car",
  has_car: "true",
  seats_free: "2",
  has_smartphone: "true",
  personality: "cooperative",
  neighbors_known: "Rosa, la de al lado, vive sola",
  vulnerable_note: "ninguna",
  is_away: "false",
  true_location: "Calle Real 12, Guisando",
  has_animals: "dos perros",
};

// ---- salida ----
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const jsonlPath = join(OUT, `${stamp}-p-001.jsonl`);
const txtPath = join(OUT, `${stamp}-p-001.txt`);
const txtLines = [];
function emit(speaker, text, extra = {}) {
  const rec = { ts: new Date().toISOString(), speaker, text, ...extra };
  appendFileSync(jsonlPath, JSON.stringify(rec) + "\n");
  const label = speaker === "A" ? "VIGÍA" : speaker === "V" ? "VECINO" : speaker;
  txtLines.push(`[${rec.ts}] ${label}: ${text}`);
  console.log(`\n=== ${label} ===\n${text}`);
}
function emitEvent(kind, detail) {
  appendFileSync(jsonlPath, JSON.stringify({ ts: new Date().toISOString(), event: kind, ...detail }) + "\n");
}
function flushTxt(endReason) {
  txtLines.push(`\n--- fin: ${endReason} ---`);
  writeFileSync(txtPath, txtLines.join("\n\n") + "\n");
}

// ---- createToken con captura del cuerpo exacto en caso de error ----
const client = new HappyRobotClient({ apiKey: HR_API_KEY, cluster: "eu" });
async function createToken(workflow_id, data, label) {
  try {
    return await client.chat.createToken({ workflow_id, data, ttl_seconds: 600 });
  } catch (err) {
    // El SDK no conserva el body completo; re-pedimos en crudo para capturarlo.
    let raw = "";
    let status = "n/a";
    try {
      const r = await fetch(`${EU_BASE}/chat/tokens`, {
        method: "POST",
        headers: { Authorization: `Bearer ${HR_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ workflow_id, data, ttl_seconds: 600 }),
      });
      status = r.status;
      raw = await r.text();
    } catch (e2) {
      raw = `<fallo también la petición en crudo: ${e2.message}>`;
    }
    console.error(`createToken(${label}) falló. SDK error: ${err.message}`);
    console.error(`HTTP ${status} body exacto: ${raw}`);
    process.exit(2);
  }
}

// ---- sesión de chat ----
let deadlineHit = false;
function openChat(token, label) {
  const chat = new HappyRobotChatClient({ token, cluster: "eu" });
  const state = {
    label,
    session_id: null,
    conn: null,
    queue: [],          // respuestas completas recibidas sin consumir
    waiter: null,       // resolve pendiente de next()
    closed: null,       // evento session-closed
  };
  state.next = () =>
    new Promise((resolve) => {
      if (state.queue.length) return resolve(state.queue.shift());
      if (state.closed) return resolve(null);
      state.waiter = resolve;
    });
  state.deliver = (content) => {
    if (state.waiter) {
      const r = state.waiter;
      state.waiter = null;
      r(content);
    } else {
      state.queue.push(content);
    }
  };
  state.markClosed = (event) => {
    state.closed = event;
    if (state.waiter) {
      const r = state.waiter;
      state.waiter = null;
      r(null);
    }
  };
  state.connect = async () => {
    const { session_id } = await chat.createSession();
    state.session_id = session_id;
    emitEvent("session-created", { label, session_id });
    state.seen = new Set();
    state.chat = chat;
    state.conn = chat.connect(session_id, {
      onConnected: (sid) => emitEvent("ws-connected", { label, session_id: sid }),
      onResponseEnd: (content) => state.deliver(content),
      onSessionClosed: (e) => {
        emitEvent("session-closed", { label, reason: e.reason, status: e.status });
        state.markClosed(e);
      },
      onTokenExpired: () => emitEvent("token-expired", { label }),
      onError: () => emitEvent("ws-error", { label }),
      onClose: (e) => {
        emitEvent("ws-close", { label, code: e.code, reason: e.reason });
        state.markClosed({ reason: `ws-close ${e.code}` });
      },
    });
  };
  // Espera la siguiente respuesta del agente: primero por WS (response-end);
  // si en `pollAfterMs` no llega nada, consulta getHistory por si el mensaje
  // (p.ej. el inicial del workflow) solo queda registrado en el historial.
  state.waitAgent = (timeoutMs = 120000, pollAfterMs = 25000) =>
    new Promise((resolve) => {
      let done = false;
      let poller = null;
      let pollStarter = null;
      const finish = (v, via) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        clearTimeout(pollStarter);
        if (poller) clearInterval(poller);
        if (via) emitEvent("agent-message-via", { label, via });
        if (v !== null) state.lastEmitted = v;
        resolve(v);
      };
      const poll = async () => {
        try {
          const h = await state.chat.getHistory(state.session_id);
          const fresh = (h.messages ?? []).filter((m) => !state.seen.has(m.id));
          fresh.forEach((m) => state.seen.add(m.id));
          const agentMsgs = fresh.filter((m) => m.role !== "user" && m.content !== state.lastEmitted);
          if (agentMsgs.length) finish(agentMsgs.map((m) => m.content).join("\n"), "history");
        } catch (e) {
          emitEvent("history-poll-error", { label, error: String(e?.message ?? e) });
        }
      };
      const timer = setTimeout(() => finish(null), timeoutMs);
      pollStarter = setTimeout(() => {
        poller = setInterval(poll, 8000);
        poll();
      }, pollAfterMs);
      state.next().then((v) => finish(v, v === null ? "closed" : "ws"));
    });
  return state;
}

async function main() {
  const timer = setTimeout(() => {
    deadlineHit = true;
    emitEvent("deadline", {});
  }, DEADLINE_MS);
  timer.unref?.();

  console.log("Creando tokens…");
  const tokA = await createToken(HR_WF_VIGIA_CHAT, DATA_A, "A/vigia");
  const tokV = await createToken(HR_WF_VECINO_SIMULADO, DATA_V, "V/vecino");

  const A = openChat(tokA.token, "A");
  const V = openChat(tokV.token, "V");

  console.log("Abriendo sesiones…");
  await A.connect();
  await V.connect();

  let endReason = null;
  let vecinoReplies = 0;

  // A habla primero (mensaje inicial del workflow).
  console.log("Esperando mensaje inicial del Vigía…");
  let aMsg = await A.waitAgent();

  while (!deadlineHit) {
    if (aMsg === null) {
      endReason = A.closed
        ? `sesión A cerrada (${A.closed.reason ?? "?"})`
        : "timeout esperando respuesta de A";
      break;
    }
    if (A.closed) {
      endReason = `sesión A cerrada (${A.closed.reason})`;
      break;
    }
    emit("A", aMsg);

    // A → V
    await V.conn.sendMessage({ content: aMsg });
    const vMsg = await V.waitAgent();
    if (vMsg === null) {
      endReason = V.closed
        ? `sesión V cerrada (${V.closed.reason ?? "?"})`
        : "timeout esperando respuesta de V";
      break;
    }
    vecinoReplies++;
    emit("V", vMsg);
    if (V.closed) {
      endReason = `sesión V cerrada (${V.closed.reason})`;
      break;
    }
    if (vecinoReplies >= MAX_VECINO_REPLIES) {
      endReason = `límite de ${MAX_VECINO_REPLIES} respuestas del vecino`;
      break;
    }

    // V → A
    await A.conn.sendMessage({ content: vMsg });
    aMsg = await A.waitAgent();
  }
  if (!endReason) endReason = deadlineHit ? "deadline 4 min" : "fin";

  emitEvent("end", { reason: endReason, vecinoReplies });
  flushTxt(endReason);

  for (const s of [A, V]) {
    try {
      if (s.conn && !s.closed) await s.conn.endSession();
      else s.conn?.close();
    } catch {
      s.conn?.close();
    }
  }
  console.log(`\nFin: ${endReason}. Respuestas del vecino: ${vecinoReplies}.`);
  console.log(`JSONL: ${jsonlPath}`);
  console.log(`TXT:   ${txtPath}`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Error fatal:", err);
  emitEvent("fatal", { error: String(err?.message ?? err) });
  flushTxt(`error: ${err?.message ?? err}`);
  process.exit(1);
});
