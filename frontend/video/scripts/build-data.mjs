// Convierte backend/data/scenarios/sierra-culebra.json en src/data/scene.json:
// casas, personas, refugios, fuego, patrullas y sectores ya proyectados a
// coordenadas de pantalla (1920x1080), para que las escenas no hagan geometría.
//
// Todo lo que se dibuja en el vídeo sale de aquí. Si el dataset cambia, se
// regenera con `npm run data`.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const SRC = join(here, "..", "..", "..", "backend", "data", "scenarios", "sierra-culebra.json");
const OUT = join(here, "..", "src", "data", "scene.json");

const W = 1920;
const H = 1080;
const PAD = 80;

const scenario = JSON.parse(readFileSync(SRC, "utf8"));

// Encuadre: los tres pueblos más los refugios, con margen. No el bbox completo
// (es muy ancho y deja los pueblos diminutos).
const focus = [
  ...scenario.villages.map((v) => [v.lon, v.lat]),
  ...scenario.safe_zones.map((s) => [s.lon, s.lat]),
  ...scenario.fire.perimeter.coordinates[0],
];
const lons = focus.map((p) => p[0]);
const lats = focus.map((p) => p[1]);
const bbox = {
  lonMin: Math.min(...lons),
  lonMax: Math.max(...lons),
  latMin: Math.min(...lats),
  latMax: Math.max(...lats),
};

// Mercator en radianes en ambos ejes, si no la proyección se aplasta.
const rad = (deg) => (deg * Math.PI) / 180;
const mercY = (lat) => Math.log(Math.tan(Math.PI / 4 + rad(lat) / 2));
const xMin = rad(bbox.lonMin);
const xMax = rad(bbox.lonMax);
const yMin = mercY(bbox.latMin);
const yMax = mercY(bbox.latMax);
const scaleX = (W - 2 * PAD) / (xMax - xMin);
const scaleY = (H - 2 * PAD) / (yMax - yMin);
const scale = Math.min(scaleX, scaleY);
const offX = (W - scale * (xMax - xMin)) / 2;
const offY = (H - scale * (yMax - yMin)) / 2;

export function project(lon, lat) {
  return {
    x: offX + (rad(lon) - xMin) * scale,
    y: H - (offY + (mercY(lat) - yMin) * scale),
  };
}

// Quién contesta se decide por persona en el dataset; lo subimos a la casa.
const answersByHouse = new Map();
for (const p of scenario.people) {
  answersByHouse.set(p.house_id, p._sim?.will_answer_call ?? true);
}

const houses = scenario.houses.map((h) => ({
  id: h.id,
  village: h.village,
  address: h.address,
  residents: h.residents_expected,
  vulnerable: h.vulnerable,
  answers: answersByHouse.get(h.id) ?? true,
  ...project(h.lon, h.lat),
}));

const people = scenario.people.map((p) => ({
  id: p.id,
  houseId: p.house_id,
  name: p.name,
  household: p.household_size,
  mobility: p.mobility,
  age: p._sim?.age ?? null,
  answers: p._sim?.will_answer_call ?? true,
  refuses: p._sim?.will_refuse_evacuation ?? false,
  ...project(p.lon, p.lat),
}));

const shelters = scenario.safe_zones.map((s) => ({
  id: s.id,
  name: s.name,
  capacity: s.capacity,
  ...project(s.lon, s.lat),
}));

const villages = scenario.villages.map((v) => ({
  name: v.name,
  population: v.population,
  ...project(v.lon, v.lat),
}));

const patrols = scenario.patrols.map((p) => ({
  id: p.id,
  name: p.name,
  ...project(p.lon, p.lat),
}));

const firePolygon = scenario.fire.perimeter.coordinates[0].map(([lon, lat]) => project(lon, lat));
const fireCenter = {
  x: firePolygon.reduce((a, p) => a + p.x, 0) / firePolygon.length,
  y: firePolygon.reduce((a, p) => a + p.y, 0) / firePolygon.length,
};

// Escala: metros por píxel en el centro del encuadre, para convertir la
// velocidad de avance del fuego (m/h) y las velocidades de las personas (km/h)
// a píxeles por segundo de vídeo.
const centerLat = (bbox.latMin + bbox.latMax) / 2;
const widthMeters = (bbox.lonMax - bbox.lonMin) * 111320 * Math.cos(rad(centerLat));
const metersPerPx = widthMeters / (scale * (xMax - xMin));

// Casa protagonista: la que seguimos en la escena "una casa". Hogar de 3 o
// más, con alguien que no va en coche, en el pueblo más cercano al fuego.
const villageDist = (v) => Math.hypot(v.lon - scenario.fire.perimeter.coordinates[0][0][0], v.lat - scenario.fire.perimeter.coordinates[0][0][1]);
const nearestVillage = [...scenario.villages].sort((a, b) => villageDist(a) - villageDist(b))[0].name;
const heroPerson =
  scenario.people.find(
    (p) => p.household_size >= 3 && p.mobility !== "car" && scenario.houses.find((h) => h.id === p.house_id)?.village === nearestVillage && (p._sim?.will_answer_call ?? true)
  ) ??
  scenario.people.find((p) => p.household_size >= 3 && (p._sim?.will_answer_call ?? true)) ??
  scenario.people[0];
const heroHouse = scenario.houses.find((h) => h.id === heroPerson.house_id);
const hero = {
  personId: heroPerson.id,
  houseId: heroHouse.id,
  name: heroPerson.name,
  age: heroPerson._sim?.age ?? null,
  address: heroHouse.address,
  village: heroHouse.village,
  household: heroPerson.household_size,
  mobility: heroPerson.mobility,
  hasSmartphone: heroPerson.has_smartphone,
  ...project(heroHouse.lon, heroHouse.lat),
};

const sectors = scenario.sectors.map((s) => ({
  id: s.id,
  name: s.name,
  polygon: s.polygon.coordinates[0].map(([lon, lat]) => project(lon, lat)),
}));

const scene = {
  meta: {
    name: scenario.meta.name,
    seed: scenario.meta.seed,
    notice: scenario.meta.notice,
    width: W,
    height: H,
    metersPerPx,
  },
  bbox,
  hero,
  villages,
  houses,
  people,
  shelters,
  patrols,
  sectors,
  fire: {
    polygon: firePolygon,
    center: fireCenter,
    headBearingDeg: scenario.fire.head_bearing_deg,
    coneHalfAngleDeg: scenario.fire.cone_half_angle_deg,
    spreadRateMh: scenario.fire.spread_rate_mh,
    windKmh: scenario.fire.wind.speed_kmh,
    windDirDeg: scenario.fire.wind.direction_deg,
  },
  counts: {
    houses: houses.length,
    people: people.reduce((a, p) => a + p.household, 0),
    noAnswer: houses.filter((h) => !h.answers).length,
    vulnerable: houses.filter((h) => h.vulnerable).length,
  },
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(scene, null, 1));
console.log(
  `scene.json: ${houses.length} casas, ${scene.counts.people} personas, ${shelters.length} refugios, ${scene.counts.noAnswer} casas sin respuesta`
);
