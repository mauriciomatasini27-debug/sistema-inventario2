import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { ErrorControlApp } from "./cli.mjs";
import { asegurarCarpeta } from "./estado.mjs";

export function enganchar(page, errores) {
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    errores.push({ tipo: "consola", mensaje: msg.text(), url: page.url(), cuando: new Date().toISOString() });
  });
  page.on("pageerror", (error) => {
    errores.push({ tipo: "pagina", mensaje: error.message, url: page.url(), cuando: new Date().toISOString() });
  });
  page.on("requestfailed", (request) => {
    errores.push({
      tipo: "request",
      metodo: request.method(),
      url: request.url(),
      mensaje: request.failure()?.errorText ?? "request fallida",
      cuando: new Date().toISOString(),
    });
  });
  page.on("response", (response) => {
    if (response.status() < 400) return;
    errores.push({
      tipo: "http",
      metodo: response.request().method(),
      url: response.url(),
      mensaje: `HTTP ${response.status()}`,
      status: response.status(),
      cuando: new Date().toISOString(),
    });
  });
}

export async function irA(page, ruta) {
  const respuesta = await page.goto(ruta, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => {});
  await page.waitForTimeout(300);
  return respuesta?.status() ?? null;
}

export async function infoPagina(page, status = null) {
  const h1 = await page.locator("h1").first().textContent({ timeout: 2_000 }).catch(() => null);
  const estado = await page.locator("#estado").first().textContent({ timeout: 1_000 }).catch(() => null);
  return {
    url: page.url(),
    titulo: await page.title(),
    h1: h1?.trim() ?? null,
    estado: estado?.trim() ?? null,
    status,
  };
}

function nombreSeguro(nombre) {
  return String(nombre).replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "captura";
}

function marcaDeTiempo(ahora = new Date()) {
  return ahora.toISOString().replace(/[:.]/g, "-").slice(0, 19);
}

export async function capturarPagina(page, { nombre, dir, errores }) {
  const carpeta = asegurarCarpeta(dir);
  const base = nombreSeguro(nombre || `captura-${marcaDeTiempo()}`);
  const rutaPng = join(carpeta, `${base}.png`);
  const rutaJson = join(carpeta, `${base}.json`);
  const info = await infoPagina(page);
  await page.screenshot({ path: rutaPng, fullPage: true });
  const evidencia = {
    accion: "captura",
    ...info,
    archivo: rutaPng,
    json: rutaJson,
    tomada_en: new Date().toISOString(),
    errores: errores.length,
    detalle_errores: errores.slice(0, 50),
  };
  writeFileSync(rutaJson, `${JSON.stringify(evidencia, null, 2)}\n`);
  return evidencia;
}

export async function consultarApi({ baseUrl, storageState, metodo, ruta, cuerpo }) {
  const cookie = storageState?.cookies?.find((c) => c.name === "__Host-sesion")?.value ?? "";
  const headers = { cookie: `__Host-sesion=${cookie}` };
  if (cuerpo !== undefined) headers["content-type"] = "application/json";
  let r;
  try {
    r = await fetch(`${baseUrl}${ruta}`, {
      method: metodo,
      headers,
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
      signal: AbortSignal.timeout(30_000),
    });
  } catch (e) {
    throw new ErrorControlApp(
      `No pude llamar ${metodo} ${ruta}.`,
      "Verificá que la app esté levantada y que la ruta exista.",
      { detalle: e instanceof Error ? e.message : String(e) },
    );
  }
  const texto = await r.text();
  let json = null;
  try {
    json = JSON.parse(texto);
  } catch {
    json = null;
  }
  return { accion: "api", metodo, ruta, status: r.status, ...(json === null ? { texto } : { json }) };
}
