/* ============================================================
   card.js — ficha del elemento pulsado en el mapa (o en un panel).
   Es la mitad del criterio "Control" de la rúbrica: todo lo que el sistema
   sabe de alguien se ve, y desde aquí se puede INTERVENIR.

   Toda acción de intervención pasa por doOverride() → POST /human/override
   con el motivo que teclea el operador (contrato §3).
   ============================================================ */

import { getState, list, postOverride, CONFIG } from "./state.js";
import { askReason, clock, esc, fieldLabel, n0, n1, n2, shortValue, toast } from "./ui.js";

let current = null;       // { kind, id }
let bound = false;

export function getOpenCard() { return current; }

/* ------------------------------------------------------------------
   Intervención humana: un único camino para todos los botones.
   ------------------------------------------------------------------ */
export async function doOverride(o) {
  const reason = await askReason({
    title: o.title || "Anular decisión del sistema",
    hint: o.hint,
    placeholder: o.placeholder || "Ej: el vecino confirma por radio que ya ha salido",
    confirmLabel: o.confirmLabel || "Enviar override",
    danger: !!o.danger,
  });
  if (reason == null) return false;
  try {
    const res = await postOverride({
      subject_type: o.subject_type,
      subject_id: o.subject_id,
      field: o.field,
      value: o.value,
      reason,
    });
    toast(`${o.done || "Override enviado"} · v${res && res.state_version != null ? res.state_version : "?"} · operador ${CONFIG.operator}`);
    return true;
  } catch (e) {
    toast(`No se pudo enviar el override (${e.message}). El estado NO ha cambiado.`, true);
    console.error("[card] override falló", e);
    return false;
  }
}

/* ------------------------------------------------------------------
   Render
   ------------------------------------------------------------------ */
