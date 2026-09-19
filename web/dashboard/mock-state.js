/* ============================================================
   mock-state.js — PLAN B TOTAL: escenario dentro del navegador.
   Se carga solo con ?mock=1 y no hace ni una petición de red: si el wifi de la
   hackathon muere y la API no arranca, la pantalla sigue contando la historia.

   OJO: aquí NO se escribe nada de verdad. Los botones de intervención fallarán
   con un toast de error (no hay API a la que hacer POST). Para demo real usa
   mock-api.py, que sí acepta /human/override y /human/approve.

   Mismos campos que el contrato (docs/contrato-de-datos.md): ni uno inventado.
   Mismo escenario que mock-api.py, en pequeño: Losacio (Zamora), 19 sep 17:30Z.
   ============================================================ */

const T0 = new Date("2026-09-19T17:30:00Z");
let tick = 0;
const iso = (min) => new Date(T0.getTime() + min * 60000).toISOString();

/* ---------- el fuego ---------- */
function ring(cx, cy, rx, ry) {
  const pts = [];
  for (let i = 0; i <= 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    pts.push([+(cx + rx * Math.cos(a)).toFixed(5), +(cy + ry * Math.sin(a)).toFixed(5)]);
  }
  return pts;
}
function fireAt(step) {
  // El frente crece y sube hacia el norte con cada paso.
  const cy = 41.8135 + step * 0.0055;
  return {
    id: "fire-1",
    updated_at: iso(step * 5),
    perimeter: { type: "Polygon", coordinates: [ring(-6.0290, cy, 0.0145 + step * 0.002, 0.0080 + step * 0.0015)] },
    head_bearing_deg: step >= 3 ? 20 : 45,
    spread_rate_mh: step >= 3 ? 2400 : 1800,
    cone_half_angle_deg: 30,
    wind: {
      direction_deg: step >= 3 ? 200 : 225,
      speed_kmh: step >= 3 ? 38 : 24,
      gusts_kmh: step >= 3 ? 61 : 40,
    },
    history: [],
  };
}

