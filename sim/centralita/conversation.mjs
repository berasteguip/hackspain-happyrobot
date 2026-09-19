// Lógica de la centralita Vigía: conecta dos agentes de chat de HappyRobot.
// A = WF-1 "Vigía · vecino (chat)" (habla primero), V = WF-P "vecino simulado".
// Usado por conversar.mjs (CLI) y server.mjs (puente HTTP).

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { HappyRobotClient } from "@happyrobot-ai/sdk";
import { HappyRobotChatClient } from "@happyrobot-ai/sdk/chat";

export const HERE = dirname(fileURLToPath(import.meta.url));
export const ROOT = join(HERE, "..", "..");
const EU_BASE = "https://platform.eu.happyrobot.ai/api/v2";

// ---- .env manual (sin librerías) ----
export function loadEnv(path = join(ROOT, ".env")) {
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

export function createHappyRobotClient(env) {
  return new HappyRobotClient({ apiKey: env.HR_API_KEY, cluster: "eu" });
}

// createToken con captura del cuerpo exacto en caso de error.
async function createToken(client, apiKey, workflow_id, data, label) {
  // Cortes breves del hotspot: reintenta antes de dar la conversación por perdida.
  let err;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      return await client.chat.createToken({ workflow_id, data, ttl_seconds: 900 });
    } catch (e) {
      err = e;
      if (!/fetch failed|ECONN|ETIMEDOUT|ENOTFOUND|network/i.test(String(e?.message))) break;
      await new Promise((r) => setTimeout(r, 3000 * attempt));
    }
  }
  {
    let raw = "";
    let status = "n/a";
    try {
      const r = await fetch(`${EU_BASE}/chat/tokens`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ workflow_id, data, ttl_seconds: 900 }),
      });
      status = r.status;
      raw = await r.text();
    } catch (e2) {
      raw = `<fallo también la petición en crudo: ${e2.message}>`;
    }
    throw new Error(`createToken(${label}) falló. SDK: ${err.message}. HTTP ${status} body: ${raw}`);
  }
}

// ---- sesión de chat ----
function openChat(token, label, onEvent) {
  const chat = new HappyRobotChatClient({ token, cluster: "eu" });
  const state = {
    label,
    session_id: null,
    conn: null,
    queue: [],          // respuestas completas recibidas sin consumir
    waiter: null,       // resolve pendiente de next()
    closed: null,       // evento session-closed
    seen: new Set(),
    chat,
    lastEmitted: null,
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
    onEvent("session-created", { label, session_id });
    state.conn = chat.connect(session_id, {
      onConnected: (sid) => onEvent("ws-connected", { label, session_id: sid }),
      onResponseEnd: (content) => state.deliver(content),
      onSessionClosed: (e) => {
        onEvent("session-closed", { label, reason: e.reason, status: e.status });
        state.markClosed(e);
      },
      onTokenExpired: () => onEvent("token-expired", { label }),
      onError: () => onEvent("ws-error", { label }),
      onClose: (e) => {
        onEvent("ws-close", { label, code: e.code, reason: e.reason });
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
        if (via) onEvent("agent-message-via", { label, via });
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
          onEvent("history-poll-error", { label, error: String(e?.message ?? e) });
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

/**
 * Ejecuta una conversación A↔V completa.
 * @param {HappyRobotClient} client
 * @param {object} agentData  data del trigger de WF-1
 * @param {object} personaData data del trigger de WF-P
 * @param {object} opts {env, onMessage(speaker,text), onEvent(kind,detail), maxVecinoReplies, deadlineMs}
 * @returns {Promise<{endReason: string, messages: {ts:string,speaker:string,text:string}[]}>}
 */
export async function runConversation(client, agentData, personaData, opts = {}) {
  const env = opts.env ?? loadEnv();
  const onMessage = opts.onMessage ?? (() => {});
  const onEvent = opts.onEvent ?? (() => {});
  const maxVecinoReplies = opts.maxVecinoReplies ?? 8;
  const deadlineMs = opts.deadlineMs ?? 240000;
  const messages = [];
  const emit = (speaker, text) => {
    const rec = { ts: new Date().toISOString(), speaker, text };
    messages.push(rec);
    onMessage(speaker, text, rec);
  };

  let deadlineHit = false;
  const timer = setTimeout(() => {
    deadlineHit = true;
    onEvent("deadline", {});
  }, deadlineMs);
  timer.unref?.();

  const tokA = await createToken(client, env.HR_API_KEY, env.HR_WF_VIGIA_CHAT, agentData, "A/vigia");
  const tokV = await createToken(client, env.HR_API_KEY, env.HR_WF_VECINO_SIMULADO, personaData, "V/vecino");

  const A = openChat(tokA.token, "A", onEvent);
  const V = openChat(tokV.token, "V", onEvent);
  await A.connect();
  await V.connect();

  let endReason = null;
  let vecinoReplies = 0;
  try {
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
      if (vecinoReplies >= maxVecinoReplies) {
        endReason = `límite de ${maxVecinoReplies} respuestas del vecino`;
        break;
      }

      await A.conn.sendMessage({ content: vMsg });
      aMsg = await A.waitAgent();
    }
    if (!endReason) endReason = deadlineHit ? `deadline ${Math.round(deadlineMs / 60000)} min` : "fin";
  } finally {
    clearTimeout(timer);
    onEvent("end", { reason: endReason, vecinoReplies });
    for (const s of [A, V]) {
      try {
        if (s.conn && !s.closed) await s.conn.endSession();
        else s.conn?.close();
      } catch {
        s.conn?.close();
      }
    }
  }
  return { endReason, messages, agentSessionId: A.session_id, personaSessionId: V.session_id };
}
