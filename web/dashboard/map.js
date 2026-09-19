/* ============================================================
   map.js — el mapa. Es el elemento nº1 de la pantalla.
   Pinta: fuego (+ historial en gris), cono de avance, personas por estado
   (borde continuo = GPS, discontinuo = declarada), casas sin contestar,
   zonas seguras con ocupación, carreteras cortadas, sectores con nº de personas,
   convoyes (línea guía→miembros + ruta).
   Al pulsar cualquier elemento → ficha con todos sus datos y sus acciones.
   ============================================================ */

import { getState, list } from "./state.js";
import { openCard } from "./card.js";

const L = window.L;

// GeoJSON es [lon, lat]; Leaflet es [lat, lon]. Aquí es donde se invierte, y solo aquí.
function ring(coords) {
  return (coords || []).map((c) => [c[1], c[0]]);
}
function polyToLatLngs(geom) {
  if (!geom || !geom.coordinates) return [];
  if (geom.type === "Polygon") return geom.coordinates.map(ring);
  if (geom.type === "MultiPolygon") return geom.coordinates.map((p) => p.map(ring));
  return [];
}
function lineToLatLngs(geom) {
  if (!geom || !geom.coordinates) return [];
  if (geom.type === "LineString") return ring(geom.coordinates);
  if (geom.type === "MultiLineString") return geom.coordinates.map(ring);
  return [];
}

let map = null;
const layers = {};
// Cachés para no recrear capas en cada tick (y que el parpadeo CSS no se reinicie)
const personMarkers = new Map();
const houseMarkers = new Map();
const trails = new Map();
let firstFitDone = false;

export function initMap() {
  map = L.map("map", {
    zoomControl: true,
    attributionControl: true,
    preferCanvas: false,
    center: [41.83, -6.0],
    zoom: 12,
  });

  /* Fondo del mapa: rejilla dibujada EN LOCAL, cero red.
     Por qué no hay mapa base de tiles: el wifi de una hackathon se cae y, además,
     el basemap oscuro de CARTO ya exige API key (pinta "API KEY REQUIRED" encima
     del mapa: se vio en pantalla). Sin tiles el mapa sigue siendo legible porque
     lo que importa —fuego, personas, rutas, sectores— lo pintamos nosotros, y la
     rejilla + la escala dan referencia de distancia.
     Si alguien quiere el basemap online para una foto bonita: ?basemap=1 */
  const GridBack = L.GridLayer.extend({
    createTile(coords) {
      const t = document.createElement("canvas");
      const size = this.getTileSize();
      t.width = size.x; t.height = size.y;
      const c = t.getContext("2d");
      c.fillStyle = "#0e1216";
      c.fillRect(0, 0, size.x, size.y);
      c.strokeStyle = "rgba(108,123,137,.22)";
      c.lineWidth = 1;
      const step = size.x / 4;
      for (let i = 0; i <= 4; i++) {
        const p = Math.round(i * step) + 0.5;
        c.beginPath(); c.moveTo(p, 0); c.lineTo(p, size.y); c.stroke();
        c.beginPath(); c.moveTo(0, p); c.lineTo(size.x, p); c.stroke();
      }
      // Coordenadas de la esquina: orientan sin necesidad de callejero.
      const nw = this._map.unproject(coords.scaleBy(size), coords.z);
      c.fillStyle = "rgba(108,123,137,.55)";
      c.font = "600 11px system-ui, sans-serif";
      c.fillText(`${nw.lat.toFixed(2)}, ${nw.lng.toFixed(2)}`, 6, 14);
      return t;
    },
  });
  new GridBack({ attribution: "rejilla local · sin mapa base · DATOS SINTÉTICOS" }).addTo(map);

  if (new URLSearchParams(location.search).get("basemap") === "1") {
    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      subdomains: "abcd", maxZoom: 19, crossOrigin: true,
      attribution: "© OpenStreetMap · © CARTO · datos sintéticos",
    }).addTo(map);
  }

  // Escala: sin callejero, es la única forma de leer distancias en el proyector.
  L.control.scale({ imperial: false, position: "bottomleft", maxWidth: 160 }).addTo(map);

  // Muy alejado, las etiquetas de sector se pisan entre ellas y no se lee ninguna:
  // a partir de z12 se muestran; por debajo, el dato está en el panel aéreo.
  const syncZoom = () => {
    const el = map.getContainer();
    el.classList.toggle("z-far", map.getZoom() < 12);
  };
  map.on("zoomend", syncZoom);
  syncZoom();

  // Orden de pintado (panes): fuego debajo, personas arriba.
  map.createPane("p-history"); map.getPane("p-history").style.zIndex = 380;
  map.createPane("p-fire");    map.getPane("p-fire").style.zIndex = 400;
  map.createPane("p-sectors"); map.getPane("p-sectors").style.zIndex = 410;
  map.createPane("p-zones");   map.getPane("p-zones").style.zIndex = 420;
  map.createPane("p-routes");  map.getPane("p-routes").style.zIndex = 430;
  map.createPane("p-roads");   map.getPane("p-roads").style.zIndex = 440;

  layers.history = L.layerGroup().addTo(map);
  layers.fire = L.layerGroup().addTo(map);
  layers.cone = L.layerGroup().addTo(map);
  layers.sectors = L.layerGroup().addTo(map);
  layers.zones = L.layerGroup().addTo(map);
  layers.roads = L.layerGroup().addTo(map);
  layers.convoys = L.layerGroup().addTo(map);
  layers.trails = L.layerGroup().addTo(map);
  layers.houses = L.layerGroup().addTo(map);
  layers.people = L.layerGroup().addTo(map);

  document.getElementById("btn-fit").addEventListener("click", () => fitAll(true));
  return map;
}

