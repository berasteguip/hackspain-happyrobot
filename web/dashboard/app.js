/* ============================================================
   app.js — el director de la pantalla.
   Suscribe al store, pinta mapa + paneles, y engancha los botones de
   intervención humana. Nada de framework: DOM a pelo y un render por frame.

   Paneles (escenario §7):
     · Qué ha cambiado  → decision_log con MOTIVO y diff antes/después  (criterio "Adaptación")
     · Cola de atención → priority_score con su score_breakdown desplegable
     · Casas sin contestar → lista viva de la patrulla, con el margen fuego-vs-patrulla
     · Prioridad aérea por sector, con su motivo
     · Aprobaciones pendientes → el humano firma lo que el sistema no puede decidir solo
   ============================================================ */

import { initMap, renderMap, fitAll, focusOn } from "./map.js";
import { CONFIG, getState, humanType, list, postApprove, start, subscribe } from "./state.js";
import { doOverride, openCard, refreshCard } from "./card.js";
import {
  askReason, clock, copyText, es, esc, fieldLabel, minutesBetween,
  n0, n1, n2, sevOf, shortValue, toast,
} from "./ui.js";

const $ = (id) => document.getElementById(id);

/* Estado propio de la interfaz (no del dominio) */
const ui = {
  tlType: "",
  tlActor: "",
  tlTypesSeen: new Set(),
  expandedQueue: new Set(),
  lastWindDir: null,
  seenDecisions: new Set(),   // para el destello .is-new solo la primera vez
  booted: false,
};

/* ==================================================================
   BARRA SUPERIOR
   ================================================================== */
const COMPASS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSO", "SO", "OSO", "O", "ONO", "NO", "NNO"];
function compass(deg) {
  if (deg == null) return "—";
  return COMPASS[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16];
}

function renderTopbar(s) {
  $("tb-clock").textContent = clock(s.t);
  const mins = minutesBetween(s.t0, s.t);
  $("tb-elapsed").textContent = mins == null ? "esperando hora del escenario" : `+${Math.round(mins)} min desde el aviso`;

  let inside = 0, moving = 0, safe = 0, unknown = 0;
  for (const p of list(s.people)) {
    if (p.status === "safe") safe++;
    else if (p.status === "moving") moving++;
    else inside++;
    if (p.status === "unknown" || p.status === "no_answer" || p.status === "unreachable") unknown++;
  }
  $("c-inside").textContent = inside;
  $("c-moving").textContent = moving;
  $("c-safe").textContent = safe;
  $("c-unknown").textContent = unknown;

  const f = s.fire || {};
  const w = f.wind || {};
  // El viento se da DE DÓNDE viene; la flecha apunta HACIA DONDE sopla → +180°.
  if (w.direction_deg != null) {
    $("wind-arrow").style.transform = `rotate(${(w.direction_deg + 180) % 360}deg)`;
    if (ui.lastWindDir != null && Math.abs(w.direction_deg - ui.lastWindDir) >= 5) {
      const rose = $("windrose");
      rose.classList.remove("turning");
      void rose.offsetWidth;            // reinicia la animación
      rose.classList.add("turning");
      toast(`El viento ha girado: ahora del ${compass(w.direction_deg)} (${Math.round(w.direction_deg)}°)`);
    }
    ui.lastWindDir = w.direction_deg;
  }
  $("tb-wind-speed").textContent = w.speed_kmh == null ? "--" : `${n0(w.speed_kmh)} km/h`;
  $("tb-wind-dir").textContent =
    w.direction_deg == null ? "sin datos de viento"
      : `del ${compass(w.direction_deg)} (${n0(w.direction_deg)}°)${w.gusts_kmh ? ` · rachas ${n0(w.gusts_kmh)}` : ""}`;
  $("tb-fire-head").textContent =
    f.head_bearing_deg == null ? "" : `cabeza ${n0(f.head_bearing_deg)}° · ${n0(f.spread_rate_mh)} m/h`;

  const pauseBtn = $("btn-pause");
  pauseBtn.textContent = s.agentPaused ? "▶ Reanudar agente" : "⏸ Pausar agente";
  pauseBtn.classList.toggle("ok", !!s.agentPaused);
  pauseBtn.classList.toggle("danger", !s.agentPaused);
}

const CONN_TEXT = { online: "en vivo", connecting: "conectando…", offline: "SIN CONEXIÓN", mock: "escenario local (mock)" };

