// E2E parte 2b: fuerza la selección de la ola a los 4 ids YA conversados
// (parcheando el módulo servido por Vite, NO el puente): el puente los ignora
// por estar 'done' (0 conversaciones nuevas) y el mapa recupera las
// transcripciones reales con GET /wave/status.
import { chromium } from "playwright";

const IDS = (process.env.IDS || "c-116,c-143,c-128,c-203").split(",");
const CHROMIUM = process.env.HOME + "/Library/Caches/ms-playwright/chromium-1194/chrome-mac/Chromium.app/Contents/MacOS/Chromium";
const browser = await chromium.launch({ executablePath: CHROMIUM });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 300)));
page.on("console", (m) => { if (m.type() === "error") console.log("[console.error]", m.text().slice(0, 200)); });

// Solo instrumenta la selección; todo lo demás (puente incluido) es real.
await page.route("**/src/bridge.ts*", async (route) => {
  const res = await route.fetch();
  let body = await res.text();
  body = body.replace(
    /export function pickWaveCitizens\(citizens, count = 4\) \{[\s\S]*?\n\}/,
    `export function pickWaveCitizens(citizens, count = 4) { const ids = ${JSON.stringify(IDS)}; return citizens.filter((c) => ids.includes(c.id)); }`,
  );
  await route.fulfill({ response: res, body });
});

await page.goto("http://127.0.0.1:5173/", { waitUntil: "domcontentloaded" });
await page.evaluate(() => localStorage.setItem("vigia.mapboxToken", "pk.test"));
await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForTimeout(3000);

await page.getByRole("button", { name: /iniciar simulación|simular/i }).first().click();
await page.waitForTimeout(3000);
const res = await fetch("http://127.0.0.1:8787/wave/status").then((r) => r.json());
console.log("wave/status:", JSON.stringify(res.calls.map((c) => ({ id: c.person_id, state: c.state, turns: c.transcript.length }))));

// El poll del mapa (cada 2 s) aplica transcripts; esperar y comprobar.
await page.waitForTimeout(6000);

await page.getByRole("button", { name: /grupos/i }).first().click();
await page.waitForTimeout(600);
for (const id of IDS) {
  const search = page.locator("input.search");
  await search.fill(id);
  await page.waitForTimeout(400);
  await page.locator(".people li button").first().click();
  await page.waitForTimeout(700);
  await page.screenshot({ path: `out/e2e-${id}.png`, fullPage: false });
  const state = await page.evaluate(() => {
    const el = document.querySelector(".person-detail");
    return el ? el.innerText.slice(0, 1400) : "sin ficha";
  });
  console.log(`\n===== ${id} =====\n${state}`);
  await page.locator("button.back-button").click().catch(() => {});
  await page.waitForTimeout(300);
}

await page.waitForTimeout(60000);
const dock = await page.evaluate(() => document.querySelector(".simulation-dock")?.innerText ?? "");
console.log("\nDOCK:", dock.replace(/\n+/g, " | "));
for (const id of IDS) {
  const search = page.locator("input.search");
  if (!(await page.locator(".people").isVisible().catch(() => false))) {
    await page.getByRole("button", { name: /grupos|todas las personas/i }).first().click().catch(() => {});
    await page.waitForTimeout(400);
  }
  await search.fill(id).catch(() => {});
  await page.waitForTimeout(400);
  const row = await page.evaluate(() => document.querySelector(".people li")?.innerText.replace(/\n+/g, " | ") ?? "");
  console.log(`fila ${id}: ${row}`);
}
await page.screenshot({ path: "out/e2e-final.png" });
await browser.close();