export function getMap() { return map; }

export function focusOn(latlng, zoom) {
  if (!map || !latlng || latlng[0] == null) return;
  map.setView(latlng, zoom || Math.max(map.getZoom(), 13), { animate: true });
}

/* ---------------------- Fuego ---------------------- */
function renderFire(fire) {
  layers.fire.clearLayers();
  layers.cone.clearLayers();
  layers.history.clearLayers();
  if (!fire) return;

  // Historial: gris cada vez más claro hacia atrás → se VE cuánto ha crecido.
  const hist = Array.isArray(fire.history) ? fire.history.slice(-6) : [];
  hist.forEach((h, i) => {
    const rings = polyToLatLngs(h.perimeter);
    if (!rings.length) return;
    const age = hist.length - i;             // 1 = el más reciente
    const opacity = Math.max(0.05, 0.3 - age * 0.035);
    L.polygon(rings, {
      pane: "p-history",
      color: "#9aa7b4",
      weight: 1.5,
      opacity: 0.35,
      dashArray: "4 5",
      fillColor: "#9aa7b4",
      fillOpacity: opacity,
      interactive: false,
    }).addTo(layers.history);
  });

  const rings = polyToLatLngs(fire.perimeter);
  if (rings.length) {
    const poly = L.polygon(rings, {
      pane: "p-fire",
      color: "#ff3b30",
      weight: 4,
      opacity: 1,
      fillColor: "#ff3b30",
      fillOpacity: 0.32,
      className: "fire-edge",
    }).addTo(layers.fire);
    poly.on("click", () => openCard({ kind: "fire", data: fire }));

    // Cono de avance: sector circular con vértice en la cabeza del fuego.
    const head = fireHead(fire, rings[0]);
    if (head) {
      const cone = coneLatLngs(head, fire.head_bearing_deg, fire.cone_half_angle_deg || 30, coneRadiusM(fire));
      L.polygon(cone, {
        pane: "p-fire",
        color: "#ff8a00",
        weight: 2,
        dashArray: "8 6",
        opacity: 0.9,
        fillColor: "#ff8a00",
        fillOpacity: 0.13,
        interactive: false,
      }).addTo(layers.cone);
      L.marker(head, {
        interactive: false,
        icon: L.divIcon({
          className: "",
          html: `<div class="fire-label">🔥 cabeza ${Math.round(fire.head_bearing_deg ?? 0)}° · ${fire.spread_rate_mh ?? "?"} m/h</div>`,
          iconSize: [180, 16],
          iconAnchor: [90, 26],
        }),
      }).addTo(layers.cone);
    }
  }
}