function renderConn(s) {
  const pill = $("conn");
  pill.className = `conn ${s.conn}`;
  $("conn-text").textContent = CONN_TEXT[s.conn] || s.conn;
  const age = s.lastGoodAt ? Math.round((Date.now() - s.lastGoodAt.getTime()) / 1000) : null;
  $("conn-detail").textContent =
    (s.connDetail || `v${s.version}`) + (age != null && age > 3 ? ` · hace ${age} s` : "");

  const banner = $("banner");
  if (s.conn === "offline") {
    banner.classList.add("show");
    banner.classList.remove("warn");
    $("banner-text").textContent = "Sin conexión con la API — la pantalla muestra el último estado bueno";
    $("banner-detail").textContent =
      `${s.connDetail || ""}${age != null ? ` · datos de hace ${age} s` : ""} · reintentando sola`;
  } else if (s.conn === "connecting" && !s.lastGoodAt) {
    banner.classList.add("show", "warn");
    $("banner-text").textContent = `Conectando con la API (${CONFIG.apiBase})…`;
    $("banner-detail").textContent = s.connDetail || "si no arranca, revisa que api/ esté en el puerto 8000";
  } else if (s.conn === "mock") {
    banner.classList.add("show", "warn");
    $("banner-text").textContent = "Escenario LOCAL de demostración (?mock=1): no hay API detrás";
    $("banner-detail").textContent = "todo lo que se ve es sintético y no se escribe en ningún sitio";
  } else {
    banner.classList.remove("show", "warn");
  }
}

/* ==================================================================
   TIMELINE — "Qué ha cambiado". El panel que demuestra la Adaptación.
   ================================================================== */
function diffHtml(d) {
  const before = d.before || {};
  const after = d.after || {};
  const keys = Array.from(new Set(Object.keys(before).concat(Object.keys(after))));
  const rows = [];
  for (const k of keys) {
    const b = before[k], a = after[k];
    if (JSON.stringify(b) === JSON.stringify(a)) continue;
    rows.push(
      `<div class="d-row"><span class="d-k">${esc(fieldLabel(k))}</span>` +
      `<span class="d-b">${esc(shortValue(b))}</span><span class="d-arrow">→</span>` +
      `<span class="d-a">${esc(shortValue(a))}</span></div>`
    );
    if (rows.length >= 4) break;
  }
  if (!rows.length) return "";
  const more = keys.length > rows.length ? `<div class="d-more">+${keys.length - rows.length} campos más</div>` : "";
  return `<div class="tl-diff">${rows.join("")}${more}</div>`;
}

function subjectLabel(s, d) {
  const id = d.subject_id;
  if (!id) return d.subject_type === "system" ? "todo el plan" : "—";
  const p = s.people[id]; if (p) return p.name || id;
  const h = s.houses[id]; if (h) return h.address || id;
  const z = s.safeZones[id]; if (z) return z.name || id;
  const sec = s.sectors[id]; if (sec) return sec.name || id;
  const c = s.convoys[id]; if (c) return `convoy ${c.id}`;
  const rc = s.roadClosures[id]; if (rc) return rc.road_name || id;
  if (d.subject_type === "fire") return "frente del fuego";
  return id;
}

function focusDecision(s, d) {
  const id = d.subject_id;
  if (!id) { if (s.fire) openCard({ kind: "fire", data: s.fire }); return; }
  const kinds = [
    ["person", s.people], ["house", s.houses], ["zone", s.safeZones],
    ["sector", s.sectors], ["convoy", s.convoys], ["patrol", s.patrols], ["closure", s.roadClosures],
  ];
  for (const [kind, bag] of kinds) {
    if (bag[id]) {
      const data = bag[id];
      openCard({ kind, data });
      if (data.lat != null) focusOn([data.lat, data.lon], 14);
      return;
    }
  }
  if (s.fire) openCard({ kind: "fire", data: s.fire });
}

function syncTypeFilter(s) {
  let added = false;
  for (const d of s.decisions) {
    if (d.type && !ui.tlTypesSeen.has(d.type)) { ui.tlTypesSeen.add(d.type); added = true; }
  }
  if (!added) return;
  const sel = $("tl-filter");
  const keep = sel.value;
  sel.innerHTML = '<option value="">todos los tipos</option>' +
    Array.from(ui.tlTypesSeen).sort().map((t) => `<option value="${esc(t)}">${esc(humanType(t))}</option>`).join("");
  sel.value = keep;
}