/* ---------- snapshot inicial ---------- */
function baseSnapshot() {
  return {
    t: iso(0),
    state_version: 1,
    fire: fireAt(0),
    people: [
      {
        id: "p-001", name: "Manuela Prieto", phone: "+34600990001", lat: 41.8247, lon: -6.0305,
        position_source: "gps", position_updated_at: iso(0), status: "moving", household_size: 2,
        mobility: "car", has_smartphone: true, sector_id: "s-1", assigned_exit_id: "x-a",
        minutes_to_front: 14, priority_score: 0.71, call_attempts: 1, convoy_id: "c-1", convoy_role: "leader",
        score_breakdown: { urgency: 0.31, mobility: 0.04, uncertainty: 0.0, household_size: 0.04, trajectory_drift: 0.0 },
        assigned_route: { distance_m: 8200, duration_s: 780, source: "osrm", points: [
          { lat: 41.8247, lon: -6.0305 }, { lat: 41.8400, lon: -6.0100 }, { lat: 41.8712, lon: -5.9531 }] },
        last_instruction: { channel: "voice", sent_at: iso(1), text: "Salga por la pista de Tábara, hacia el noreste. No coja la N-631." },
      },
      {
        id: "p-002", name: "Ramiro Vaquero", phone: "+34600990002", lat: 41.8192, lon: -6.0215,
        position_source: "declared", position_updated_at: iso(0), status: "contacted", household_size: 1,
        mobility: "reduced", has_smartphone: false, sector_id: "s-1", minutes_to_front: 9,
        priority_score: 0.83, call_attempts: 1,
        score_breakdown: { urgency: 0.40, mobility: 0.16, uncertainty: 0.11, household_size: 0.02, trajectory_drift: 0.0 },
        notes: "Vive solo, no tiene coche. Posición dada por teléfono: borde discontinuo.",
      },
      {
        id: "p-003", name: "Estrella Fidalgo", phone: "+34600990003", lat: 41.8360, lon: -6.0255,
        position_source: "gps", position_updated_at: iso(0), status: "unknown", household_size: 3,
        mobility: "car", has_smartphone: true, sector_id: "s-2", minutes_to_front: 22,
        priority_score: 0.52, call_attempts: 2,
        score_breakdown: { urgency: 0.20, mobility: 0.04, uncertainty: 0.15, household_size: 0.06, trajectory_drift: 0.07 },
      },
      {
        id: "p-004", name: "Ovidio Casaseca", phone: "+34600990004", lat: 41.8550, lon: -6.0690,
        position_source: "gps", position_updated_at: iso(0), status: "safe", household_size: 2,
        mobility: "car", has_smartphone: true, sector_id: "s-3", assigned_exit_id: "x-b",
        minutes_to_front: 48, priority_score: 0.08, call_attempts: 1,
        score_breakdown: { urgency: 0.02, mobility: 0.04, uncertainty: 0.0, household_size: 0.02, trajectory_drift: 0.0 },
      },
    ],
    houses: [
      { id: "h-012", address: "Calle Mayor 4, Losacio", village: "Losacio", lat: 41.8262, lon: -6.0208,
        phone: "+34600990012", status: "no_answer", residents_expected: 2, vulnerable: false,
        sector_id: "s-1", call_attempts: 3, last_call_at: iso(2), minutes_to_front: 16,
        patrol_eta_min: 9, priority_rank: 2 },
      { id: "h-044", address: "Carretera de Tábara 21, Losacio", village: "Losacio", lat: 41.8215, lon: -6.0122,
        phone: "+34600990044", status: "no_answer", residents_expected: 1, vulnerable: true,
        vulnerability_reason: "persona mayor que vive sola", sector_id: "s-1", call_attempts: 4,
        last_call_at: iso(3), minutes_to_front: 11, patrol_eta_min: 12, priority_rank: 1 },
      { id: "h-072", address: "Calle Larga 15, Ferreras de Abajo", village: "Ferreras de Abajo",
        lat: 41.8430, lon: -6.0620, phone: "+34600990072", status: "no_answer", residents_expected: 4,
        vulnerable: false, sector_id: "s-3", call_attempts: 2, minutes_to_front: 34,
        patrol_eta_min: 15, priority_rank: 3 },
    ],
    sectors: [
      { id: "s-1", name: "Sector 1 — Losacio sur", lat: 41.8250, lon: -6.0210, people_inside: 2,
        people_unknown: 0, vulnerable_inside: 1, minutes_to_front: 11, air_priority_rank: 1,
        air_priority_reason: "2 personas dentro y una casa con vulnerable sin contestar; el frente llega en 11 min" },
      { id: "s-2", name: "Sector 2 — Losacio norte", lat: 41.8360, lon: -6.0255, people_inside: 1,
        people_unknown: 1, vulnerable_inside: 0, minutes_to_front: 22, air_priority_rank: 2,
        air_priority_reason: "1 persona sin localizar; hay margen todavía" },
      { id: "s-3", name: "Sector 3 — Ferreras de Abajo", lat: 41.8440, lon: -6.0630, people_inside: 0,
        people_unknown: 0, vulnerable_inside: 0, minutes_to_front: 34, air_priority_rank: 3,
        air_priority_reason: "nadie dentro: el agua vale más en otro sector" },
    ],
    safe_zones: [
      { id: "x-a", name: "Tábara (CRA León Felipe)", lat: 41.8712, lon: -5.9531, capacity: 400,
        occupancy: 126, status: "open", access_roads: ["ZA-P-1503"], distance_to_fire_m: 7400 },
      { id: "x-b", name: "Pabellón de Ferreras", lat: 41.8550, lon: -6.0900, capacity: 250,
        occupancy: 41, status: "open", access_roads: ["N-631"], distance_to_fire_m: 6100 },
      { id: "x-c", name: "Campo de fútbol de Losacio", lat: 41.8330, lon: -6.0480, capacity: 150,
        occupancy: 18, status: "open", access_roads: ["ZA-P-1511"], distance_to_fire_m: 2900 },
    ],
    convoys: [
      { id: "c-1", leader_person_id: "p-001", member_ids: ["p-001", "p-002"], status: "forming",
        vehicle_description: "Seat León blanco", exit_id: "x-a", cohesion_ok: true, formed_at: iso(2) },
    ],
    patrols: [
      { id: "pt-1", name: "Guardia Civil Tábara 2", lat: 41.8501, lon: -5.9902, status: "standby",
        channel: "radio", assigned_house_ids: [] },
    ],
    road_closures: [
      { id: "rc-1", road_name: "ZA-P-1511 km 4", lat: 41.8300, lon: -6.0400, status: "closed",
        reason: "humo denso, visibilidad nula", since: iso(0), source: "Guardia Civil" },
    ],
    decision_log: [
      { id: "d-001", t: iso(0), type: "entity_created", subject_type: "system", subject_id: null,
        before: {}, after: { people: 4, houses: 3 }, reason: "Carga del escenario sintético de Losacio",
        actor: "system" },
      { id: "d-002", t: iso(1), type: "call_placed", subject_type: "person", subject_id: "p-001",
        before: { status: "unknown" }, after: { status: "contacted", answered: true },
        reason: "Está en el cono del fuego a 14 min: es la primera de la cola", actor: "agent" },
      { id: "d-003", t: iso(2), type: "convoy_formed", subject_type: "convoy", subject_id: "c-1",
        before: {}, after: { leader_person_id: "p-001", member_ids: ["p-001", "p-002"] },
        reason: "Ramiro no tiene coche y Manuela sale con sitio: van juntos", actor: "agent" },
      { id: "d-004", t: iso(3), type: "house_escalated_to_patrol", subject_type: "house", subject_id: "h-044",
        before: { call_attempts: 3 }, after: { call_attempts: 4, status: "no_answer" },
        reason: "4 intentos sin respuesta y consta persona mayor sola: no se puede cerrar por teléfono",
        actor: "agent" },
    ],
  };
}