/** Cabeza del fuego: el vértice del perímetro más avanzado en la dirección de avance. */
function fireHead(fire, latlngs) {
  if (!latlngs || !latlngs.length) return null;
  const bearing = ((fire.head_bearing_deg ?? 0) * Math.PI) / 180;
  // Vector unitario de avance en (lat, lon) aproximando lon por cos(lat)
  const c = Math.cos((latlngs[0][0] * Math.PI) / 180) || 1;
  const vLat = Math.cos(bearing);
  const vLon = Math.sin(bearing) / c;
  let best = null, bestDot = -Infinity;
  for (const p of latlngs) {
    const dot = p[0] * vLat + p[1] * vLon;
    if (dot > bestDot) { bestDot = dot; best = p; }
  }
  return best;
}

function coneRadiusM(fire) {
  // 40 minutos de avance, acotado para que no tape el mapa entero.
  const r = ((fire.spread_rate_mh || 900) / 60) * 40;
  return Math.max(1200, Math.min(r, 9000));
}

function coneLatLngs(origin, bearingDeg, halfAngleDeg, radiusM) {
  const pts = [origin];
  const steps = 22;
  const b0 = (bearingDeg ?? 0) - halfAngleDeg;
  for (let i = 0; i <= steps; i++) {
    pts.push(destination(origin, b0 + (2 * halfAngleDeg * i) / steps, radiusM));
  }
  return pts;
}

function destination(latlng, bearingDeg, distM) {
  const R = 6371000;
  const br = (bearingDeg * Math.PI) / 180;
  const lat1 = (latlng[0] * Math.PI) / 180;
  const lon1 = (latlng[1] * Math.PI) / 180;
  const dr = distM / R;
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(dr) + Math.cos(lat1) * Math.sin(dr) * Math.cos(br));
  const lon2 = lon1 + Math.atan2(Math.sin(br) * Math.sin(dr) * Math.cos(lat1), Math.cos(dr) - Math.sin(lat1) * Math.sin(lat2));
  return [(lat2 * 180) / Math.PI, (lon2 * 180) / Math.PI];
}

/* ---------------------- Sectores ---------------------- */
function renderSectors(sectors) {
  layers.sectors.clearLayers();
  for (const s of sectors) {
    const rings = polyToLatLngs(s.polygon);
    if (!rings.length) continue;
    const late = (s.minutes_to_front != null && s.minutes_to_front < 20);
    const poly = L.polygon(rings, {
      pane: "p-sectors",
      color: late ? "#ff8a00" : "#6d7b89",
      weight: 1.6,
      opacity: 0.85,
      dashArray: "3 4",
      fillOpacity: 0.03,
      fillColor: "#ffffff",
    }).addTo(layers.sectors);
    poly.on("click", () => openCard({ kind: "sector", data: s }));

    const c = poly.getBounds().getCenter();
    const inside = s.people_inside ?? 0;
    const unk = s.people_unknown ?? 0;
    L.marker(c, {
      interactive: false,
      icon: L.divIcon({
        className: "",
        // Etiqueta corta: el nombre largo del sector se tapaba con los de al lado.
        // El nombre completo y el motivo están en el panel de prioridad aérea y en la ficha.
        html: `<div class="sector-label">${(s.name || s.id).split("—")[0].trim()} · <b>${inside}</b> dentro${
          unk ? ` (${unk}?)` : ""
        }${s.minutes_to_front != null ? ` · ${Math.round(s.minutes_to_front)}′` : ""}</div>`,
        iconSize: [150, 16],
        iconAnchor: [75, 8],
      }),
    }).addTo(layers.sectors);
  }
}

/* ---------------------- Zonas seguras ---------------------- */
const ZONE_COLOR = { open: "#2fd06a", filling: "#ffb02e", threatened: "#ff8a00", closed: "#ff3b30" };

/** Nombre recortado para etiquetas del mapa (el completo está en la ficha). */
function shortName(name, max) {
  const s = String(name);
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + "…";
}

