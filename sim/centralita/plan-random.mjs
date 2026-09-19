// Calcula la lista de elegibles y una secuencia de Math.random() que fuerza
// que pickWaveCitizens elija exactamente los 4 ids ya conversados.
// Uso: node --experimental-strip-types plan-random.mjs   (node 24: --experimental-transform-types no hace falta si no hay enums)
import { registerHooks } from "node:module";

registerHooks({
  resolve(specifier, context, next) {
    return next(specifier.startsWith("./") && !specifier.endsWith(".ts") && !specifier.endsWith(".json") ? `${specifier}.ts` : specifier, context);
  },
});

const { INITIAL_CITIZENS, SAFE_ZONES } = await import("../../apps/command-center/src/scenario.ts");
const { groupSize, zoneUsage } = await import("../../apps/command-center/src/simulation.ts");
const { haversineMeters } = await import("../../apps/command-center/src/geo.ts");

const TARGETS = ["c-168", "c-17", "c-22", "c-11"];
const WAVE_LOCALITIES = new Set(["Guisando", "Arenas de San Pedro"]);

const citizens = INITIAL_CITIZENS;
const zoneFor = (c) =>
  [...SAFE_ZONES]
    .sort((a, b) => haversineMeters(c.lng, c.lat, a.lng, a.lat) - haversineMeters(c.lng, c.lat, b.lng, b.lat))
    .find((z) => zoneUsage(citizens, z.id).reservedPeople + groupSize(c) <= z.capacity) ?? null;

const eligible = citizens.filter(
  (c) =>
    c.resident === true && c.outcome === "tracking" && c.status === "pending" &&
    c.group?.mobility !== "pickup" && WAVE_LOCALITIES.has(c.locality ?? "") && zoneFor(c) !== null,
);
console.log("elegibles:", eligible.length);
for (const t of TARGETS) {
  if (!eligible.find((c) => c.id === t)) console.log("OJO: no elegible", t);
}

// Fisher-Yates con j elegido: queremos TARGETS en posiciones 0..3.
const arr = eligible.map((c) => c.id);
const n = arr.length;
const seq = [];
const jToR = (i, j) => (j + 0.5) / (i + 1);
// Fase 1: i=n-1..4 — sacar targets del tail (posiciones >=4 que quedarán fijas)
for (let i = n - 1; i >= 4; i--) {
  let j = i;
  if (TARGETS.includes(arr[i])) {
    // swap con un no-target en posición < i (cualquiera; las 0..3 se reescriben luego)
    j = arr.findIndex((v, k) => k <= i && !TARGETS.includes(v));
    if (j === -1 || j === i) j = i;
  }
  seq.push(jToR(i, j));
  [arr[i], arr[j]] = [arr[j], arr[i]];
}
// Fase 2: i=3..0 — colocar el target deseado en la posición i
for (let i = 3; i >= 0; i--) {
  const want = TARGETS[i];
  const p = arr.indexOf(want);
  if (p > i) throw new Error(`target ${want} congelado en tail (pos ${p})`);
  seq.push(jToR(i, p));
  [arr[i], arr[p]] = [arr[p], arr[i]];
}
console.log("resultado [0..3]:", arr.slice(0, 4));

// Verificación: simular pickWaveCitizens con la secuencia
const test = eligible.map((c) => c.id);
let k = 0;
for (let i = test.length - 1; i > 0; i--) {
  const j = Math.floor(seq[k++] * (i + 1));
  [test[i], test[j]] = [test[j], test[i]];
}
console.log("verificado:", JSON.stringify(test.slice(0, 4)));
import { writeFileSync } from "node:fs";
writeFileSync("out/random-seq.json", JSON.stringify(seq));
console.log("seq guardada:", seq.length, "valores");
