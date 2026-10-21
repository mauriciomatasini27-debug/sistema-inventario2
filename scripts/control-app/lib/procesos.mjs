import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

export function correr(comando, args = [], opciones = {}) {
  const r = spawnSync(comando, args, {
    cwd: opciones.cwd,
    env: opciones.env ?? process.env,
    encoding: "utf8",
    timeout: opciones.timeout ?? 60_000,
    stdio: ["ignore", "pipe", "pipe"],
  });
  return { status: r.status ?? 1, stdout: r.stdout ?? "", stderr: r.stderr ?? "", error: r.error ?? null };
}

export function pidVivo(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === "EPERM";
  }
}

export function cmdline(pid) {
  try {
    return readFileSync(`/proc/${pid}/cmdline`, "utf8").replace(/\0/g, " ").trim();
  } catch {
    return "";
  }
}

export function esperar(ms) {
  return new Promise((ok) => setTimeout(ok, ms));
}

export async function esperarHttp(url, { timeoutMs = 60_000, intervaloMs = 500 } = {}) {
  const hasta = Date.now() + timeoutMs;
  let ultimo = "";
  while (Date.now() < hasta) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(4_000) });
      if (r.ok) return { ok: true, status: r.status, texto: await r.text() };
      ultimo = `HTTP ${r.status}`;
    } catch (e) {
      ultimo = e instanceof Error ? e.message : String(e);
    }
    await esperar(intervaloMs);
  }
  return { ok: false, error: ultimo };
}