function renderZones(zones) {
  layers.zones.clearLayers();
  for (const z of zones) {
    if (z.lat == null || z.lon == null) continue;
    const color = ZONE_COLOR[z.status] || "#2fd06a";
    const shape = z.polygon
      ? L.polygon(polyToLatLngs(z.polygon), { pane: "p-zones", color, weight: 3, fillColor: color, fillOpacity: 0.22 })
      : L.circle([z.lat, z.lon], { pane: "p-zones", radius: 420, color, weight: 3, fillColor: color, fillOpacity: 0.22 });
    shape.addTo(layers.zones);
    shape.on("click", () => openCard({ kind: "zone", data: z }));

    const occ = z.capacity ? Math.round((100 * (z.occupancy || 0)) / z.capacity) : null;
    L.marker([z.lat, z.lon], {
      interactive: false,
      icon: L.divIcon({
        className: "",
        html: `<div class="zone-label">🏁 ${shortName(z.name || z.id, 22)}<br>${z.occupancy ?? 0}/${z.capacity ?? "?"}${
          occ != null ? ` (${occ}%)` : ""
        }${z.status && z.status !== "open" ? ` · ${z.status.toUpperCase()}` : ""}</div>`,
        iconSize: [220, 30],
        iconAnchor: [110, -14],
      }),
    }).addTo(layers.zones);
  }
}

/* ---------------------- Carreteras cortadas ---------------------- */
function renderRoads(closures) {
  layers.roads.clearLayers();
  for (const rc of closures) {
    const pts = lineToLatLngs(rc.geometry);
    if (!pts.length) continue;
    // Línea roja "tachada": trazo grueso + cruces encima.
    L.polyline(pts, { pane: "p-roads", color: "#ff3b30", weight: 7, opacity: 0.85 }).addTo(layers.roads);
    const x = L.polyline(pts, { pane: "p-roads", color: "#2a0709", weight: 7, opacity: 0.95, dashArray: "2 12" }).addTo(layers.roads);
    x.on("click", () => openCard({ kind: "closure", data: rc }));
    const mid = pts[Math.floor(pts.length / 2)];
    L.marker(mid, {
      interactive: false,
      icon: L.divIcon({
        className: "",
        html: `<div class="fire-label">⛔ ${rc.road_name || "vía cortada"}</div>`,
        iconSize: [180, 16],
        iconAnchor: [90, 8],
      }),
    }).addTo(layers.roads);
  }
}

/* ---------------------- Convoyes ---------------------- */
function renderConvoys(convoys, people) {
  layers.convoys.clearLayers();
  for (const c of convoys) {
    const leader = people[c.leader_person_id];
    if (!leader || leader.lat == null) continue;
    const color = c.status === "broken" || c.cohesion_ok === false ? "#ff3b30" : "#4aa8ff";
    for (const mid of c.member_ids || []) {
      if (mid === c.leader_person_id) continue;
      const m = people[mid];
      if (!m || m.lat == null) continue;
      L.polyline([[m.lat, m.lon], [leader.lat, leader.lon]], {
        color, weight: 2.5, opacity: 0.75, dashArray: "6 5",
      }).addTo(layers.convoys);
    }
    // Ruta del convoy (el guía la lleva; los demás "siguen al coche blanco")
    const path = routePoints(c.route);
    if (path.length > 1) {
      L.polyline(path, { pane: "p-routes", color, weight: 4, opacity: 0.85 }).addTo(layers.convoys);
    }
    const marker = L.marker([leader.lat, leader.lon], {
      icon: L.divIcon({
        className: "",
        html: `<div class="zone-label" style="color:${color}">🚗 ${c.id}${
          c.cohesion_ok === false ? " ⚠ roto" : ""
        } · ${(c.member_ids || []).length} coches</div>`,
        iconSize: [200, 16],
        iconAnchor: [100, 34],
      }),
    }).addTo(layers.convoys);
    marker.on("click", () => openCard({ kind: "convoy", data: c }));
  }
}

/** Puntos de una ruta. Aceptamos `points:[{lat,lon}]` (OPCIONAL) o polyline codificada de Google/OSRM. */
function routePoints(route) {
  if (!route) return [];
  if (Array.isArray(route.points)) return route.points.map((p) => [p.lat, p.lon]);
  if (Array.isArray(route.coordinates)) return route.coordinates.map((c) => [c[1], c[0]]);
  if (typeof route.polyline === "string" && route.polyline.length > 4 && route.polyline !== "encoded...") {
    try { return decodePolyline(route.polyline); } catch (_) { return []; }
  }
  return [];
}