function renderTimeline(s) {
  syncTypeFilter(s);
  const all = s.decisions.filter(
    (d) => (!ui.tlType || d.type === ui.tlType) && (!ui.tlActor || (d.actor || "system") === ui.tlActor)
  );
  $("tl-count").textContent = ui.tlType || ui.tlActor ? `${all.length}/${s.decisions.length}` : String(s.decisions.length);

  const body = $("tl-body");
  if (!all.length) {
    body.innerHTML = `<div class="empty">Sin decisiones todavía.<br>Cada cambio de estado aparecerá aquí con su motivo.</div>`;
    return;
  }
  const frag = document.createDocumentFragment();
  for (const d of all.slice(0, 80)) {
    const actor = d.actor || "system";
    const isNew = !ui.seenDecisions.has(d.id);
    if (isNew) ui.seenDecisions.add(d.id);
    const el = document.createElement("div");
    el.className = `tl-entry ${sevOf(d.type)}${isNew && ui.booted ? " is-new" : ""}`;
    el.innerHTML =
      `<div class="time">${esc(clock(d.t))}</div>` +
      `<div><div class="type">${esc(humanType(d.type))}<span class="actor actor-${esc(actor)}">${esc(actor)}</span></div>` +
      `<div class="subject">${esc(subjectLabel(s, d))}</div>` +
      `<div class="reason">${d.reason ? esc(d.reason) : '<i style="color:var(--amber)">sin motivo declarado</i>'}</div>` +
      diffHtml(d) +
      (d.trigger_event_id ? `<div class="d-more">consecuencia de ${esc(d.trigger_event_id)}</div>` : "") +
      `</div>`;
    el.addEventListener("click", () => focusDecision(s, d));
    frag.appendChild(el);
  }
  body.innerHTML = "";
  body.appendChild(frag);
}

/* ==================================================================
   COLA DE ATENCIÓN — con el score_breakdown a la vista
   ================================================================== */
// Pesos del contrato §4 (api/priority.py). El breakdown ya viene ponderado: cada
// valor es la CONTRIBUCIÓN al score, y su techo es el peso del factor.
const FACTORS = {
  urgency: { cls: "f-urgency", label: "Urgencia (min al frente)", w: 0.45 },
  mobility: { cls: "f-mobility", label: "Movilidad", w: 0.20 },
  uncertainty: { cls: "f-uncertainty", label: "Incertidumbre", w: 0.15 },
  household_size: { cls: "f-household", label: "Personas en casa", w: 0.10 },
  trajectory_drift: { cls: "f-drift", label: "Se desvía de la ruta", w: 0.10 },
};
const MAX_W = 0.45;

function breakdownHtml(bd) {
  if (!bd || typeof bd !== "object" || !Object.keys(bd).length) {
    return `<div class="q-breakdown"><div class="no-breakdown">⚠ La API no manda score_breakdown para esta persona: el número no se puede explicar.</div></div>`;
  }
  const order = Object.keys(FACTORS).filter((k) => k in bd).concat(Object.keys(bd).filter((k) => !(k in FACTORS)));
  const rows = order.map((k) => {
    const f = FACTORS[k] || { cls: "", label: fieldLabel(k), w: MAX_W };
    const v = Number(bd[k]) || 0;
    const pct = Math.max(0, Math.min(100, (v / MAX_W) * 100));
    return `<div class="bd-row ${f.cls}">
        <span class="bd-k">${esc(f.label)} <i class="bd-w">peso ${f.w}</i></span>
        <span class="bd-track"><span class="bd-fill" style="width:${pct.toFixed(1)}%"></span></span>
        <span class="bd-v">${n2(v)}</span>
      </div>`;
  }).join("");
  const total = Object.values(bd).reduce((a, b) => a + (Number(b) || 0), 0);
  return `<div class="q-breakdown"><div class="bd-title">Por qué va en esta posición · suma ${n2(total)}</div>${rows}
    <div class="bd-foot">La incertidumbre SUBE la prioridad: lo que no se sabe de alguien es un riesgo, no un descuento.</div></div>`;
}

