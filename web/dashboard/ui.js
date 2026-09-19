/* ============================================================
   ui.js — piezas de interfaz compartidas por app.js y card.js.
   Nada de framework: DOM a pelo.
   Aquí vive la regla de oro de la intervención humana: NINGÚN botón que cambia
   el estado se envía sin un motivo escrito por el operador (askReason).
   ============================================================ */

/* ---------------- texto ---------------- */

export function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** Hora local en hh:mm a partir de un ISO UTC. El contrato manda UTC; la pantalla, hora local. */
export function clock(iso) {
  const d = toDate(iso);
  if (!d) return "--:--";
  return d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
}

export function clockSec(iso) {
  const d = toDate(iso);
  if (!d) return "--:--:--";
  return d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function toDate(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

/** Minutos entre dos ISO (b - a). */
export function minutesBetween(a, b) {
  const da = toDate(a), db = toDate(b);
  if (!da || !db) return null;
  return (db.getTime() - da.getTime()) / 60000;
}

export function n0(v) { return v == null ? "—" : Math.round(v); }
export function n1(v) { return v == null ? "—" : (Math.round(v * 10) / 10).toFixed(1); }
export function n2(v) { return v == null ? "—" : (Math.round(v * 100) / 100).toFixed(2); }

/** Valor corto y legible para los diffs del timeline y las fichas. */
export function shortValue(v) {
  if (v == null) return "—";
  if (typeof v === "boolean") return v ? "sí" : "no";
  if (typeof v === "number") return String(Math.round(v * 100) / 100);
  if (typeof v === "string") return v.length > 60 ? v.slice(0, 57) + "…" : v;
  if (Array.isArray(v)) return v.length <= 4 ? v.map(shortValue).join(", ") : `${v.length} elementos`;
  if (typeof v === "object") {
    const parts = [];
    for (const k of Object.keys(v).slice(0, 3)) parts.push(`${k} ${shortValue(v[k])}`);
    return parts.join(" · ") + (Object.keys(v).length > 3 ? " …" : "");
  }
  return String(v);
}

/** Etiquetas en español de los campos que salen en diffs y fichas. */
const FIELD_LABELS = {
  assigned_exit_id: "salida asignada", assigned_route: "ruta", distance_m: "distancia",
  duration_s: "duración", status: "estado", priority_rank: "puesto en la lista",
  priority_score: "prioridad", minutes_to_front: "min hasta el frente",
  patrol_eta_min: "ETA patrulla", assigned_patrol_id: "patrulla",
  air_priority_rank: "prioridad aérea", head_bearing_deg: "rumbo de la cabeza",
  spread_rate_mh: "avance (m/h)", wind: "viento", member_ids: "miembros",
  leader_person_id: "guía", cohesion_ok: "cohesión", convoy_id: "convoy",
  occupancy: "ocupación", capacity: "capacidad", distance_to_fire_m: "distancia al fuego",
  road_name: "vía", reason: "motivo", answered: "contestada", run_id: "llamada (run)",
  decision_id: "decisión", state: "estado", title: "título", action: "acción",
  expires_at: "caduca", paused: "agente en pausa", force_call: "llamada forzada",
};
export function fieldLabel(k) { return FIELD_LABELS[k] || String(k).replace(/_/g, " "); }

/* ---------------- severidad por tipo de decisión ---------------- */

const SEV = {
  fire_updated: "sev-fire", road_closed: "sev-fire",
  person_status_changed: "sev-risk", convoy_broken: "sev-risk",
  approval_requested: "sev-risk", plan_discarded: "sev-risk",
  exit_status_changed: "sev-risk",
  route_recalculated: "sev-route", exit_reassigned: "sev-route",
  air_priority_changed: "sev-route", patrol_assigned: "sev-route",
  house_escalated_to_patrol: "sev-route",
  person_located: "sev-ok", convoy_formed: "sev-ok", convoy_regrouped: "sev-ok",
  approval_granted: "sev-ok", road_reopened: "sev-ok",
  entity_created: "sev-comms",
  human_override: "sev-human",
  call_placed: "sev-comms", sms_sent: "sev-comms",
};
export function sevOf(type) { return SEV[type] || "sev-comms"; }

/* ---------------- toasts ---------------- */

export function toast(msg, isErr, ms) {
  const box = document.getElementById("toasts");
  if (!box) return;
  const el = document.createElement("div");
  el.className = "toast" + (isErr ? " err" : "");
  el.textContent = msg;
  box.appendChild(el);
  setTimeout(() => el.remove(), ms || (isErr ? 7000 : 4500));
}

/* ---------------- copiar al portapapeles (funciona sin https) ---------------- */

export async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (_) { /* seguimos con el plan B */ }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  } catch (_) {
    return false;
  }
}

/* ---------------- pedir el motivo (obligatorio) ---------------- */

let openModal = null;

/**
 * Modal de intervención humana. Devuelve el motivo escrito, o null si se cancela.
 * El motivo NO es decorativo: viaja en el POST y queda en el decision_log.
 */
export function askReason(opts) {
  opts = opts || {};
  if (openModal) { openModal.remove(); openModal = null; }

  return new Promise((resolve) => {
    const wrap = document.createElement("div");
    wrap.className = "reason-modal";
    wrap.innerHTML = `
      <div class="reason-box">
        <div class="rb-title">${esc(opts.title || "Intervención humana")}</div>
        ${opts.hint ? `<div class="rb-hint">${esc(opts.hint)}</div>` : ""}
        <label class="rb-label" for="rb-reason">Motivo (queda registrado en el log de decisiones)</label>
        <textarea id="rb-reason" rows="3" placeholder="${esc(opts.placeholder || "Por qué lo cambias a mano…")}">${esc(opts.value || "")}</textarea>
        <div class="rb-actions">
          <button class="sm" data-act="cancel">Cancelar</button>
          <span class="spacer"></span>
          <button class="${opts.danger ? "danger" : "primary"}" data-act="ok">${esc(opts.confirmLabel || "Confirmar")}</button>
        </div>
      </div>`;
    document.body.appendChild(wrap);
    openModal = wrap;

    const ta = wrap.querySelector("#rb-reason");
    const done = (value) => {
      wrap.remove();
      if (openModal === wrap) openModal = null;
      resolve(value);
    };
    wrap.querySelector('[data-act="cancel"]').addEventListener("click", () => done(null));
    wrap.querySelector('[data-act="ok"]').addEventListener("click", () => {
      const v = ta.value.trim();
      if (!v) { ta.focus(); toast("Hace falta un motivo: queda en el log de decisiones.", true); return; }
      done(v);
    });
    wrap.addEventListener("click", (e) => { if (e.target === wrap) done(null); });
    ta.addEventListener("keydown", (e) => {
      if (e.key === "Escape") done(null);
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) wrap.querySelector('[data-act="ok"]').click();
    });
    setTimeout(() => { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }, 10);
  });
}
