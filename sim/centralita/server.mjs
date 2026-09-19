// Puente Vigía ↔ HappyRobot: recibe "olas" de personas desde el mapa,
// ejecuta una conversación real A↔V por persona y expone estado,
// instrucciones y resultados a las tools del workflow y al frontend.
// Node puro, sin frameworks. Uso: npm run bridge   (lee ../../.env)

import { createServer } from "node:http";
import { HERE, loadEnv, createHappyRobotClient, runConversation } from "./conversation.mjs";

const env = loadEnv();
const PORT = Number(env.BRIDGE_PORT || 8787);
const BRIDGE_API_KEY = env.BRIDGE_API_KEY || "";
const PUBLIC_BASE_URL = env.PUBLIC_BASE_URL || "http://127.0.0.1:5173";

if (!env.HR_API_KEY || !env.HR_WF_VIGIA_CHAT || !env.HR_WF_VECINO_SIMULADO) {
  console.error("Faltan HR_API_KEY / HR_WF_VIGIA_CHAT / HR_WF_VECINO_SIMULADO en .env");
  process.exit(1);
}
const client = createHappyRobotClient(env);

/** @type {Map<string, object>} person_id → estado de la llamada */
const calls = new Map();
const queue = [];
let running = 0;
let maxConcurrency = 4;

const ALLOWED_ORIGINS = new Set(["http://127.0.0.1:5173", "http://localhost:5173"]);

function corsHeaders(req) {
  const origin = req.headers.origin;
  const headers = {
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, x-api-key",
  };
  if (origin && ALLOWED_ORIGINS.has(origin)) headers["Access-Control-Allow-Origin"] = origin;
  else if (!origin) headers["Access-Control-Allow-Origin"] = "http://127.0.0.1:5173";
  return headers;
}

function send(res, req, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json", ...corsHeaders(req) });
  res.end(data);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1_000_000) req.destroy();
    });
    req.on("end", () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("JSON inválido"));
      }
    });
    req.on("error", reject);
  });
}

// La plataforma a veces serializa booleanos/null como cadenas.
function normalize(value) {
  if (value === "true") return true;
  if (value === "false") return false;
  if (value === "null") return null;
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = normalize(v);
    return out;
  }
  return value;
}

function authOk(req) {
  if (!BRIDGE_API_KEY) return true;
  return req.headers["x-api-key"] === BRIDGE_API_KEY;
}