function renderQueue(s) {
  const body = $("queue-body");
  $("queue-count").textContent = s.queue.length;
  if (!s.queue.length) {
    body.innerHTML = `<div class="empty">Nadie en cola.</div>`;
    return;
  }
  const frag = document.createDocumentFragment();
  if (s.queueFallback) frag.appendChild(note("La API no sirve /queue todavía: esta cola se ordena en el navegador con priority_score."));

  s.queue.slice(0, 40).forEach((item, i) => {
    const pid = item.person_id || item.id;
    const p = s.people[pid] || {};
    const score = item.priority_score != null ? item.priority_score : p.priority_score;
    const bd = item.score_breakdown || p.score_breakdown || null;
    const rank = item.priority_rank || i + 1;
    // El nº1 sale ya desplegado: el jurado ve la explicación sin tener que pulsar nada.
    const open = ui.expandedQueue.has(pid) || (rank === 1 && !ui.expandedQueue.has("!" + pid));
    const mins = item.minutes_to_front != null ? item.minutes_to_front : p.minutes_to_front;

    const row = document.createElement("div");
    row.className = "q-row" + (rank === 1 ? " top" : "");
    row.innerHTML =
      `<div class="q-head">
         <span class="q-rank">${rank}</span>
         <span class="main" style="flex:1;min-width:0">
           <div class="name">${esc(p.name || pid)}${p.mobility === "immobile" || p.mobility === "reduced" ? ' <span class="pill vuln">movilidad</span>' : ""}${
             (item.status || p.status) === "at_risk" ? ' <span class="pill risk">EN RIESGO</span>' : ""}</div>
           <div class="meta">${esc(es(item.status || p.status))}${mins != null ? ` · ${n0(mins)}′ al frente` : ""}${
             p.household_size ? ` · ${p.household_size} en casa` : ""}</div>
         </span>
         <span class="q-score">${score == null ? "—" : n2(score)}</span>
       </div>
       <div class="q-bar-outer"><span class="q-bar-inner" style="width:${Math.max(2, Math.min(100, (score || 0) * 100)).toFixed(1)}%"></span></div>
       ${item.reason ? `<div class="a-reason">${esc(item.reason)}</div>` : ""}
       ${open ? breakdownHtml(bd) : ""}
       ${open ? '<div class="q-actions"></div>' : ""}`;

    row.addEventListener("click", (e) => {
      if (e.target.closest(".q-actions")) return;
      if (open) { ui.expandedQueue.delete(pid); ui.expandedQueue.add("!" + pid); }
      else { ui.expandedQueue.add(pid); ui.expandedQueue.delete("!" + pid); }
      render(getState());
    });

    if (open) {
      const acts = row.querySelector(".q-actions");
      acts.appendChild(btn("Ver ficha", "sm", () => {
        const data = s.people[pid];
        if (!data) return;
        openCard({ kind: "person", data });
        if (data.lat != null) focusOn([data.lat, data.lon], 14);
      }));
      acts.appendChild(btn("☎︎ Llamar ya", "sm", () =>
        doOverride({
          subject_type: "person", subject_id: pid, field: "force_call", value: true,
          title: `Forzar llamada a ${p.name || pid}`,
          hint: "Se salta el orden de la cola.",
          confirmLabel: "Llamar ya", done: "Llamada forzada",
        })));
      acts.appendChild(btn("✖ Anular ruta", "sm danger", () =>
        doOverride({
          subject_type: "person", subject_id: pid, field: "assigned_route", value: null,
          title: `Anular la ruta de ${p.name || pid}`,
          confirmLabel: "Anular ruta", danger: true, done: "Ruta anulada",
        })));
    }
    frag.appendChild(row);
  });
  body.innerHTML = "";
  body.appendChild(frag);
}

/* ==================================================================
   CASAS SIN CONTESTAR — la lista viva de la patrulla
   ================================================================== */
