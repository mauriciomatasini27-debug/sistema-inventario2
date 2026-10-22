import { RAIZ } from "./estado.mjs";
import { correr } from "./procesos.mjs";

const PUERTO_PG = process.env.PG_LOCAL_PORT || "54329";
const SCRIPT = `${RAIZ}/scripts/pg-local.sh`;

export function estadoBase(correrFn = correr) {
  const r = correrFn("pg_isready", ["-h", "127.0.0.1", "-p", PUERTO_PG], { timeout: 5_000 });
  if (r.error?.code === "ENOENT") return { herramienta: "pg_isready", disponible: false, corriendo: null, puerto: Number(PUERTO_PG) };
  return {
    herramienta: "pg_isready",
    disponible: r.status === 0,
    corriendo: r.status === 0,
    puerto: Number(PUERTO_PG),
  };
}

export function levantarBase(correrFn = correr) {
  const antes = estadoBase(correrFn);
  if (antes.corriendo === true) return { ok: true, propia: false, ...antes, accion: "ya_estaba" };
  const r = correrFn("bash", [SCRIPT, "start"], { cwd: RAIZ, timeout: 180_000 });
  if (r.status !== 0) {
    return {
      ok: false,
      propia: false,
      ...estadoBase(correrFn),
      error: "No pude levantar Postgres local.",
      detalle: (r.stderr || r.stdout).trim().slice(0, 800),
      hint: "Instalá Postgres y reintentá, o corré `CONTROL_APP_SIN_BASE=1 control-app levantar` para verificar solo la UI.",
    };
  }
  return { ok: true, ...estadoBase(correrFn), propia: true, accion: "iniciada" };
}

export function pararBase() {
  const r = correr("bash", [SCRIPT, "stop"], { cwd: RAIZ, timeout: 60_000 });
  if (r.status !== 0) {
    return { ok: false, error: "No pude apagar Postgres local.", detalle: (r.stderr || r.stdout).trim().slice(0, 800) };
  }
  return { ok: true, ...estadoBase(), accion: "detenida" };
}