/* ---------- los pasos del escenario (esto es lo que se mueve) ---------- */
const STEPS = [
  {
    at: 6,
    apply: (s) => ({
      t: iso(7), state_version: 2, fire: fireAt(1),
      people: [{ id: "p-003", status: "contacted", call_attempts: 3, priority_score: 0.58 }],
      decision_log: [
        { id: "s1-a", t: iso(7), type: "call_placed", subject_type: "person", subject_id: "p-003",
          before: { status: "unknown" }, after: { status: "contacted", answered: true },
          reason: "Tercer intento: contesta y confirma que está en casa con dos niños", actor: "agent" },
      ],
    }),
  },
  {
    at: 14, // EL GIRO DEL VIENTO: la cascada que demuestra la adaptación
    apply: () => ({
      t: iso(15), state_version: 3, fire: fireAt(3),
      safe_zones: [{ id: "x-c", status: "threatened", distance_to_fire_m: 2100 }],
      road_closures: [{ id: "rc-2", road_name: "N-631 km 32", lat: 41.8480, lon: -6.0750,
        status: "closed", reason: "el frente cruza la vía", since: iso(15), source: "Guardia Civil" }],
      people: [
        { id: "p-001", minutes_to_front: 8, priority_score: 0.88,
          score_breakdown: { urgency: 0.44, mobility: 0.04, uncertainty: 0.0, household_size: 0.04, trajectory_drift: 0.09 } },
        { id: "p-004", assigned_exit_id: "x-a", status: "moving" },
      ],
      sectors: [
        { id: "s-2", air_priority_rank: 1, minutes_to_front: 9,
          air_priority_reason: "el viento ha girado: el frente va hacia el norte y aquí hay 1 sin localizar" },
        { id: "s-1", air_priority_rank: 2, air_priority_reason: "la gente de este sector ya va saliendo" },
      ],
      convoys: [{ id: "c-1", status: "broken", cohesion_ok: false }],
      houses: [{ id: "h-044", minutes_to_front: 6, patrol_eta_min: 18, assigned_patrol_id: null }],
      pending_approvals: [{
        decision_id: "s2-ap", action: "patrol_assigned",
        payload: { house_id: "h-044", patrol_id: "pt-1", margin_min: -12.0 },
        reason: "El fuego llega 12 min antes que la patrulla. Mandarla es arriesgar a la patrulla: lo firma una persona.",
        requested_at: iso(15), expires_at: iso(19),
      }],
      decision_log: [
        { id: "s2-a", t: iso(15), type: "fire_updated", subject_type: "fire", subject_id: "fire-1",
          before: { wind: { direction_deg: 225, speed_kmh: 24 }, head_bearing_deg: 45, spread_rate_mh: 1800 },
          after: { wind: { direction_deg: 200, speed_kmh: 38 }, head_bearing_deg: 20, spread_rate_mh: 2400 },
          reason: "AEMET: el viento gira al sur y arrecia. El frente pasa a avanzar hacia el norte.",
          actor: "system", trigger_event_id: "ev-wind-turn" },
        { id: "s2-b", t: iso(15), type: "exit_status_changed", subject_type: "safe_zone", subject_id: "x-c",
          before: { status: "open", distance_to_fire_m: 2900 }, after: { status: "threatened", distance_to_fire_m: 2100 },
          reason: "El frente queda a 2,1 km del campo de fútbol: ya no vale como destino",
          actor: "system", trigger_event_id: "ev-wind-turn" },
        { id: "s2-c", t: iso(15), type: "road_closed", subject_type: "road_closure", subject_id: "rc-2",
          before: {}, after: { road_name: "N-631 km 32", status: "closed" },
          reason: "El fuego cruza la N-631: todas las rutas que pasaban por ahí quedan inválidas",
          actor: "system", trigger_event_id: "ev-wind-turn" },
        { id: "s2-d", t: iso(15), type: "route_recalculated", subject_type: "person", subject_id: "p-001",
          before: { distance_m: 8200, duration_s: 780 }, after: { distance_m: 11400, duration_s: 1020 },
          reason: "Su ruta pasaba por la N-631 cortada: se rodea por la pista de Tábara",
          actor: "agent", trigger_event_id: "ev-wind-turn" },
        { id: "s2-e", t: iso(15), type: "exit_reassigned", subject_type: "person", subject_id: "p-004",
          before: { assigned_exit_id: "x-b" }, after: { assigned_exit_id: "x-a" },
          reason: "El acceso al pabellón de Ferreras depende de la N-631 cortada",
          actor: "agent", trigger_event_id: "ev-wind-turn" },
        { id: "s2-f", t: iso(15), type: "convoy_broken", subject_type: "convoy", subject_id: "c-1",
          before: { cohesion_ok: true, status: "forming" }, after: { cohesion_ok: false, status: "broken" },
          reason: "Con la ruta nueva el guía se separa más de 1,5 km de Ramiro",
          actor: "system", trigger_event_id: "ev-wind-turn" },
        { id: "s2-g", t: iso(15), type: "air_priority_changed", subject_type: "sector", subject_id: "s-2",
          before: { air_priority_rank: 2 }, after: { air_priority_rank: 1 },
          reason: "El frente va ahora hacia el sector 2, donde queda 1 persona sin localizar",
          actor: "agent", trigger_event_id: "ev-wind-turn" },
        { id: "s2-ap", t: iso(15), type: "approval_requested", subject_type: "house", subject_id: "h-044",
          before: { patrol_eta_min: 12, minutes_to_front: 11 }, after: { patrol_eta_min: 18, minutes_to_front: 6 },
          reason: "El fuego llega 12 min antes que la patrulla. Mandarla es arriesgar a la patrulla: lo firma una persona.",
          actor: "agent", trigger_event_id: "ev-wind-turn" },
      ],
    }),
  },
  {
    at: 26,
    apply: () => ({
      t: iso(22), state_version: 4, fire: fireAt(4),
      people: [{ id: "p-002", status: "moving", position_source: "declared", assigned_exit_id: "x-a" }],
      decision_log: [
        { id: "s3-a", t: iso(22), type: "sms_sent", subject_type: "person", subject_id: "p-002",
          before: {}, after: { channel: "sms" },
          reason: "No tiene smartphone: se le manda la ruta en texto corto y se avisa al vecino con coche",
          actor: "agent" },
        { id: "s3-b", t: iso(22), type: "person_status_changed", subject_type: "person", subject_id: "p-002",
          before: { status: "contacted" }, after: { status: "moving" },
          reason: "El vecino confirma que lo ha recogido y van hacia Tábara", actor: "agent" },
      ],
    }),
  },
];

/* ------------------------------------------------------------------ */
export function startMock(ctx) {
  const { mergeSnapshot, recompute, notify, state, setConn } = ctx;
  mergeSnapshot(baseSnapshot(), true);
  recompute();
  state.lastGoodAt = new Date();
  setConn("mock", "escenario local, sin API detrás");
  notify();

  // Historial del fuego: cada paso guarda el perímetro anterior (se ve el avance).
  const history = [];

  setInterval(() => {
    tick++;
    for (const step of STEPS) {
      if (step.at !== tick) continue;
      const patch = step.apply(state);
      if (patch.fire && state.fire && state.fire.perimeter) {
        history.push({ t: state.fire.updated_at, perimeter: state.fire.perimeter });
        patch.fire.history = history.slice(-6);
      }
      mergeSnapshot(patch, false);
      recompute();
      state.lastGoodAt = new Date();
      setConn("mock", `escenario local · v${state.version}`);
      notify();
    }
    if (tick > 40) tick = 0; // el bucle se repite: útil para ensayar la demo varias veces
  }, 1000);

  console.info("[mock] escenario local en marcha: el viento gira a los ~14 s");
}