function renderHouses(s) {
  const body = $("patrol-body");
  const items = s.noAnswer;
  $("patrol-count").textContent = items.length;
  if (!items.length) {
    body.innerHTML = `<div class="empty">Ninguna casa sin contestar.</div>`;
    return;
  }
  const frag = document.createDocumentFragment();
  if (s.noAnswerFallback) frag.appendChild(note("La API no sirve /houses/no-answer todavía: el orden se calcula en el navegador."));

  for (const item of items.slice(0, 40)) {
    const hid = item.house_id || item.id;
    const h = s.houses[hid] || {};
    const mtf = item.minutes_to_front != null ? item.minutes_to_front : h.minutes_to_front;
    const eta = item.patrol_eta_min != null ? item.patrol_eta_min : h.patrol_eta_min;
    const margin = item.margin_min != null ? item.margin_min : (mtf != null && eta != null ? mtf - eta : null);
    const unreachable = margin != null && margin < 0;

    const row = document.createElement("div");
    row.className = "h-row" + (unreachable ? " unreachable" : "");
    row.innerHTML =
      `<div class="h-min"><div class="n">${mtf == null ? "—" : n0(mtf)}</div><div class="u">min</div></div>
       <div class="main" style="min-width:0">
         <div class="name">${esc(h.address || hid)}${h.vulnerable ? ' <span class="pill vuln">vulnerable</span>' : ""}${
           h.status === "unreachable" ? ' <span class="pill risk">ilocalizable</span>' : ""}</div>
         <div class="meta">${esc(h.village || "")}${h.residents_expected ? ` · ${h.residents_expected} personas` : ""}${
           h.call_attempts ? ` · ${h.call_attempts} intentos` : ""}${h.assigned_patrol_id ? ` · ${esc(h.assigned_patrol_id)}` : ""}</div>
         ${item.reason ? `<div class="a-reason">${esc(item.reason)}</div>` : ""}
         ${unreachable ? `<div class="warn">⚠ El fuego llega ${Math.abs(Math.round(margin))} min ANTES que la patrulla — no se manda sin firma humana</div>` : ""}
       </div>
       <div class="h-eta">${eta == null ? "" : `patrulla ${n0(eta)}′`}${margin == null ? "" : `<br>margen ${margin > 0 ? "+" : ""}${Math.round(margin)}′`}</div>`;
    row.addEventListener("click", () => {
      const data = s.houses[hid];
      if (!data) return;
      openCard({ kind: "house", data });
      if (data.lat != null) focusOn([data.lat, data.lon], 14);
    });
    frag.appendChild(row);
  }
  body.innerHTML = "";
  body.appendChild(frag);
}

/* ==================================================================
   PRIORIDAD AÉREA
   ================================================================== */
function renderAir(s) {
  const body = $("air-body");
  const items = s.air;
  $("air-count").textContent = items.length;
  if (!items.length) {
    body.innerHTML = `<div class="empty">Sin sectores.</div>`;
    return;
  }
  const frag = document.createDocumentFragment();
  if (s.airFallback) frag.appendChild(note("La API no sirve /sectors/air-priority todavía: el orden sale de air_priority_rank."));

  items.slice(0, 12).forEach((item, i) => {
    const sid = item.sector_id || item.id;
    const sec = s.sectors[sid] || {};
    const rank = item.air_priority_rank || sec.air_priority_rank || i + 1;
    const reason = item.reason || item.air_priority_reason || sec.air_priority_reason;
    const inside = item.people_inside != null ? item.people_inside : sec.people_inside;
    const unk = item.people_unknown != null ? item.people_unknown : sec.people_unknown;
    const mtf = item.minutes_to_front != null ? item.minutes_to_front : sec.minutes_to_front;

    const row = document.createElement("div");
    row.className = "a-row" + (rank === 1 ? " first" : "");
    row.innerHTML =
      `<span class="a-rank">${rank}</span>
       <div style="min-width:0">
         <div class="a-people"><span class="n">${inside == null ? "—" : inside}</span>
           <span class="meta">personas dentro${unk ? ` · ${unk} sin localizar` : ""}</span></div>
         <div class="meta">${esc(sec.name || sid)}${mtf != null ? ` · ${n0(mtf)}′ al frente` : ""}</div>
         ${reason ? `<div class="a-reason">${esc(reason)}</div>` : `<div class="a-reason" style="color:var(--amber)">sin motivo declarado</div>`}
       </div>
       <div class="h-eta">${sec.vulnerable_inside ? `${sec.vulnerable_inside} vulnerables` : ""}</div>`;
    row.addEventListener("click", () => { if (s.sectors[sid]) openCard({ kind: "sector", data: s.sectors[sid] }); });
    frag.appendChild(row);
  });
  body.innerHTML = "";
  body.appendChild(frag);
}

/* ==================================================================
   LLAMADAS
   ================================================================== */
