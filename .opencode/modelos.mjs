#!/usr/bin/env node
// Elige el modelo free de OpenCode para cada skill/agente según
// .opencode/modelos-por-skill.json y cae al siguiente si el asignado no está.
// Uso:
//   node .opencode/modelos.mjs elegir <skill|agente|perfil>   -> un modelo
//   node .opencode/modelos.mjs lista <skill|agente|perfil>    -> modelos disponibles en orden
//   node .opencode/modelos.mjs overrides                      -> JSON para OPENCODE_CONFIG_CONTENT
//   node .opencode/modelos.mjs caido <modelo> [motivo]        -> lo marca caído por el TTL
//   node .opencode/modelos.mjs revivir <modelo>               -> le borra la marca de caído
// Sin dependencias: solo node:*. Funciona en Ubuntu/WSL con Node 22.
import { execFileSync } from "node:child_process";
import { accessSync, appendFileSync, constants, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = dirname(fileURLToPath(import.meta.url));

export function cargarConfig(ruta = join(AQUI, "modelos-por-skill.json")) {
  return JSON.parse(readFileSync(ruta, "utf8"));
}

export function perfilDe(config, nombre) {
  const limpio = String(nombre ?? "").replace(/^\//, "");
  if (config.perfiles[limpio]) return limpio;
  if (config.agentes[limpio]) return config.agentes[limpio];
  if (config.skills[limpio]) return config.skills[limpio];
  return config.perfilPorDefecto;
}

// Pura: decide con la lista de modelos existentes y los caídos vigentes.
export function resolver(config, nombre, { existentes, caidos = {}, ahora = Date.now() }) {
  const perfil = perfilDe(config, nombre);
  const orden = config.perfiles[perfil];
  const vivo = (m) => (!existentes || existentes.has(m)) && !((caidos[m]?.hasta ?? 0) > ahora);
  const disponibles = orden.filter(vivo);
  const hasta = disponibles.length ? orden.indexOf(disponibles[0]) : orden.length;
  const descartados = orden.slice(0, hasta);
  return { perfil, asignado: orden[0], elegido: disponibles[0] ?? null, disponibles, descartados };
}

export function overrides(config, estado) {
  const agent = {};
  const avisos = [];
  for (const nombre of Object.keys(config.agentes)) {
    const r = resolver(config, nombre, estado);
    if (r.elegido) agent[nombre] = { model: r.elegido };
    if (r.elegido !== r.asignado) avisos.push({ nombre, ...r });
  }
  return { config: { agent }, avisos };
}

const ttlMs = (config) => Number(process.env.PSTACK_MODELOS_TTL_MIN ?? config.ttlMinutos ?? 10) * 60_000;
const rutaCache = () =>
  process.env.PSTACK_MODELOS_CACHE ??
  join(process.env.XDG_CACHE_HOME || join(homedir(), ".cache"), "pstack-modelos", "estado.json");
const rutaLog = () => process.env.PSTACK_MODELOS_LOG ?? join(AQUI, "modelos-caidos.log");

function leerCache() {
  try {
    const cache = JSON.parse(readFileSync(rutaCache(), "utf8"));
    return { ...cache, caidos: cache?.caidos ?? {} };
  } catch (e) {
    if (e.code !== "ENOENT") process.stderr.write(`pstack-modelos: cache ilegible (${e.code ?? e.name}), arranco vacía\n`);
    return { caidos: {} };
  }
}
function guardarCache(c) {
  const ruta = rutaCache();
  const temporal = `${ruta}.${process.pid}.tmp`;
  try {
    mkdirSync(dirname(ruta), { recursive: true });
    writeFileSync(temporal, JSON.stringify(c, null, 2));
    renameSync(temporal, ruta);
  } catch (e) {
    process.stderr.write(`pstack-modelos: no pude guardar la cache (${e.code}); sigo sin cache\n`);
  }
}

// El binario puede estar en ~/.opencode/bin (instalador oficial), ~/.local/bin
// (instalaciones viejas) o en cualquier directorio del PATH. Si no aparece, no
// es un modelo caído: se avisa y se sigue sin filtrar.
export function buscarBin(entorno = process.env) {
  if (entorno.OPENCODE_BIN) return entorno.OPENCODE_BIN;
  const candidatos = [];
  for (const dir of (entorno.PATH ?? "").split(delimiter)) {
    if (dir) candidatos.push(join(dir, "opencode"));
  }
  candidatos.push(
    join(entorno.HOME || homedir(), ".opencode", "bin", "opencode"),
    join(entorno.HOME || homedir(), ".local", "bin", "opencode"),
    "/usr/local/bin/opencode",
    "/usr/bin/opencode",
  );
  for (const c of candidatos) {
    try {
      accessSync(c, constants.X_OK);
      return c;
    } catch (e) {
      if (e.code !== "ENOENT" && e.code !== "EACCES") throw e;
    }
  }
  return null;
}

// `opencode models` no gasta tokens: detecta modelos que salieron de Zen.
function existentes(config, cache) {
  const mock = process.env.PSTACK_MODELOS_DISPONIBLES;
  if (mock !== undefined) return new Set(mock.split(/[\s,]+/).filter(Boolean));
  const ahora = Date.now();
  if (cache.lista && ahora - cache.lista.en < ttlMs(config)) return new Set(cache.lista.modelos);
  const bin = buscarBin();
  if (!bin) {
    process.stderr.write(
      "pstack-modelos: no encontré el binario de opencode (miré OPENCODE_BIN, PATH y ~/.opencode/bin); sigo sin filtrar y no marco modelos caídos\n",
    );
    return null;
  }
  let salida;
  try {
    salida = execFileSync(bin, ["models", "opencode"], { encoding: "utf8", timeout: 20_000, stdio: ["ignore", "pipe", "ignore"] });
  } catch (e) {
    process.stderr.write(`pstack-modelos: no pude listar modelos (${e.code ?? e.status}); sigo sin filtrar\n`);
    return null;
  }
  const modelos = salida.split("\n").map((l) => l.trim()).filter((l) => l.startsWith("opencode/"));
  cache.lista = { en: ahora, modelos };
  guardarCache(cache);
  return new Set(modelos);
}

function avisar(nombre, r) {
  const motivo = r.descartados.map((m) => m).join(",") || r.asignado;
  const linea = `${new Date().toLocaleString("sv-SE")}\t${nombre}\tperfil=${r.perfil}\tcaido=${motivo}\tusa=${r.elegido ?? "NINGUNO"}`;
  process.stderr.write(`\u26a0 pstack-modelos: ${r.asignado} no disponible para ${nombre} (${r.perfil}); uso ${r.elegido ?? "NINGUNO"}. Log: ${rutaLog()}\n`);
  appendFileSync(rutaLog(), linea + "\n");
}

function main([cmd, arg, ...resto]) {
  const config = cargarConfig(process.env.PSTACK_MODELOS_CONFIG);
  const cache = leerCache();
  if (cmd === "caido") {
    if (!arg) throw new Error("uso: caido <modelo> [motivo]");
    cache.caidos[arg] = { hasta: Date.now() + ttlMs(config), motivo: resto.join(" ") || "fallo de sesión" };
    guardarCache(cache);
    appendFileSync(rutaLog(), `${new Date().toLocaleString("sv-SE")}\tsesion\tcaido=${arg}\tmotivo=${cache.caidos[arg].motivo}\n`);
    process.stderr.write(`\u26a0 pstack-modelos: marqué ${arg} caído por ${ttlMs(config) / 60_000} min\n`);
    return;
  }
  if (cmd === "revivir") {
    if (!arg) throw new Error("uso: revivir <modelo>");
    delete cache.caidos[arg];
    guardarCache(cache);
    appendFileSync(rutaLog(), `${new Date().toLocaleString("sv-SE")}\tmanual\trevivir=${arg}\n`);
    process.stderr.write(`\u2714 pstack-modelos: ${arg} vuelve a estar disponible\n`);
    return;
  }
  const estado = { existentes: existentes(config, cache), caidos: cache.caidos };
  if (cmd === "overrides") {
    const { config: o, avisos } = overrides(config, estado);
    for (const a of avisos) avisar(a.nombre, a);
    process.stdout.write(JSON.stringify(o) + "\n");
    return;
  }
  if (cmd === "elegir" || cmd === "lista") {
    const r = resolver(config, arg, estado);
    if (r.elegido !== r.asignado) avisar(arg ?? "(default)", r);
    if (!r.elegido) process.exit(3);
    process.stdout.write((cmd === "elegir" ? r.elegido : r.disponibles.join(" ")) + "\n");
    return;
  }
  process.stderr.write("uso: modelos.mjs elegir|lista <skill|agente|perfil> | overrides | caido <modelo> [motivo] | revivir <modelo>\n");
  process.exit(2);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main(process.argv.slice(2));
