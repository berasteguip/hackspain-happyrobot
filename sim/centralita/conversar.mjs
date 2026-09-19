// Centralita Vigía (CLI): una conversación A↔V y la guarda en out/.
// Uso: node conversar.mjs   (lee ../../.env)

import { appendFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { HERE, loadEnv, createHappyRobotClient, runConversation } from "./conversation.mjs";

const OUT = join(HERE, "out");
mkdirSync(OUT, { recursive: true });

const env = loadEnv();
for (const k of ["HR_API_KEY", "HR_WF_VIGIA_CHAT", "HR_WF_VECINO_SIMULADO"]) {
  if (!env[k]) {
    console.error(`Falta ${k} en .env`);
    process.exit(1);
  }
}

const DATA_A = {
  person_id: "p-001",
  house_id: "h-001",
  phone: "+34600990001",
  first_name: "Antonio",
  village: "Guisando",
  address: "Calle Real 12",
  priority: "0.82",
  assigned_shelter: "PE-01 La Dehesa",
  vulnerable_flag: "no",
  known_context: "núcleo de 2 según censo",
};
const DATA_V = {
  person_id: "p-001",
  name: "Antonio Prieto",
  age: "71",
  village: "Guisando",
  address: "Calle Real 12",
  household: "mi mujer Carmen (68) y yo",
  mobility: "car",
  has_car: "true",
  seats_free: "2",
  has_smartphone: "true",
  personality: "cooperative",
  neighbors_known: "Rosa, la de al lado, vive sola",
  vulnerable_note: "ninguna",
  is_away: "false",
  true_location: "Calle Real 12, Guisando",
  has_animals: "dos perros",
};

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const jsonlPath = join(OUT, `${stamp}-p-001.jsonl`);
const txtPath = join(OUT, `${stamp}-p-001.txt`);
const txtLines = [];

const onMessage = (speaker, text, rec) => {
  appendFileSync(jsonlPath, JSON.stringify(rec) + "\n");
  const label = speaker === "A" ? "VIGÍA" : speaker === "V" ? "VECINO" : speaker;
  txtLines.push(`[${rec.ts}] ${label}: ${text}`);
  console.log(`\n=== ${label} ===\n${text}`);
};
const onEvent = (kind, detail) => {
  appendFileSync(jsonlPath, JSON.stringify({ ts: new Date().toISOString(), event: kind, ...detail }) + "\n");
};

const client = createHappyRobotClient(env);
try {
  const { endReason, messages } = await runConversation(client, DATA_A, DATA_V, { env, onMessage, onEvent });
  txtLines.push(`\n--- fin: ${endReason} ---`);
  writeFileSync(txtPath, txtLines.join("\n\n") + "\n");
  console.log(`\nFin: ${endReason}. Mensajes: ${messages.length}.`);
  console.log(`JSONL: ${jsonlPath}`);
  console.log(`TXT:   ${txtPath}`);
} catch (err) {
  console.error("Error fatal:", err);
  onEvent("fatal", { error: String(err?.message ?? err) });
  txtLines.push(`\n--- error: ${err?.message ?? err} ---`);
  writeFileSync(txtPath, txtLines.join("\n\n") + "\n");
  process.exit(1);
}