function renderCalls(s) {
  const calls = s.calls || [];
  const live = calls.filter((c) => c.status === "live" || c.status === "calling" || c.status === "in_progress").length;
  const sms = calls.filter((c) => c.kind === "sms").length;
  const answered = calls.filter((c) => c.answered === true).length;
  $("calls-count").textContent = calls.length;
  $("calls-live").textContent = live;
  $("calls-total").textContent = calls.filter((c) => c.kind !== "sms").length;
  $("calls-answered").textContent = answered;
  $("calls-sms").textContent = sms;

  const body = $("calls-body");
  if (!calls.length) {
    body.innerHTML = `<div class="empty">Ninguna llamada todavía.</div>`;
    return;
  }
  const frag = document.createDocumentFragment();
  for (const c of calls.slice(0, 25)) {
    const p = s.people[c.person_id] || {};
    const cls = c.status === "live" || c.status === "calling" || c.status === "in_progress" ? "live"
      : c.answered === false ? "failed" : "done";
    const row = document.createElement("div");
    row.className = `call-row ${cls}`;
    row.innerHTML =
      `<span class="st"></span>
       <span class="who">${esc(p.name || c.person_id || "—")}</span>
       <span class="meta">${c.kind === "sms" ? "SMS" : "llamada"} · ${esc(clock(c.t))}${
         c.answered === false ? " · no contesta" : c.answered === true ? " · contestada" : ""}</span>
       ${c.transcript_url ? `<a href="${esc(c.transcript_url)}" target="_blank" rel="noreferrer">transcripción</a>` : ""}`;
    row.addEventListener("click", (e) => {
      if (e.target.tagName === "A") return;
      if (s.people[c.person_id]) openCard({ kind: "person", data: s.people[c.person_id] });
    });
    frag.appendChild(row);
  }
  body.innerHTML = "";
  body.appendChild(frag);
}

/* ==================================================================
   APROBACIONES PENDIENTES — lo que el sistema NO decide solo
   ================================================================== */
function renderApprovals(s) {
  const panel = $("panel-approvals");
  const items = s.pendingApprovals || [];
  panel.classList.toggle("hidden", items.length === 0);
  $("ap-count").textContent = items.length;
  const body = $("ap-body");
  if (!items.length) { body.innerHTML = ""; return; }

  const frag = document.createDocumentFragment();
  for (const a of items) {
    // La API emite {decision_id, action, payload, reason, requested_at, expires_at};
    // la derivación local emite {decision_id, title, subject_type, subject_id, reason, t}.
    const title = a.title || humanType(a.action) || "decisión pendiente";
    const when = a.t || a.requested_at;
    const subj = a.subject_id || (a.payload && (a.payload.house_id || a.payload.person_id || a.payload.subject_id)) || null;
    const subjName = subj ? ((s.houses[subj] && s.houses[subj].address) || (s.people[subj] && s.people[subj].name) || subj) : "";
    const left = a.expires_at ? minutesBetween(s.t || new Date().toISOString(), a.expires_at) : null;

    const row = document.createElement("div");
    row.className = "ap-row";
    row.innerHTML =
      `<div class="ap-title">${esc(title)}${subjName ? ` · ${esc(subjName)}` : ""}</div>
       <div class="ap-reason">${esc(a.reason || "sin motivo declarado")}</div>
       ${a.payload && a.payload.margin_min != null
        ? `<div class="ap-reason">Margen fuego-vs-patrulla: <b>${Math.round(a.payload.margin_min)} min</b></div>` : ""}
       <div class="ap-foot">
         <span class="ap-count${left != null && left <= 2 ? " urgent" : ""}">${
           left == null ? `pedido ${clock(when)}` : left <= 0 ? "CADUCADA" : `${Math.ceil(left)} min para decidir`}</span>
         <span class="spacer"></span>
       </div>`;
    const foot = row.querySelector(".ap-foot");
    foot.appendChild(btn("✔ Aprobar", "ok", () => decide(a.decision_id, true, title)));
    foot.appendChild(btn("✖ Rechazar", "danger", () => decide(a.decision_id, false, title)));
    frag.appendChild(row);
  }
  body.innerHTML = "";
  body.appendChild(frag);
}

async function decide(decisionId, approved, title) {
  const reason = await askReason({
    title: `${approved ? "Aprobar" : "Rechazar"}: ${title}`,
    hint: approved
      ? "Firmas tú esta acción: queda en el log con tu nombre de operador."
      : "El sistema descartará el plan y buscará otra opción.",
    placeholder: approved ? "Ej: hablo con la patrulla y aceptan el riesgo" : "Ej: demasiado margen negativo, que no entren",
    confirmLabel: approved ? "Aprobar" : "Rechazar",
    danger: !approved,
  });
  if (reason == null) return;
  try {
    const res = await postApprove(decisionId, approved, reason);
    toast(`${approved ? "Aprobado" : "Rechazado"} · v${res && res.state_version != null ? res.state_version : "?"}`);
  } catch (e) {
    toast(`No se pudo enviar la decisión (${e.message})`, true);
    console.error("[app] approve falló", e);
  }
}

