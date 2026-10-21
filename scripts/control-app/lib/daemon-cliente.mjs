import { spawn } from "node:child_process";
import { existsSync, openSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { ErrorControlApp } from "./cli.mjs";
import { homeControlApp } from "./estado.mjs";
import { pidVivo, esperar } from "./procesos.mjs";

const DAEMON = fileURLToPath(new URL("./daemon.mjs", import.meta.url));

export function rutaDaemon(env = process.env) {
  return join(homeControlApp(env), "daemon.json");
}

function leerDatos() {
  try {
    return JSON.parse(readFileSync(rutaDaemon(), "utf8"));
  } catch {
    return null;
  }
}

async function salud(daemon) {
  if (!daemon?.puerto || !pidVivo(daemon.pid)) return false;
  try {
    const r = await fetch(`http://127.0.0.1:${daemon.puerto}/salud`, { signal: AbortSignal.timeout(2_000) });
    return r.ok;
  } catch {
    return false;
  }
}

export async function estadoDaemon() {
  const daemon = leerDatos();
  if (!daemon) return { vivo: false };
  if (await salud(daemon)) return { vivo: true, ...daemon };
  try {
    rmSync(rutaDaemon(), { force: true });
  } catch {
    process.stderr.write("control-app: no pude borrar daemon.json viejo\n");
  }
  return { vivo: false };
}

export async function asegurarDaemon({ baseUrl, storageState }) {
  const actual = await estadoDaemon();
  if (actual.vivo) return actual;
  const home = homeControlApp();
  const log = join(home, "daemon.log");
  const fd = openSync(log, "a");
  const args = [DAEMON, "--home", home, "--base-url", baseUrl];
  if (storageState) args.push("--storage-state", storageState);
  const hijo = spawn(process.execPath, args, {
    cwd: home,
    detached: true,
    stdio: ["ignore", fd, fd],
  });
  hijo.unref();
  for (let i = 0; i < 80; i += 1) {
    await esperar(250);
    const daemon = leerDatos();
    if (daemon && (await salud(daemon))) return { vivo: true, ...daemon };
    if (!pidVivo(hijo.pid)) break;
  }
  throw new ErrorControlApp(
    "No pude iniciar el navegador de control-app.",
    "Mirá `.pstack-tmp/control-app/daemon.log` y verificá que Chromium esté instalado con `npx playwright install chromium`.",
    { log },
  );
}

export async function pedirAccion(cuerpo) {
  const daemon = leerDatos();
  if (!daemon || !(await salud(daemon))) {
    throw new ErrorControlApp("No hay navegador activo.", "Corré `control-app ir <ruta>` para abrirlo.");
  }
  let r;
  try {
    r = await fetch(`http://127.0.0.1:${daemon.puerto}/accion`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(cuerpo),
      signal: AbortSignal.timeout(45_000),
    });
  } catch (e) {
    throw new ErrorControlApp(
      "El navegador dejó de responder.",
      "Corré `control-app ir <ruta>` de nuevo.",
      { detalle: e instanceof Error ? e.message : String(e) },
    );
  }
  const datos = await r.json().catch(() => ({}));
  if (!r.ok || datos.ok === false) {
    throw new ErrorControlApp(datos.error || `El navegador respondió HTTP ${r.status}.`, datos.hint || "Volvé a abrir la página con `control-app ir <ruta>`.");
  }
  return datos;
}

export async function detenerDaemon() {
  const daemon = leerDatos();
  if (!daemon) return { ok: true, accion: "no_habia" };
  if (await salud(daemon)) {
    await fetch(`http://127.0.0.1:${daemon.puerto}/cerrar`, { method: "POST", signal: AbortSignal.timeout(2_000) }).catch(() => {});
  }
  for (let i = 0; i < 20; i += 1) {
    if (!pidVivo(daemon.pid)) break;
    await esperar(150);
  }
  if (pidVivo(daemon.pid)) {
    try {
      process.kill(daemon.pid, "SIGTERM");
    } catch (e) {
      process.stderr.write(`control-app: no pude cerrar el navegador (${e.code ?? e.name})\n`);
    }
  }
  if (existsSync(rutaDaemon())) rmSync(rutaDaemon(), { force: true });
  return { ok: true, accion: "cerrado", pid: daemon.pid };
}
