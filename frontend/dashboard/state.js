/* ============================================================
   state.js — ÚNICO cliente de la API del dashboard.
   - Carga inicial: GET /state
   - Después: long-poll a GET /state/diff?since_version=N con reintentos y backoff.
   - Si la API se cae: banner + la pantalla sigue mostrando lo último bueno.
   - Store mínimo con suscripciones (nada de reinventar Redux).

   Contrato: docs/06-producto/03-contrato-de-datos.md. Este fichero NO inventa campos obligatorios;
   los campos opcionales que aprovecha si existen están anotados con OPCIONAL.
   ============================================================ */

const qs = new URLSearchParams(location.search);
const userCfg = (typeof window !== "undefined" && window.DASHBOARD_CONFIG) || {};

export const CONFIG = {
  apiBase: String(qs.get("api") || userCfg.API_BASE_URL || "http://localhost:8000").replace(/\/+$/, ""),
  apiKey: qs.get("key") || userCfg.API_KEY || "cambiame",
  operator: qs.get("operator") || userCfg.OPERATOR || "puesto-de-mando",
  // Enlace de reserva de la Web call de HappyRobot (mientras no esté el embed).
  webCallUrl: qs.get("webcall") || userCfg.WEB_CALL_URL || "",
  // ?mock=1 → escenario embebido en el navegador, sin API. Plan B total.
  mock: qs.get("mock") === "1",
};

/* ------------------------------------------------------------------
   Store mínimo
   ------------------------------------------------------------------ */
const MAX_DECISIONS = 500;

const state = {
  conn: "connecting",        // connecting | online | offline | mock
  connDetail: "",
  lastGoodAt: null,          // Date de la última respuesta buena
  version: 0,
  t: null,                   // hora del escenario (ISO)
  t0: null,                  // primera hora vista → "minutos desde el aviso"
  people: {},                // id → Person
  houses: {},                // id → House
  sectors: {},               // id → Sector
  convoys: {},               // id → Convoy
  patrols: {},               // id → Patrol
  safeZones: {},             // id → SafeZone
  roadClosures: {},          // id → RoadClosure
  fire: null,                // Fire
  decisions: [],             // DecisionLogEntry[] más nuevas primero
  decisionIds: new Set(),
  queue: [],                 // GET /queue
  queueFallback: false,      // true si lo derivamos nosotros (la API no lo sirve)
  noAnswer: [],              // GET /houses/no-answer
  noAnswerFallback: false,
  air: [],                   // GET /sectors/air-priority
  airFallback: false,
  calls: [],                 // derivadas del decision_log (o state.calls si la API lo manda)
  pendingApprovals: [],
  agentPaused: false,        // OPCIONAL: state.agent_paused
};

const subs = new Set();
let notifyScheduled = false;

export function subscribe(fn) {
  subs.add(fn);
  return () => subs.delete(fn);
}
export function getState() {
  return state;
}
function notify() {
  if (notifyScheduled) return;
  notifyScheduled = true;
  requestAnimationFrame(() => {
    notifyScheduled = false;
    for (const fn of subs) {
      try { fn(state); } catch (e) { console.error("[store] subscriber falló", e); }
    }
  });
}

/* ------------------------------------------------------------------
   Utilidades
   ------------------------------------------------------------------ */
function indexById(arr, into) {
  if (!Array.isArray(arr)) return;
  for (const it of arr) {
    if (!it || !it.id) continue;
    into[it.id] = Object.assign({}, into[it.id] || {}, it);
  }
}

export function list(bag) {
  return Object.values(bag || {});
}

/** Normaliza posibles alias del diff para no depender de un solo nombre. */
function pick(obj, names) {
  for (const n of names) {
    if (obj && obj[n] != null) return obj[n];
  }
  return undefined;
}

/* ------------------------------------------------------------------
   Fetch con timeout y auth
   ------------------------------------------------------------------ */