/* ==================================================================
   TIRA INFERIOR
   ================================================================== */
function renderStrip(s) {
  const strip = $("strip");
  const frag = document.createDocumentFragment();
  for (const d of s.decisions.slice(0, 28)) {
    const chip = document.createElement("div");
    chip.className = `chip ${sevOf(d.type)}`;
    chip.innerHTML = `<span class="c-t">${esc(clock(d.t))}</span><span class="c-x">${esc(humanType(d.type))} · ${esc(subjectLabel(s, d))}</span>`;
    chip.title = d.reason || "";
    chip.addEventListener("click", () => focusDecision(s, d));
    frag.appendChild(chip);
  }
  strip.innerHTML = "";
  strip.appendChild(frag);
}

/* ==================================================================
   Helpers de DOM
   ================================================================== */
function btn(label, cls, onClick) {
  const b = document.createElement("button");
  b.className = cls || "";
  b.textContent = label;
  b.addEventListener("click", async (e) => {
    e.stopPropagation();
    b.disabled = true;
    try { await onClick(); } finally { b.disabled = false; }
  });
  return b;
}

function note(text) {
  const el = document.createElement("div");
  el.className = "fallback-note";
  el.textContent = `ℹ ${text}`;
  return el;
}

/* ==================================================================
   Render completo
   ================================================================== */
let rendering = false;
/* ------------------------------------------------------------------
   Congelar listas mientras el operador las usa.
   El escenario avanza cada segundo y cada versión repinta los paneles: los
   botones se destruían DEBAJO del cursor (medido: un clic en "Anular ruta" no
   llegaba nunca) y la lista saltaba al leerla. Mientras el ratón está encima de
   una lista —o mientras se escribe el motivo de una intervención— esa lista no
   se repinta. El mapa, los contadores y el banner sí siguen vivos.
   ------------------------------------------------------------------ */
const FREEZABLE = {
  "queue-body": "panel-queue",
  "patrol-body": "panel-patrol",
  "air-body": "panel-air",
  "tl-body": "panel-timeline",
  "ap-body": "panel-approvals",
};
function bindFreeze() {
  for (const [bodyId, panelId] of Object.entries(FREEZABLE)) {
    const el = $(bodyId);
    if (!el) continue;
    el.addEventListener("mouseenter", () => { ui.frozen.add(bodyId); $(panelId)?.classList.add("frozen"); });
    el.addEventListener("mouseleave", () => { ui.frozen.delete(bodyId); $(panelId)?.classList.remove("frozen"); render(getState()); });
  }
}
/** ¿Se puede repintar esta lista ahora mismo? */
function canPaint(bodyId) {
  if (document.querySelector(".reason-modal")) return false; // se está escribiendo un motivo
  return !ui.frozen.has(bodyId);
}

function render(s) {
  if (rendering) return;
  rendering = true;
  try {
    renderTopbar(s);
    renderConn(s);
    renderMap();
    if (canPaint("tl-body")) renderTimeline(s);
    if (canPaint("queue-body")) renderQueue(s);
    if (canPaint("patrol-body")) renderHouses(s);
    if (canPaint("air-body")) renderAir(s);
    renderCalls(s);
    if (canPaint("ap-body")) renderApprovals(s);
    renderStrip(s);
    refreshCard();
    ui.booted = true;
  } catch (e) {
    console.error("[app] render falló", e);
  } finally {
    rendering = false;
  }
}

/* ==================================================================
   Botones globales
   ================================================================== */
function openWebCall() {
  if (!CONFIG.webCallUrl) {
    toast("No hay WEB_CALL_URL configurada: cópiala de HappyRobot en config.js (o pásala con ?webcall=…)", true, 9000);
    return;
  }
  window.open(CONFIG.webCallUrl, "_blank", "noopener");
}