/** Polilínea codificada (algoritmo de Google, precisión 5). */
function decodePolyline(str, precision) {
  let index = 0, lat = 0, lng = 0;
  const coords = [];
  const factor = Math.pow(10, precision || 5);
  while (index < str.length) {
    let result = 1, shift = 0, b;
    do { b = str.charCodeAt(index++) - 63 - 1; result += b << shift; shift += 5; } while (b >= 0x1f);
    lat += result & 1 ? ~(result >> 1) : result >> 1;
    result = 1; shift = 0;
    do { b = str.charCodeAt(index++) - 63 - 1; result += b << shift; shift += 5; } while (b >= 0x1f);
    lng += result & 1 ? ~(result >> 1) : result >> 1;
    coords.push([lat / factor, lng / factor]);
  }
  return coords;
}

/* ---------------------- Personas ---------------------- */
const DOT_SIZE = { small: 16, normal: 20, big: 26 };

/* Nombres en el mapa: SOLO los que importan (cabeza de la cola, en riesgo, quien
   se niega a salir). Con 120 vecinos, etiquetar a todos tapaba el fuego, los
   sectores y los nombres entre sí: el mapa dejaba de leerse desde lejos.
   Al resto se le ve el punto, y su nombre sale al pulsarlo (ficha). */
let labelIds = new Set();
const isLabelled = (p) => labelIds.has(p.id) || p.status === "at_risk" || p.status === "refusing";

