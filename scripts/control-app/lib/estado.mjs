import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const RAIZ = resolve(fileURLToPath(new URL("../../../", import.meta.url)));

export function homeControlApp(env = process.env) {
  return resolve(env.CONTROL_APP_HOME || join(RAIZ, ".pstack-tmp", "control-app"));
}

export function rutaEstado(env = process.env) {
  return join(homeControlApp(env), "estado.json");
}

export function hoyAR(ahora = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(ahora);
}

export function carpetaEvidencia(env = process.env, ahora = new Date()) {
  return resolve(env.CONTROL_APP_EVIDENCIA || join(RAIZ, ".agents", "skills", "control-app", "artifacts", hoyAR(ahora)));
}

export const ESTADO_INICIAL = {
  version: 1,
  levantado: false,
  propia: false,
  pid: null,
  puerto: 4321,
  baseUrl: "http://localhost:4321",
  pgIniciada: false,
  rol: null,
  sesion: null,
  url: null,
  titulo: null,
  errores: [],
  capturas: [],
  iniciadoEn: null,
};

export function leerEstado(env = process.env) {
  try {
    const crudo = JSON.parse(readFileSync(rutaEstado(env), "utf8"));
    return { ...ESTADO_INICIAL, ...crudo, errores: Array.isArray(crudo.errores) ? crudo.errores : [] };
  } catch (e) {
    if (e.code !== "ENOENT") {
      throw new Error(`El estado de control-app está ilegible (${e.code ?? e.name}). Movelo de ${rutaEstado(env)} y volvé a empezar.`);
    }
    return { ...ESTADO_INICIAL };
  }
}

export function guardarEstado(estado, env = process.env) {
  const ruta = rutaEstado(env);
  mkdirSync(homeControlApp(env), { recursive: true });
  const temporal = `${ruta}.${process.pid}.tmp`;
  writeFileSync(temporal, `${JSON.stringify(estado, null, 2)}\n`);
  renameSync(temporal, ruta);
}

export function agregarErrores(estado, nuevos, env = process.env) {
  const lista = [...(estado.errores ?? []), ...(nuevos ?? [])].slice(-200);
  const siguiente = { ...estado, errores: lista };
  guardarEstado(siguiente, env);
  return siguiente;
}

export function asegurarCarpeta(ruta) {
  mkdirSync(ruta, { recursive: true });
  return ruta;
}