function bindButtons() {
  $("btn-webcall-top").addEventListener("click", openWebCall);
  $("btn-webcall-panel").addEventListener("click", openWebCall);

  // Pausa del agente. Convención propia sobre /human/override (ver README).
  $("btn-pause").addEventListener("click", async () => {
    const s = getState();
    const next = !s.agentPaused;
    await doOverride({
      subject_type: "system", subject_id: "agent", field: "paused", value: next,
      title: next ? "Pausar todas las acciones automáticas" : "Reanudar el agente",
      hint: next
        ? "El sistema deja de llamar y de reasignar por su cuenta. Lo que ya está en vuelo no se corta."
        : "El agente vuelve a actuar solo.",
      placeholder: next ? "Ej: el CECOPI toma el control manual" : "Ej: ya podemos seguir en automático",
      confirmLabel: next ? "Pausar agente" : "Reanudar", danger: next, done: next ? "Agente pausado" : "Agente reanudado",
    });
  });

  // Forzar llamada: a la persona de la ficha abierta, o a la primera de la cola.
  $("btn-force-call").addEventListener("click", async () => {
    const s = getState();
    const first = s.queue[0];
    const pid = (first && (first.person_id || first.id)) || null;
    if (!pid) { toast("No hay nadie en la cola a quien llamar.", true); return; }
    const p = s.people[pid] || {};
    await doOverride({
      subject_type: "person", subject_id: pid, field: "force_call", value: true,
      title: `Forzar llamada a ${p.name || pid} (nº1 de la cola)`,
      hint: "Para llamar a otra persona: púlsala en el mapa y usa su ficha.",
      confirmLabel: "Llamar ya", done: "Llamada forzada",
    });
  });

  // Copiar la lista de la patrulla: texto pegable en el grupo de la Guardia Civil.
  $("btn-copy-houses").addEventListener("click", async () => {
    const s = getState();
    const lines = s.noAnswer.slice(0, 30).map((item, i) => {
      const h = s.houses[item.house_id || item.id] || {};
      const m = item.margin_min != null ? item.margin_min
        : (h.minutes_to_front != null && h.patrol_eta_min != null ? h.minutes_to_front - h.patrol_eta_min : null);
      return `${i + 1}. ${h.address || item.house_id} (${h.village || "?"}) · ${
        h.residents_expected ?? "?"} pers.${h.vulnerable ? " · VULNERABLE" : ""}${
        h.minutes_to_front != null ? ` · fuego en ${Math.round(h.minutes_to_front)}′` : ""}${
        m != null ? ` · margen ${m > 0 ? "+" : ""}${Math.round(m)}′` : ""}`;
    });
    const txt = `CASAS SIN CONTESTAR — ${clock(s.t)} (DATOS SINTÉTICOS)\n${lines.join("\n")}`;
    toast((await copyText(txt)) ? "Lista copiada: pégala en el grupo de la patrulla." : "No se pudo copiar (mira la consola).", false);
    if (!lines.length) toast("La lista está vacía.", true);
    console.info(txt);
  });

  $("btn-send-air").addEventListener("click", async () => {
    const s = getState();
    const lines = s.air.slice(0, 8).map((item, i) => {
      const sec = s.sectors[item.sector_id || item.id] || {};
      return `${item.air_priority_rank || sec.air_priority_rank || i + 1}. ${sec.name || item.sector_id} · ${
        sec.people_inside ?? "?"} dentro${sec.people_unknown ? ` (${sec.people_unknown} sin localizar)` : ""} · ${
        esc(item.reason || sec.air_priority_reason || "sin motivo")}`;
    });
    const txt = `PRIORIDAD DE DESCARGA AÉREA — ${clock(s.t)} (DATOS SINTÉTICOS)\n${lines.join("\n")}`;
    toast((await copyText(txt)) ? "Prioridad copiada para el puesto de mando (CECOPI)." : "No se pudo copiar.", false);
    console.info(txt);
  });

  $("tl-filter").addEventListener("change", (e) => { ui.tlType = e.target.value; renderTimeline(getState()); });
  $("tl-actor").addEventListener("change", (e) => { ui.tlActor = e.target.value; renderTimeline(getState()); });
}

/* ==================================================================
   Arranque
   ================================================================== */
function boot() {
  initMap();
  bindButtons();
  subscribe(render);
  render(getState());
  // Reloj/cuenta atrás: 1 s. Lo único que se repinta solo, sin esperar a la API.
  setInterval(() => {
    const s = getState();
    renderConn(s);
    renderApprovals(s);
  }, 1000);
  start();
  console.info(`[dashboard] API ${CONFIG.apiBase} · operador ${CONFIG.operator}${CONFIG.mock ? " · MOCK local" : ""}`);
  // El mapa nace dentro de un flex: Leaflet necesita saber su tamaño final.
  setTimeout(() => { const m = window.L && document.getElementById("map"); if (m) window.dispatchEvent(new Event("resize")); fitAll(false); }, 300);
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
else boot();
