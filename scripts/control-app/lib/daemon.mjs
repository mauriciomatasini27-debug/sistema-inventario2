#!/usr/bin/env node
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { join } from "node:path";
import { chromium, devices } from "@playwright/test";
import { capturarPagina, enganchar, infoPagina, irA } from "./navegador.mjs";

function valor(nombre, defecto = "") {
  const i = process.argv.indexOf(nombre);
  return i >= 0 ? (process.argv[i + 1] ?? defecto) : defecto;
}

const home = valor("--home");
if (!home) {
  process.stderr.write("daemon control-app: falta --home\n");
  process.exit(2);
}
mkdirSync(home, { recursive: true });
const baseUrl = valor("--base-url", "http://localhost:4321");
const storageState = valor("--storage-state", "");
const rutaDatos = join(home, "daemon.json");
const rutaLog = join(home, "daemon.log");

let browser;
let page;
let contexto;
const errores = [];
let ultima = { url: null, titulo: null };

function cerrarSync() {
  try {
    rmSync(rutaDatos, { force: true });
  } catch {
    process.stderr.write("daemon control-app: no pude borrar daemon.json\n");
  }
}

async function cerrar() {
  cerrarSync();
  await contexto?.close().catch(() => {});
  await browser?.close().catch(() => {});
  process.exit(0);
}

function info(extra = {}) {
  return { ...ultima, ...extra, errores: errores.length, detalle_errores: errores.slice(-100) };
}

async function accion(cuerpo) {
  const nombre = cuerpo.accion;
  if (nombre === "ir") {
    if (!cuerpo.ruta) throw new Error("falta ruta");
    const status = await irA(page, cuerpo.ruta);
    ultima = await infoPagina(page, status);
    return { accion: "ir", ...ultima, ...info() };
  }
  if (nombre === "info") {
    ultima = await infoPagina(page);
    return { accion: "info", ...ultima, ...info() };
  }
  if (nombre === "clic") {
    const locator = page.locator(cuerpo.selector).first();
    await locator.waitFor({ state: "visible", timeout: 10_000 });
    await locator.click({ timeout: 10_000 });
    await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => {});
    await page.waitForTimeout(500);
    ultima = await infoPagina(page);
    return { accion: "clic", selector: cuerpo.selector, ...ultima, ...info() };
  }
  if (nombre === "escribir") {
    const locator = page.locator(cuerpo.selector).first();
    await locator.waitFor({ state: "visible", timeout: 10_000 });
    await locator.fill(String(cuerpo.texto ?? ""), { timeout: 10_000 });
    ultima = await infoPagina(page);
    return { accion: "escribir", selector: cuerpo.selector, texto: cuerpo.texto, ...ultima, ...info() };
  }
  if (nombre === "captura") {
    const datos = await capturarPagina(page, { nombre: cuerpo.nombre, dir: cuerpo.dir, errores });
    ultima = { url: datos.url, titulo: datos.titulo };
    return { ...datos, ...info() };
  }
  if (nombre === "errores") {
    return { accion: "errores", total: errores.length, errores: [...errores] };
  }
  if (nombre === "limpiar-errores") {
    const total = errores.length;
    errores.length = 0;
    return { accion: "limpiar-errores", limpiados: total, total: 0, errores: [] };
  }
  throw new Error(`acción desconocida: ${nombre}`);
}

function leerCuerpo(req) {
  return new Promise((ok, mal) => {
    let datos = "";
    req.on("data", (parte) => {
      datos += parte;
      if (datos.length > 1_000_000) mal(new Error("cuerpo demasiado grande"));
    });
    req.on("end", () => {
      try {
        ok(datos ? JSON.parse(datos) : {});
      } catch {
        mal(new Error("json inválido"));
      }
    });
    req.on("error", mal);
  });
}

const servidor = createServer(async (req, res) => {
  res.setHeader("content-type", "application/json");
  if (req.method === "GET" && req.url === "/salud") {
    res.end(JSON.stringify({ ok: true, url: page?.url() ?? null, errores: errores.length }));
    return;
  }
  if (req.method === "GET" && req.url === "/errores") {
    res.end(JSON.stringify({ ok: true, total: errores.length, errores }));
    return;
  }
  if (req.method === "POST" && req.url === "/accion") {
    try {
      const cuerpo = await leerCuerpo(req);
      const datos = await accion(cuerpo);
      res.end(JSON.stringify({ ok: true, ...datos }));
    } catch (e) {
      res.statusCode = 400;
      res.end(
        JSON.stringify({
          ok: false,
          error: e instanceof Error ? e.message.split("\n")[0] : String(e),
          hint: "Verificá el selector con `control-app captura --nombre antes` y usá CSS o text=...",
          url: page?.url() ?? null,
        }),
      );
    }
    return;
  }
  if (req.method === "POST" && req.url === "/cerrar") {
    res.end(JSON.stringify({ ok: true }));
    setTimeout(() => void cerrar(), 50);
    return;
  }
  res.statusCode = 404;
  res.end(JSON.stringify({ ok: false, error: "ruta desconocida" }));
});

browser = await chromium.launch();
contexto = await browser.newContext({
  ...devices["Pixel 5"],
  baseURL: baseUrl,
  ...(storageState ? { storageState } : {}),
});
page = await contexto.newPage();
enganchar(page, errores);

servidor.listen(0, "127.0.0.1", () => {
  const puerto = servidor.address().port;
  writeFileSync(
    rutaDatos,
    `${JSON.stringify({ pid: process.pid, puerto, baseUrl, iniciadoEn: new Date().toISOString(), log: rutaLog }, null, 2)}\n`,
  );
});

for (const senal of ["SIGTERM", "SIGINT"]) {
  process.on(senal, () => void cerrar());
}
