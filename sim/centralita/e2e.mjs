// E2E: abre el mapa, pulsa "Simular llamadas" y captura el estado.
import { chromium } from "playwright";

const CHROMIUM = process.env.HOME + "/Library/Caches/ms-playwright/chromium-1194/chrome-mac/Chromium.app/Contents/MacOS/Chromium";
const browser = await chromium.launch({ executablePath: CHROMIUM });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on("console", (m) => { if (m.type() === "error") console.log("[console.error]", m.text().slice(0, 300)); });
page.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 300)));

await page.goto("http://127.0.0.1:5173/", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2500);

// TokenGate: si pide token, inyectar uno falso y recargar.
const needsToken = await page.evaluate(() => document.body.innerText.toLowerCase().includes("token") || !!document.querySelector("input[type=password], input[placeholder*='token' i]"));
if (needsToken) {
  console.log("TokenGate detectado → inyectando pk.test");
  await page.evaluate(() => localStorage.setItem("vigia.mapboxToken", "pk.test"));
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);
}
await page.screenshot({ path: "out/e2e-initial.png" });
console.log("body text (head):", (await page.evaluate(() => document.body.innerText.slice(0, 400))).replace(/\n+/g, " | "));

const play = page.getByRole("button", { name: /iniciar simulación|simular/i }).first();
console.log("play visible:", await play.isVisible().catch(() => false));
await play.click();
await page.waitForTimeout(2500);
const res = await fetch("http://127.0.0.1:8787/wave/status").then((r) => r.json());
console.log("wave/status:", JSON.stringify(res.calls.map((c) => ({ id: c.person_id, state: c.state }))));
// indicador HR en la lista: abrir panel Personas
await page.getByRole("button", { name: /grupos/i }).first().click().catch(() => {});
await page.waitForTimeout(800);
const hrCount = await page.evaluate(() => [...document.querySelectorAll(".people small")].filter((el) => el.textContent === "HR").length);
console.log("indicadores HR visibles:", hrCount);
await page.screenshot({ path: "out/e2e-after-play.png" });
await browser.close();