function pumpQueue() {
  while (running < maxConcurrency && queue.length) {
    const call = queue.shift();
    running++;
    call.state = "talking";
    call.startedAt = new Date().toISOString();
    console.log(`[bridge] conversación inicia · ${call.person_id}`);
    runConversation(client, call.agentData, call.personaData, {
      env,
      onMessage: (speaker, text, rec) => {
        call.transcript.push(rec);
        console.log(`[${call.person_id}] ${speaker === "A" ? "VIGÍA" : "VECINO"}: ${text}`);
      },
      onEvent: (kind, detail) => console.log(`[${call.person_id}] evento ${kind}`, detail),
    })
      .then(({ endReason }) => {
        call.state = "done";
        call.endReason = endReason;
      })
      .catch((err) => {
        call.state = "failed";
        call.endReason = String(err?.message ?? err);
        console.error(`[bridge] conversación falló · ${call.person_id}:`, call.endReason);
      })
      .finally(() => {
        call.endedAt = new Date().toISOString();
        running--;
        pumpQueue();
      });
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const path = url.pathname;
  const log = (extra = "") => console.log(`[bridge] ${req.method} ${path} ${extra}`.trim());

  if (req.method === "OPTIONS") {
    res.writeHead(204, corsHeaders(req));
    return res.end();
  }

  try {
    if (req.method === "POST" && path === "/wave/start") {
      const body = await readBody(req);
      const people = Array.isArray(body.people) ? body.people : [];
      maxConcurrency = Math.max(1, Number(body.concurrency) || 4);
      let queued = 0;
      for (const p of people) {
        const id = p?.agent?.person_id ?? p?.persona?.person_id;
        if (!id) continue;
        const existing = calls.get(id);
        if (existing && existing.state !== "failed") continue;
        calls.set(id, {
          person_id: id,
          state: "queued",
          startedAt: null,
          endedAt: null,
          transcript: [],
          outcome: null,
          partials: [],
          links: [],
          instruction: p.instruction ?? null,
          agentData: p.agent ?? {},
          personaData: p.persona ?? {},
          endReason: null,
          version: 0,
        });
        queue.push(calls.get(id));
        queued++;
      }
      log(`${queued} en cola`);
      pumpQueue();
      return send(res, req, 200, { ok: true, queued });
    }

    if (req.method === "GET" && path === "/wave/status") {
      log();
      const list = [...calls.values()].map(({ agentData, personaData, ...call }) => call);
      return send(res, req, 200, { calls: list });
    }

    const instrMatch = path.match(/^\/instructions\/([^/]+)$/);
    if (req.method === "GET" && instrMatch) {
      const id = decodeURIComponent(instrMatch[1]);
      log(id);
      if (!authOk(req)) return send(res, req, 401, { error: "unauthorized" });
      const call = calls.get(id);
      if (!call || !call.instruction) return send(res, req, 404, { error: `sin instrucción para ${id}` });
      return send(res, req, 200, { ...call.instruction });
    }

    if (req.method === "POST" && path === "/links/send") {
      const body = normalize(await readBody(req));
      log(body.person_id ?? "");
      if (!authOk(req)) return send(res, req, 401, { error: "unauthorized" });
      const call = calls.get(body.person_id);
      const entry = { ts: new Date().toISOString(), phone: body.phone ?? null, channel: body.channel ?? null, consent_quote: body.consent_quote ?? null };
      if (call) {
        call.links.push(entry);
        call.consent_position = true;
      }
      return send(res, req, 200, {
        ok: true,
        url: `${PUBLIC_BASE_URL}/track?id=${encodeURIComponent(body.person_id ?? "")}`,
        simulated: true,
      });
    }

    if (req.method === "POST" && path === "/calls/outcome") {
      const body = normalize(await readBody(req));
      log(body.person_id ?? "");
      if (!authOk(req)) return send(res, req, 401, { error: "unauthorized" });
      const call = calls.get(body.person_id) ?? (() => {
        const c = { person_id: body.person_id, state: "done", startedAt: null, endedAt: null, transcript: [], outcome: null, partials: [], links: [], instruction: null, endReason: null, version: 0 };
        if (body.person_id) calls.set(body.person_id, c);
        return c;
      })();
      call.version = (call.version ?? 0) + 1;
      const extracted = body.extracted && typeof body.extracted === "object" ? body.extracted : {};
      if (body.partial === true) {
        call.partials.push(body);
        call.outcome = call.outcome ?? { person_id: body.person_id, extracted: {} };
        call.outcome.extracted = { ...(call.outcome.extracted ?? {}) };
        for (const [k, v] of Object.entries(extracted)) {
          if (v !== undefined) call.outcome.extracted[k] = v;
        }
      } else {
        const prevExtracted = call.outcome?.extracted ?? {};
        const mergedExtracted = { ...prevExtracted };
        for (const [k, v] of Object.entries(extracted)) {
          if (v !== null && v !== undefined) mergedExtracted[k] = v;
        }
        call.outcome = { ...body, extracted: mergedExtracted };
      }
      return send(res, req, 200, { ok: true, state_version: call.version, decisions: [] });
    }

    log("404");
    return send(res, req, 404, { error: "not found" });
  } catch (err) {
    console.error(`[bridge] error en ${req.method} ${path}:`, err);
    return send(res, req, 400, { error: String(err?.message ?? err) });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[bridge] escuchando en http://127.0.0.1:${PORT} · PUBLIC_BASE_URL=${PUBLIC_BASE_URL} · auth=${BRIDGE_API_KEY ? "sí" : "no"}`);
});