function personIcon(p) {
  const size = p.status === "at_risk" || p.mobility === "immobile" ? DOT_SIZE.big : DOT_SIZE.normal;
  const cls = [
    "person-dot",
    `st-${p.status || "unknown"}`,
    `src-${p.position_source || "declared"}`,
    p.mobility === "immobile" || p.mobility === "reduced" ? "vuln" : "",
  ].join(" ");
  const label = isLabelled(p) ? (p.name ? p.name.split(" ")[0] : p.id) : "";
  return L.divIcon({
    className: "",
    html: `<div style="position:relative;width:${size}px;height:${size}px">
             <div class="${cls}" style="position:absolute;inset:0"></div>
             ${label ? `<span class="person-label">${label}</span>` : ""}
           </div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

function renderPeople(people) {
  const seen = new Set();
  for (const p of people) {
    if (p.lat == null || p.lon == null) continue;
    seen.add(p.id);
    const key = `${p.status}|${p.position_source}|${p.mobility}|${p.name}|${isLabelled(p) ? 1 : 0}`;
    let m = personMarkers.get(p.id);
    if (!m) {
      m = L.marker([p.lat, p.lon], { icon: personIcon(p), zIndexOffset: p.status === "at_risk" ? 500 : 0 });
      m._key = key;
      m.addTo(layers.people);
      m.on("click", () => openCard({ kind: "person", data: getState().people[p.id] || p }));
      personMarkers.set(p.id, m);
    } else {
      m.setLatLng([p.lat, p.lon]);
      if (m._key !== key) { m.setIcon(personIcon(p)); m._key = key; }
    }

    // Rastro de trayectoria (solo para quien se mueve)
    const traj = Array.isArray(p.trajectory) ? p.trajectory : [];
    if (traj.length > 1) {
      const pts = traj.map((t) => [t.lat, t.lon]).concat([[p.lat, p.lon]]);
      let tr = trails.get(p.id);
      if (!tr) {
        tr = L.polyline(pts, { color: "#2fd06a", weight: 3, opacity: 0.55, dashArray: "1 6" }).addTo(layers.trails);
        trails.set(p.id, tr);
      } else {
        tr.setLatLngs(pts);
      }
    }

    // Ruta asignada individual
    const rp = routePoints(p.assigned_route);
    if (rp.length > 1) {
      let rr = trails.get("r-" + p.id);
      if (!rr) {
        rr = L.polyline(rp, { pane: "p-routes", color: "#4aa8ff", weight: 2.5, opacity: 0.6 }).addTo(layers.trails);
        trails.set("r-" + p.id, rr);
      } else {
        rr.setLatLngs(rp);
      }
    }
  }
  // Quitar los que ya no están
  for (const [id, m] of personMarkers) {
    if (!seen.has(id)) { layers.people.removeLayer(m); personMarkers.delete(id); }
  }
  for (const [id, t] of trails) {
    const pid = id.startsWith("r-") ? id.slice(2) : id;
    if (!seen.has(pid)) { layers.trails.removeLayer(t); trails.delete(id); }
  }
}

/* ---------------------- Casas ---------------------- */
function houseIcon(h) {
  const late = h.minutes_to_front != null && h.patrol_eta_min != null && h.minutes_to_front < h.patrol_eta_min;
  const size = 18;
  const cls = ["house-sq", late ? "late" : "", h.vulnerable ? "vuln" : ""].join(" ");
  // Solo se etiquetan las casas que la patrulla tiene que mirar ya: las que el
  // fuego alcanza antes que la patrulla o con alguien vulnerable dentro.
  // (El motivo de vulnerabilidad NO se pinta en el mapa: es dato de salud, RGPD art. 9.)
  const label = late || h.vulnerable ? `${h.id}${h.vulnerable ? " ♿" : ""}` : "";
  return L.divIcon({
    className: "",
    html: `<div style="position:relative;width:${size}px;height:${size}px">
             <div class="${cls}" style="position:absolute;inset:0"></div>
             ${label ? `<span class="person-label">${label}</span>` : ""}
           </div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

function renderHouses(houses) {
  const seen = new Set();
  for (const h of houses) {
    // Solo pintamos las que importan a la patrulla: sin contestar / ilocalizables.
    if (h.status !== "no_answer" && h.status !== "unreachable" && h.status !== "calling") continue;
    if (h.lat == null || h.lon == null) continue;
    seen.add(h.id);
    let m = houseMarkers.get(h.id);
    const key = `${h.status}|${h.minutes_to_front}|${h.patrol_eta_min}|${h.vulnerable}`;
    if (!m) {
      m = L.marker([h.lat, h.lon], { icon: houseIcon(h) }).addTo(layers.houses);
      m._key = key;
      m.on("click", () => openCard({ kind: "house", data: getState().houses[h.id] || h }));
      houseMarkers.set(h.id, m);
    } else if (m._key !== key) {
      m.setIcon(houseIcon(h)); m._key = key;
    }
  }
  for (const [id, m] of houseMarkers) {
    if (!seen.has(id)) { layers.houses.removeLayer(m); houseMarkers.delete(id); }
  }
}

/* ---------------------- Patrullas ---------------------- */
function renderPatrols(patrols) {
  for (const pt of patrols) {
    if (pt.lat == null) continue;
    let m = houseMarkers.get("pt:" + pt.id);
    if (!m) {
      m = L.marker([pt.lat, pt.lon], {
        icon: L.divIcon({
          className: "",
          html: `<div class="zone-label" style="color:#4aa8ff">🚓 ${pt.name || pt.id}</div>`,
          iconSize: [200, 16], iconAnchor: [100, 8],
        }),
      }).addTo(layers.houses);
      m.on("click", () => openCard({ kind: "patrol", data: pt }));
      houseMarkers.set("pt:" + pt.id, m);
    } else {
      m.setLatLng([pt.lat, pt.lon]);
    }
  }
}

/* ---------------------- Render completo ---------------------- */
export function renderMap() {
  if (!map) return;
  const s = getState();
  // Quién lleva nombre puesto en el mapa: los 8 primeros de la cola de atención.
  labelIds = new Set(list(s.queue).slice(0, 8).map((q) => q.person_id || q.id).filter(Boolean));
  renderFire(s.fire);
  renderSectors(list(s.sectors));
  renderZones(list(s.safeZones));
  renderRoads(list(s.roadClosures));
  renderHouses(list(s.houses));
  renderPatrols(list(s.patrols));
  renderPeople(list(s.people));
  renderConvoys(list(s.convoys), s.people);

  if (!firstFitDone && (Object.keys(s.people).length || s.fire)) {
    firstFitDone = true;
    fitAll(false);
  }
}

export function fitAll(animate) {
  if (!map) return;
  const s = getState();
  const pts = [];
  for (const p of list(s.people)) if (p.lat != null) pts.push([p.lat, p.lon]);
  for (const h of list(s.houses)) if (h.lat != null) pts.push([h.lat, h.lon]);
  for (const z of list(s.safeZones)) if (z.lat != null) pts.push([z.lat, z.lon]);
  if (s.fire) for (const r of polyToLatLngs(s.fire.perimeter)) for (const p of r) pts.push(p);
  if (!pts.length) return;
  map.fitBounds(L.latLngBounds(pts).pad(0.12), { animate: !!animate });
}