async function api(path, opts) {
  opts = opts || {};
  const ctrl = new AbortController();
  const timeout = opts.timeoutMs || 12000;
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(CONFIG.apiBase + path, {
      method: opts.method || "GET",
      headers: Object.assign(
        { "x-api-key": CONFIG.apiKey },
        opts.body ? { "content-type": "application/json" } : {}
      ),
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      signal: ctrl.signal,
      cache: "no-store",
    });
    const text = await res.text();
    let data = null;
    if (text) { try { data = JSON.parse(text); } catch (_) { data = { raw: text }; } }
    if (!res.ok) {
      const err = new Error(`HTTP ${res.status} en ${path}`);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

/* ------------------------------------------------------------------
   Merge de snapshot y de diff
   ------------------------------------------------------------------ */
function mergeSnapshot(s, isFull) {
  if (!s) return;
  if (typeof s.state_version === "number") state.version = s.state_version;
  if (s.t) {
    state.t = s.t;
    if (!state.t0) state.t0 = s.t;
  }
  if (typeof s.agent_paused === "boolean") state.agentPaused = s.agent_paused; // OPCIONAL

  if (isFull) {
    // Un snapshot completo reemplaza: así un /reset del motor no deja fantasmas.
    state.people = {}; state.houses = {}; state.sectors = {};
    state.convoys = {}; state.patrols = {}; state.safeZones = {}; state.roadClosures = {};
  }

  indexById(pick(s, ["people"]), state.people);
  indexById(pick(s, ["houses"]), state.houses);
  indexById(pick(s, ["sectors"]), state.sectors);
  indexById(pick(s, ["convoys"]), state.convoys);
  indexById(pick(s, ["patrols"]), state.patrols);
  indexById(pick(s, ["safe_zones", "safeZones"]), state.safeZones);
  indexById(pick(s, ["road_closures", "roadClosures"]), state.roadClosures);

  const fire = pick(s, ["fire"]);
  if (fire) state.fire = Object.assign({}, state.fire || {}, fire);

  // Borrados explícitos. Dos formas posibles y aceptamos las dos:
  //   a) {people:[ids], houses:[ids], ...}
  //   b) [{subject_type:"person", id:"p-001"}, ...]   ← la que emite backend/api/state.py
  const removed = pick(s, ["removed", "deleted"]);
  const bagOf = {
    people: state.people, person: state.people,
    houses: state.houses, house: state.houses,
    sectors: state.sectors, sector: state.sectors,
    convoys: state.convoys, convoy: state.convoys,
    patrols: state.patrols, patrol: state.patrols,
    safe_zones: state.safeZones, safe_zone: state.safeZones, safeZones: state.safeZones,
    road_closures: state.roadClosures, road_closure: state.roadClosures, roadClosures: state.roadClosures,
  };
  if (Array.isArray(removed)) {
    for (const r of removed) {
      if (!r) continue;
      const bag = bagOf[r.subject_type || r.type || r.collection];
      const id = r.id || r.subject_id;
      if (bag && id) delete bag[id];
    }
  } else if (removed && typeof removed === "object") {
    for (const k in removed) {
      const bag = bagOf[k];
      if (bag && Array.isArray(removed[k])) for (const id of removed[k]) delete bag[id];
    }
  }

  // decision_log: acepta varios nombres porque el contrato no fija el del diff.
  const dec = pick(s, ["decision_log", "decisions", "decisionLog", "new_decisions"]);
  if (Array.isArray(dec)) addDecisions(dec);

  // Llamadas: si la API las sirve las usamos; si no, se derivan del log (ver deriveCalls).
  const calls = pick(s, ["calls"]);
  if (Array.isArray(calls)) state.callsFromApi = calls;

  const approvals = pick(s, ["pending_approvals", "approvals"]);
  if (Array.isArray(approvals)) state.approvalsFromApi = approvals;
}

function addDecisions(entries) {
  const fresh = [];
  for (const e of entries) {
    if (!e) continue;
    const id = e.id || `${e.t}-${e.type}-${e.subject_id}`;
    if (state.decisionIds.has(id)) continue;
    state.decisionIds.add(id);
    fresh.push(Object.assign({ id }, e, { _seenAt: Date.now() }));
  }
  if (!fresh.length) return;
  // orden descendente por hora del escenario (si falta, por orden de llegada)
  fresh.sort((a, b) => String(b.t || "").localeCompare(String(a.t || "")));
  state.decisions = fresh.concat(state.decisions).slice(0, MAX_DECISIONS);
  if (state.decisions.length === MAX_DECISIONS) {
    state.decisionIds = new Set(state.decisions.map((d) => d.id));
  }
}

/* ------------------------------------------------------------------
   Derivaciones: si un endpoint no existe todavía, lo calculamos en local
   para que el panel NO salga vacío. Se marca como fallback en la UI.
   ------------------------------------------------------------------ */
function deriveQueue() {
  const people = list(state.people)
    .filter((p) => p.status !== "safe")
    .filter((p) => typeof p.priority_score === "number")
    .sort((a, b) => (b.priority_score || 0) - (a.priority_score || 0));
  return people.map((p) => ({
    person_id: p.id,
    priority_score: p.priority_score,
    score_breakdown: p.score_breakdown || null, // OPCIONAL en Person
    reason: p.queue_reason || null,             // OPCIONAL
  }));
}

function deriveNoAnswer() {
  return list(state.houses)
    .filter((h) => h.status === "no_answer" || h.status === "unreachable")
    .sort((a, b) => (a.priority_rank || 99) - (b.priority_rank || 99))
    .map((h) => ({ house_id: h.id }));
}

function deriveAir() {
  return list(state.sectors)
    .slice()
    .sort((a, b) => (a.air_priority_rank || 99) - (b.air_priority_rank || 99))
    .map((s) => ({ sector_id: s.id }));
}

function deriveCalls() {
  if (Array.isArray(state.callsFromApi) && state.callsFromApi.length) {
    state.calls = state.callsFromApi.slice(0, 40);
    return;
  }
  // Derivado del decision_log: call_placed / sms_sent (+ person_status_changed cierra la llamada).
  const out = [];
  for (const d of state.decisions) {
    if (d.type !== "call_placed" && d.type !== "sms_sent") continue;
    const after = d.after || {};
    out.push({
      id: d.id,
      person_id: d.subject_id,
      kind: d.type === "sms_sent" ? "sms" : "call",
      status: after.status || after.call_status || (d.type === "sms_sent" ? "sent" : "live"),
      answered: after.answered,
      run_id: after.run_id || null,               // OPCIONAL
      transcript_url: after.transcript_url || null, // OPCIONAL
      t: d.t,
      reason: d.reason,
    });
    if (out.length >= 40) break;
  }
  state.calls = out;
}

function derivePendingApprovals() {
  if (Array.isArray(state.approvalsFromApi)) {
    state.pendingApprovals = state.approvalsFromApi;
    return;
  }
  // approval_requested sin un approval_granted posterior que lo referencie.
  const resolved = new Set();
  for (const d of state.decisions) {
    if (d.type === "approval_granted" || d.type === "approval_rejected") {
      if (d.trigger_event_id) resolved.add(d.trigger_event_id);
      if (d.after && d.after.decision_id) resolved.add(d.after.decision_id);
    }
  }
  state.pendingApprovals = state.decisions
    .filter((d) => d.type === "approval_requested" && !resolved.has(d.id))
    .map((d) => ({
      decision_id: d.id,
      title: d.after && d.after.title ? d.after.title : humanType(d.type),
      subject_type: d.subject_type,
      subject_id: d.subject_id,
      reason: d.reason,
      t: d.t,
      // OPCIONAL (backlog B2: hora de caducidad de la decisión)
      expires_at: d.expires_at || (d.after && d.after.expires_at) || null,
    }));
}

export function humanType(type) {
  const M = {
    fire_updated: "el fuego se ha movido",
    road_closed: "carretera cortada",
    road_reopened: "carretera reabierta",
    exit_status_changed: "cambio en una salida",
    entity_created: "nuevo elemento en el mapa",
    approval_rejected: "aprobación denegada",
    person_located: "persona localizada",
    person_status_changed: "cambio de estado",
    route_recalculated: "ruta recalculada",
    exit_reassigned: "salida reasignada",
    convoy_formed: "convoy formado",
    convoy_broken: "convoy roto",
    convoy_regrouped: "convoy reagrupado",
    house_escalated_to_patrol: "casa escalada a patrulla",
    patrol_assigned: "patrulla asignada",
    air_priority_changed: "prioridad aérea cambiada",
    call_placed: "llamada lanzada",
    sms_sent: "SMS enviado",
    human_override: "intervención humana",
    approval_requested: "aprobación solicitada",
    approval_granted: "aprobación concedida",
    plan_discarded: "plan descartado",
  };
  return M[type] || String(type || "").replace(/_/g, " ");
}

function recompute() {
  const q = state.queueFromApi;
  if (Array.isArray(q) && q.length) { state.queue = q; state.queueFallback = false; }
  else { state.queue = deriveQueue(); state.queueFallback = true; }

  const na = state.noAnswerFromApi;
  if (Array.isArray(na) && na.length) { state.noAnswer = na; state.noAnswerFallback = false; }
  else { state.noAnswer = deriveNoAnswer(); state.noAnswerFallback = true; }

  const ap = state.airFromApi;
  if (Array.isArray(ap) && ap.length) { state.air = ap; state.airFallback = false; }
  else { state.air = deriveAir(); state.airFallback = true; }

  deriveCalls();
  derivePendingApprovals();
}

/* ------------------------------------------------------------------
   Endpoints derivados (se refrescan cuando sube la versión)
   ------------------------------------------------------------------ */
const optionalEndpoints = {
  queue: { path: "/queue", key: "queueFromApi", dead: false },
  noAnswer: { path: "/houses/no-answer", key: "noAnswerFromApi", dead: false },
  air: { path: "/sectors/air-priority", key: "airFromApi", dead: false },
};

async function refreshDerived() {
  await Promise.all(
    Object.keys(optionalEndpoints).map(async (k) => {
      const ep = optionalEndpoints[k];
      if (ep.dead) return;
      try {
        const data = await api(ep.path, { timeoutMs: 6000 });
        // Aceptamos array directo o {items:[...]}/{queue:[...]}/{houses:[...]}/{sectors:[...]}
        const arr = Array.isArray(data)
          ? data
          : pick(data || {}, ["items", "queue", "houses", "sectors", "people", "results"]);
        state[ep.key] = Array.isArray(arr) ? arr : [];
      } catch (e) {
        if (e.status === 404 || e.status === 405 || e.status === 501) {
          ep.dead = true; // no existe todavía: lo derivamos en local y no volvemos a insistir
          console.info(`[state] ${ep.path} no disponible (${e.status}); se deriva en local`);
        }
      }
    })
  );
}

/* ------------------------------------------------------------------
   Bucle principal: /state y long-poll a /state/diff
   ------------------------------------------------------------------ */
let running = false;
let failures = 0;
let diffDead = false;

function setConn(kind, detail) {
  state.conn = kind;
  state.connDetail = detail || "";
  notify();
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function loadFullState() {
  const s = await api("/state", { timeoutMs: 10000 });
  mergeSnapshot(s, true);
  state.lastGoodAt = new Date();
  failures = 0;
  // GET /state NO trae decision_log (contrato §3), así que el timeline arrancaría vacío.
  // Un diff desde 0 devuelve todo el log de golpe (y contesta al instante: siempre hay cambios
  // desde la versión 0). Si el endpoint no está, se queda vacío y ya se irá llenando en vivo.
  if (!state.decisions.length && !diffDead) {
    try {
      const seed = await api("/state/diff?since_version=0", { timeoutMs: 8000 });
      const dec = seed && (seed.decision_log || seed.decisions || seed.new_decisions);
      if (Array.isArray(dec)) addDecisions(dec);
    } catch (e) {
      console.info("[state] no se pudo sembrar el timeline desde /state/diff?since_version=0", e.message);
    }
  }
  await refreshDerived();
  recompute();
  setConn("online", `v${state.version} · ${Object.keys(state.people).length} personas`);
}

async function pollOnce() {
  if (diffDead) {
    // Sin /state/diff: refresco completo cada 2 s (funciona, solo es menos elegante).
    const s = await api("/state", { timeoutMs: 10000 });
    const before = state.version;
    mergeSnapshot(s, false);
    if (state.version !== before) await refreshDerived();
    recompute();
    state.lastGoodAt = new Date();
    failures = 0;
    setConn("online", `v${state.version} · polling /state`);
    await sleep(1500);
    return;
  }

  const since = state.version;
  let d;
  try {
    // Long-poll: la API puede tardar hasta ~25 s en contestar si no hay cambios.
    d = await api(`/state/diff?since_version=${since}`, { timeoutMs: 35000 });
  } catch (e) {
    if (e.status === 404 || e.status === 501) {
      diffDead = true;
      console.warn("[state] /state/diff no disponible; se pasa a polling de /state");
      return;
    }
    throw e;
  }
  const before = state.version;
  mergeSnapshot(d, false);
  if (state.version !== before) await refreshDerived();
  recompute();
  state.lastGoodAt = new Date();
  failures = 0;
  setConn("online", `v${state.version} · diff en vivo`);
  if (state.version === before) await sleep(400); // no-op: evita bucle caliente
}

export async function start() {
  if (running) return;
  running = true;

  if (CONFIG.mock) {
    const { startMock } = await import("./mock-state.js");
    startMock({ mergeSnapshot, recompute, notify, state, setConn });
    return;
  }

  // Carga inicial con reintentos
  while (running) {
    try {
      await loadFullState();
      break;
    } catch (e) {
      failures++;
      setConn("offline", `sin /state: ${e.message}`);
      console.warn("[state] carga inicial falló", e);
      await sleep(Math.min(1000 * 2 ** Math.min(failures, 3), 8000));
    }
  }

  // Long-poll
  while (running) {
    try {
      await pollOnce();
    } catch (e) {
      failures++;
      const wait = Math.min(1000 * 2 ** Math.min(failures, 4), 15000);
      if (failures >= 2) {
        setConn("offline", `${e.message} · reintento en ${Math.round(wait / 1000)} s`);
      } else {
        setConn("connecting", e.message);
      }
      await sleep(wait);
      // Tras varios fallos seguidos intentamos un snapshot completo (la API pudo reiniciarse).
      if (failures % 4 === 0) {
        try { await loadFullState(); } catch (_) { /* seguimos con backoff */ }
      }
    }
  }
}

/* ------------------------------------------------------------------
   Escritura: intervención humana. Todo botón pasa por aquí.
   ------------------------------------------------------------------ */
export async function postOverride(payload) {
  const body = {
    subject_type: payload.subject_type,
    subject_id: payload.subject_id,
    field: payload.field,
    value: payload.value,
    reason: payload.reason,
    operator: CONFIG.operator,
  };
  const res = await api("/human/override", { method: "POST", body });
  absorbWriteResponse(res);
  return res;
}

export async function postApprove(decisionId, approved, reason) {
  const body = {
    decision_id: decisionId,
    approved: !!approved,
    operator: CONFIG.operator,
    reason: reason || (approved ? "Aprobado desde el puesto de mando" : "Rechazado desde el puesto de mando"),
  };
  const res = await api("/human/approve", { method: "POST", body });
  absorbWriteResponse(res);
  return res;
}

/** La respuesta estándar de escritura trae {ok, state_version, decisions[]}: la absorbemos ya
 *  para que el timeline reaccione al instante sin esperar al siguiente diff. */
function absorbWriteResponse(res) {
  if (!res) return;
  // OJO: NO tocamos state.version aquí. El siguiente /state/diff debe seguir contando desde
  // la versión que ya teníamos para no perderse los cambios que provocó esta escritura.
  const dec = res.decisions || res.decision_log;
  if (Array.isArray(dec)) {
    addDecisions(dec.map((d) => Object.assign({ t: state.t || new Date().toISOString(), actor: "human" }, d)));
    recompute();
    notify();
  }
}

export { api };