function kv(pairs) {
  const rows = pairs
    .filter((p) => p && p[1] !== undefined)
    .map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v == null || v === "" ? "—" : esc(String(v))}</dd>`)
    .join("");
  return `<dl class="kv">${rows}</dl>`;
}

const STATUS_ES = {
  unknown: "sin localizar", no_answer: "no contesta", unreachable: "ilocalizable",
  contacted: "contactada", moving: "en ruta", safe: "a salvo",
  refusing: "se niega a salir", at_risk: "EN RIESGO",
  pending: "pendiente", calling: "llamando", answered: "ha contestado",
  cleared_by_patrol: "comprobada por patrulla", empty: "vacía",
  occupants_refuse: "se niegan a salir",
  open: "abierta", filling: "llenándose", threatened: "AMENAZADA", closed: "cerrada",
  forming: "formándose", moving_convoy: "en marcha", arrived: "ha llegado", broken: "ROTO",
  en_route: "en ruta",
};
const SOURCE_ES = {
  gps: "GPS (borde continuo)",
  declared: "declarada por teléfono (borde discontinuo)",
  inferred: "inferida (última conocida + rumbo)",
};
const MOBILITY_ES = {
  car: "coche", walking: "a pie", reduced: "movilidad reducida", immobile: "no puede salir sola",
};
const es = (v) => (v == null ? "—" : STATUS_ES[v] || v);

function personBody(p) {
  const rt = p.assigned_route || null;
  const zone = p.assigned_exit_id ? getState().safeZones[p.assigned_exit_id] : null;
  let html = kv([
    ["Estado", es(p.status)],
    ["Teléfono", p.phone],
    ["Posición", SOURCE_ES[p.position_source] || p.position_source],
    ["Actualizada", clock(p.position_updated_at)],
    ["Personas en casa", p.household_size],
    ["Movilidad", MOBILITY_ES[p.mobility] || p.mobility],
    ["Min al frente", p.minutes_to_front == null ? null : n1(p.minutes_to_front)],
    ["Prioridad", p.priority_score == null ? null : n2(p.priority_score)],
    ["Sector", p.sector_id],
    ["Salida", zone ? `${zone.name} (${p.assigned_exit_id})` : p.assigned_exit_id],
    ["Ruta", rt ? `${n0((rt.distance_m || 0) / 1000)} km · ${n0((rt.duration_s || 0) / 60)} min (${rt.source || "?"})` : null],
    ["Convoy", p.convoy_id ? `${p.convoy_id} (${p.convoy_role || "miembro"})` : null],
    ["Intentos de llamada", p.call_attempts],
    ["Smartphone", p.has_smartphone == null ? null : p.has_smartphone ? "sí" : "no"],
    ["Notas", p.notes],
  ]);
  if (p.last_instruction && p.last_instruction.text) {
    html += `<div class="say"><b>Última instrucción</b> · ${esc(p.last_instruction.channel || "")} ${esc(clock(p.last_instruction.sent_at))}<br>${esc(p.last_instruction.text)}</div>`;
  }
  return html;
}

function houseBody(h) {
  const margin =
    h.minutes_to_front != null && h.patrol_eta_min != null
      ? Math.round((h.minutes_to_front - h.patrol_eta_min) * 10) / 10
      : null;
  let html = kv([
    ["Estado", es(h.status)],
    ["Pueblo", h.village],
    ["Teléfono", h.phone],
    ["Residentes", h.residents_expected],
    ["Vulnerable", h.vulnerable ? `sí — ${h.vulnerability_reason || "sin detalle"}` : "no"],
    ["Sector", h.sector_id],
    ["Intentos", h.call_attempts],
    ["Última llamada", h.last_call_at ? clock(h.last_call_at) : null],
    ["Min al frente", h.minutes_to_front == null ? null : n1(h.minutes_to_front)],
    ["ETA patrulla", h.patrol_eta_min == null ? null : `${n1(h.patrol_eta_min)} min`],
    ["Margen", margin == null ? null : `${margin > 0 ? "+" : ""}${margin} min`],
    ["Patrulla", h.assigned_patrol_id],
    ["Puesto en la lista", h.priority_rank],
  ]);
  if (margin != null && margin < 0) {
    html += `<div class="say" style="border-left-color:var(--risk)">El fuego llega <b>${Math.abs(margin)} min antes</b> que la patrulla.
      Mandarla es arriesgar a la patrulla: esta decisión la firma una persona.</div>`;
  }
  return html;
}

function fireBody(f) {
  const w = f.wind || {};
  return (
    kv([
      ["Rumbo de la cabeza", f.head_bearing_deg == null ? null : `${n0(f.head_bearing_deg)}° (hacia dónde va)`],
      ["Viento", w.direction_deg == null ? null : `${n0(w.direction_deg)}° de dónde viene · ${n0(w.speed_kmh)} km/h${w.gusts_kmh ? ` (rachas ${n0(w.gusts_kmh)})` : ""}`],
      ["Avance", f.spread_rate_mh == null ? null : `${n0(f.spread_rate_mh)} m/h`],
      ["Semiángulo del cono", f.cone_half_angle_deg == null ? null : `${n0(f.cone_half_angle_deg)}°`],
      ["Actualizado", clock(f.updated_at)],
      ["Perímetros guardados", Array.isArray(f.history) ? f.history.length : 0],
    ]) +
    `<div class="say">El cono naranja es el geofence: si la trayectoria de alguien entra ahí, se le llama.
      <b>El viento se da de dónde viene; la cabeza, hacia dónde va</b> — por eso son casi opuestos.</div>`
  );
}

function sectorBody(s) {
  return (
    kv([
      ["Personas dentro", s.people_inside],
      ["Sin localizar", s.people_unknown],
      ["Vulnerables", s.vulnerable_inside],
      ["Min al frente", s.minutes_to_front == null ? null : n1(s.minutes_to_front)],
      ["Prioridad aérea", s.air_priority_rank],
    ]) + (s.air_priority_reason ? `<div class="say">${esc(s.air_priority_reason)}</div>` : "")
  );
}

function zoneBody(z) {
  const pct = z.capacity ? Math.round((100 * (z.occupancy || 0)) / z.capacity) : null;
  return kv([
    ["Estado", es(z.status)],
    ["Ocupación", `${z.occupancy ?? 0} / ${z.capacity ?? "?"}${pct != null ? ` (${pct}%)` : ""}`],
    ["Accesos", Array.isArray(z.access_roads) ? z.access_roads.join(", ") : z.access_roads],
    ["Distancia al fuego", z.distance_to_fire_m == null ? null : `${n1(z.distance_to_fire_m / 1000)} km`],
  ]);
}

function convoyBody(c) {
  const st = getState();
  const leader = st.people[c.leader_person_id];
  const members = (c.member_ids || []).map((id) => (st.people[id] && st.people[id].name) || id);
  return kv([
    ["Estado", c.status === "moving" ? "en marcha" : es(c.status)],
    ["Guía", leader ? `${leader.name} (${leader.id})` : c.leader_person_id],
    ["Vehículo", c.vehicle_description],
    ["Miembros", members.join(", ")],
    ["Cohesión", c.cohesion_ok === false ? "ROTA (alguien se separó)" : "ok"],
    ["Salida", c.exit_id],
    ["Formado", c.formed_at ? clock(c.formed_at) : null],
  ]);
}

function patrolBody(p) {
  return kv([
    ["Estado", es(p.status)],
    ["Canal", p.channel],
    ["Casas asignadas", Array.isArray(p.assigned_house_ids) ? p.assigned_house_ids.join(", ") : null],
  ]);
}

function closureBody(rc) {
  return kv([
    ["Vía", rc.road_name],
    ["Motivo", rc.reason],
    ["Desde", rc.since ? clock(rc.since) : null],
    ["Fuente", rc.source],
  ]);
}

/* ------------------------------------------------------------------
   Acciones por tipo
   ------------------------------------------------------------------ */
function actionsFor(kind, d) {
  const acts = [];
  const focus = (lat, lon) => ({
    label: "⊕ Centrar en el mapa",
    cls: "sm",
    run: async () => {
      const { focusOn } = await import("./map.js");
      focusOn([lat, lon], 14);
    },
  });

  if (kind === "person") {
    if (d.lat != null) acts.push(focus(d.lat, d.lon));
    if (d.assigned_route) {
      acts.push({
        label: "✖ Anular ruta",
        cls: "danger",
        run: () =>
          doOverride({
            subject_type: "person", subject_id: d.id, field: "assigned_route", value: null,
            title: `Anular la ruta de ${d.name || d.id}`,
            hint: "La ruta se borra y el sistema deja de mandarle por ahí. Se registra como human_override.",
            placeholder: "Ej: la Guardia Civil dice que ese camino está impracticable",
            confirmLabel: "Anular ruta", danger: true, done: "Ruta anulada",
          }),
      });
    }
    if (d.assigned_exit_id) {
      acts.push({
        label: "✖ Anular salida asignada",
        cls: "danger",
        run: () =>
          doOverride({
            subject_type: "person", subject_id: d.id, field: "assigned_exit_id", value: null,
            title: `Anular la salida de ${d.name || d.id}`,
            hint: "Quita la asignación de zona de salida (el sistema recalculará o esperará orden).",
            confirmLabel: "Anular salida", danger: true, done: "Salida anulada",
          }),
      });
    }
    if (d.convoy_id) {
      acts.push({
        label: "✖ Sacar del convoy",
        cls: "danger",
        run: () =>
          doOverride({
            subject_type: "person", subject_id: d.id, field: "convoy_id", value: null,
            title: `Sacar a ${d.name || d.id} del convoy ${d.convoy_id}`,
            confirmLabel: "Sacar del convoy", danger: true, done: "Fuera del convoy",
          }),
      });
    }
    acts.push({
      label: "☎︎ Forzar llamada",
      cls: "",
      run: () =>
        doOverride({
          subject_type: "person", subject_id: d.id, field: "force_call", value: true,
          title: `Forzar llamada a ${d.name || d.id}`,
          hint: "Pide a la plataforma una llamada inmediata, saltándose el orden de la cola.",
          placeholder: "Ej: un vecino avisa de que hay humo en su calle",
          confirmLabel: "Llamar ya", done: "Llamada forzada",
        }),
    });
    if (d.status !== "safe") {
      acts.push({
        label: "✔ Marcar a salvo",
        cls: "ok",
        run: () =>
          doOverride({
            subject_type: "person", subject_id: d.id, field: "status", value: "safe",
            title: `Marcar a ${d.name || d.id} como a salvo`,
            hint: "Úsalo solo con confirmación humana: sale de la cola de atención.",
            placeholder: "Ej: confirmado por el responsable del pabellón",
            confirmLabel: "Marcar a salvo", done: "Marcada a salvo",
          }),
      });
    }
  }

  if (kind === "house") {
    if (d.lat != null) acts.push(focus(d.lat, d.lon));
    acts.push({
      label: "✔ Comprobada por patrulla",
      cls: "ok",
      run: () =>
        doOverride({
          subject_type: "house", subject_id: d.id, field: "status", value: "cleared_by_patrol",
          title: `Cerrar ${d.address || d.id}`,
          hint: "Sale de la lista viva de la patrulla.",
          placeholder: "Ej: la patrulla informa por radio de que la casa está vacía",
          confirmLabel: "Cerrar casa", done: "Casa cerrada",
        }),
    });
    if (d.assigned_patrol_id) {
      acts.push({
        label: "✖ Quitar patrulla",
        cls: "danger",
        run: () =>
          doOverride({
            subject_type: "house", subject_id: d.id, field: "assigned_patrol_id", value: null,
            title: `Desasignar la patrulla de ${d.address || d.id}`,
            hint: "Se usa cuando el fuego llega antes que la patrulla y no se la manda.",
            confirmLabel: "Quitar patrulla", danger: true, done: "Patrulla desasignada",
          }),
      });
    } else {
      const patrol = list(getState().patrols)[0];
      if (patrol) {
        acts.push({
          label: `🚓 Asignar ${patrol.id}`,
          cls: "",
          run: () =>
            doOverride({
              subject_type: "house", subject_id: d.id, field: "assigned_patrol_id", value: patrol.id,
              title: `Mandar ${patrol.name || patrol.id} a ${d.address || d.id}`,
              placeholder: "Ej: la patrulla ya está en esa calle",
              confirmLabel: "Asignar patrulla", done: "Patrulla asignada",
            }),
        });
      }
    }
  }

  if (kind === "sector" && d.air_priority_rank !== 1) {
    acts.push({
      label: "🚁 Subir a prioridad aérea 1",
      cls: "",
      run: () =>
        doOverride({
          subject_type: "sector", subject_id: d.id, field: "air_priority_rank", value: 1,
          title: `Poner ${d.name || d.id} como primera descarga aérea`,
          placeholder: "Ej: el jefe de medios aéreos lo pide por radio",
          confirmLabel: "Subir a 1", done: "Prioridad aérea cambiada",
        }),
    });
  }

  if (kind === "zone") {
    if (d.lat != null) acts.push(focus(d.lat, d.lon));
    if (d.status !== "closed") {
      acts.push({
        label: "⛔ Cerrar salida",
        cls: "danger",
        run: () =>
          doOverride({
            subject_type: "safe_zone", subject_id: d.id, field: "status", value: "closed",
            title: `Cerrar ${d.name || d.id}`,
            hint: "Invalida todas las rutas que van ahí: el sistema tendrá que reasignar.",
            placeholder: "Ej: el pabellón está lleno y el acceso tiene humo",
            confirmLabel: "Cerrar salida", danger: true, done: "Salida cerrada",
          }),
      });
    }
  }

  if (kind === "convoy" && d.status !== "broken") {
    acts.push({
      label: "✖ Marcar convoy roto",
      cls: "danger",
      run: () =>
        doOverride({
          subject_type: "convoy", subject_id: d.id, field: "status", value: "broken",
          title: `Marcar ${d.id} como roto`,
          placeholder: "Ej: el guía avisa de que ha perdido a los de atrás",
          confirmLabel: "Romper convoy", danger: true, done: "Convoy marcado como roto",
        }),
    });
  }

  return acts;
}

/* ------------------------------------------------------------------
   API pública
   ------------------------------------------------------------------ */
const TITLES = {
  person: "Persona", house: "Casa", fire: "Frente del fuego", sector: "Sector",
  zone: "Zona de salida", convoy: "Convoy", patrol: "Patrulla", closure: "Vía cortada",
};

export function openCard(o) {
  if (!o || !o.data) return;
  bindOnce();
  const card = document.getElementById("entity-card");
  const title = document.getElementById("ec-title");
  const body = document.getElementById("ec-body");
  const actions = document.getElementById("ec-actions");
  if (!card || !title || !body || !actions) return;

  const d = o.data;
  current = { kind: o.kind, id: d.id || o.kind };

  const name =
    o.kind === "person" ? `${d.name || d.id}` :
    o.kind === "house" ? `${d.address || d.id}` :
    o.kind === "fire" ? "Frente del fuego" :
    `${d.name || d.id}`;
  title.innerHTML = `${esc(name)} <span class="tb-label" style="display:inline;margin-left:6px">${esc(TITLES[o.kind] || o.kind)}${d.id ? " · " + esc(d.id) : ""}</span>`;

  body.innerHTML =
    o.kind === "person" ? personBody(d) :
    o.kind === "house" ? houseBody(d) :
    o.kind === "fire" ? fireBody(d) :
    o.kind === "sector" ? sectorBody(d) :
    o.kind === "zone" ? zoneBody(d) :
    o.kind === "convoy" ? convoyBody(d) :
    o.kind === "patrol" ? patrolBody(d) :
    o.kind === "closure" ? closureBody(d) :
    kv(Object.keys(d).map((k) => [fieldLabel(k), shortValue(d[k])]));

  actions.innerHTML = "";
  for (const a of actionsFor(o.kind, d)) {
    const b = document.createElement("button");
    b.className = a.cls || "";
    b.textContent = a.label;
    b.addEventListener("click", async () => {
      b.disabled = true;
      try { await a.run(); } finally { b.disabled = false; }
    });
    actions.appendChild(b);
  }
  card.classList.add("show");
}

/** Reabre la ficha con los datos frescos del store (se llama en cada render). */
export function refreshCard() {
  if (!current) return;
  const s = getState();
  const bags = {
    person: s.people, house: s.houses, sector: s.sectors, zone: s.safeZones,
    convoy: s.convoys, patrol: s.patrols, closure: s.roadClosures,
  };
  if (current.kind === "fire") {
    if (s.fire) openCard({ kind: "fire", data: s.fire });
    return;
  }
  const bag = bags[current.kind];
  const d = bag && bag[current.id];
  if (d) openCard({ kind: current.kind, data: d });
}

export function closeCard() {
  current = null;
  const card = document.getElementById("entity-card");
  if (card) card.classList.remove("show");
}

function bindOnce() {
  if (bound) return;
  bound = true;
  const btn = document.getElementById("ec-close");
  if (btn) btn.addEventListener("click", closeCard);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !document.querySelector(".reason-modal")) closeCard();
  });
}
