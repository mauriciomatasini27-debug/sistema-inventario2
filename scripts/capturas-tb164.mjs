#!/usr/bin/env node
/**
 * TB-164: capturas reales a 390px para el PR. Requiere Postgres local y Astro en :4321.
 * Uso: node scripts/capturas-tb164.mjs
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, request as playwrightRequest } from "playwright";

const BASE = (process.env.CAPTURA_BASE_URL ?? "http://127.0.0.1:4321").replace(/\/$/, "");
const OUT = process.env.CAPTURA_DIR ?? "/opt/cursor/artifacts";
const VIEWPORT = { width: 390, height: 844 };

async function contextoConSesion(browser, role) {
  const req = await playwrightRequest.newContext({ baseURL: BASE });
  const r = await req.post("/api/dev/control-app", {
    data: { accion: "login", rol: role },
  });
  if (!r.ok()) throw new Error(`login ${role} HTTP ${r.status()}`);
  const storage = await req.storageState();
  await req.dispose();
  return browser.newContext({ viewport: VIEWPORT, storageState: storage });
}

async function shot(page, name) {
  const path = join(OUT, name);
  await page.screenshot({ path, fullPage: false });
  return path;
}

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const ctxComercio = await contextoConSesion(browser, "duenio");
const page = await ctxComercio.newPage();

await page.goto(`${BASE}/venta`, { waitUntil: "networkidle", timeout: 60_000 });
await page.evaluate(() => document.dispatchEvent(new CustomEvent("reportes-comercio:abrir")));
await page.waitForSelector("#rep-dialogo:not([hidden])", { timeout: 15_000 });
const form = await shot(page, "tb164-formulario-390.png");

await page.fill("#rep-texto", "En Vender, al confirmar no veo si quedó cobrado.");
await page.click(".rep-enviar");
await page.waitForSelector('[data-rep-panel="recibido"]:not([hidden])', { timeout: 15_000 }).catch(async () => {
  const err = await page.locator("[data-rep-error]:not([hidden])").textContent().catch(() => "");
  throw new Error(`No llegó a Recibido: ${err}`);
});
const recibido = await shot(page, "tb164-recibido-390.png");

await page.click('[data-rep-ver-lista]');
await page.waitForSelector('[data-rep-panel="lista"]:not([hidden])', { timeout: 10_000 });
await page.waitForSelector(".rep-item", { timeout: 10_000 });
const lista = await shot(page, "tb164-mis-envios-390.png");

const ctxAdmin = await contextoConSesion(browser, "duenio");
const admin = await ctxAdmin.newPage();
await admin.goto(`${BASE}/admin#reportes-comercio`, { waitUntil: "networkidle", timeout: 60_000 });
await admin.waitForSelector("#rep-admin-lista li", { timeout: 15_000 });
const bandeja = await shot(admin, "tb164-bandeja-admin-390.png");

writeFileSync(
  join(OUT, "tb164-capturas.json"),
  `${JSON.stringify({ form, recibido, lista, bandeja, viewport: VIEWPORT }, null, 2)}\n`,
);

await browser.close();
console.log(JSON.stringify({ ok: true, form, recibido, lista, bandeja }, null, 2));
