import { readFileSync } from "node:fs";

// RETRO-03: el gate de ids de comentarios va primero para fallar temprano.
// RETRO-AUD-01: issues-locales va primero: un avance `hecho` con el issue abierto
// se detecta antes de gastar el resto del verify.
export const PASOS_CI = ["comentarios", "issues-locales", "typecheck", "arch", "columnas", "test", "skips", "build"];
// DOCS-GATE-CHECK: los --check van antes de los writers para que el gate
// falle nombrando el comando en vez de regenerar callado.
export const PASOS_DOCS = ["docs:generados", "docs:comentarios-check", "docs:estado-check", "docs:index-check", "docs:migraciones-check", "roadmap-check", "docs:migraciones", "roadmap", "docs:estado", "docs:index", "docs:check"];

// RETRO-04: sin tope, Vitest levanta ~nproc workers (12 acá) y la suite con PG A/B
// flakea: 401s de auth y hooks de crearBase que timeout. El box ya exportaba 4.
const MAX_WORKERS_VERIFY = 4;

/** @param {NodeJS.ProcessEnv} env */
export function maxWorkersVerify(env = process.env) {
  const crudo = env.VITEST_MAX_WORKERS;
  if (!crudo) return MAX_WORKERS_VERIFY;
  // Vitest también parsea el env con parseInt: espejamos su contrato.
  const workers = Number.parseInt(crudo, 10);
  return Number.isInteger(workers) && workers > 0 ? workers : MAX_WORKERS_VERIFY;
}

const DEFS = {
  comentarios: { node: "scripts/check-comment-ids.mjs" },
  "issues-locales": { node: "scripts/verificar-issues-locales.mjs" },
  typecheck: { script: "typecheck" },
  arch: { script: "check:arch" },
  columnas: { script: "check:columnas" },
  test: {
    script: "test",
    extra: ["--", "--reporter=default", "--reporter=json", "--outputFile=vitest-report.json"],
  },
  skips: { node: "scripts/check-skips.mjs", extra: ["vitest-report.json"] },
  build: { script: "build" },
  roadmap: { node: "scripts/roadmap.mjs" },
  "docs:migraciones": { node: "scripts/docs-migraciones.mjs" },
  "docs:generados": { node: "scripts/docs-generados.mjs" },
  "docs:comentarios-check": { node: "scripts/docs-comentarios.mjs", extra: ["--check"] },
  "docs:estado": { node: "scripts/docs-estado.mjs" },
  "docs:estado-check": { node: "scripts/docs-estado.mjs", extra: ["--check"] },
  "docs:index-check": { node: "scripts/docs-index.mjs", extra: ["--check"] },
  "docs:migraciones-check": { node: "scripts/docs-migraciones.mjs", extra: ["--check"] },
  "roadmap-check": { node: "scripts/roadmap.mjs", extra: ["--check"] },
  "docs:index": { node: "scripts/docs-index.mjs" },
  "docs:check": { node: "scripts/docs-check.mjs" },
};

export function planDePasos({ docsOnly = false } = {}) {
  const nombres = docsOnly ? [...PASOS_DOCS] : [...PASOS_CI, ...PASOS_DOCS];
  return nombres.map((nombre) => ({ nombre, ...DEFS[nombre] }));
}

// Un paso con prerequisito roto se salta; los independientes siguen corriendo
// para que una sola pasada informe todos los fallos del gate.
export const ESCRITORES_DOCS = ["docs:migraciones", "roadmap", "docs:estado", "docs:index"];
const CHECKS_DOCS = [
  "docs:generados",
  "docs:comentarios-check",
  "docs:estado-check",
  "docs:index-check",
  "docs:migraciones-check",
  "roadmap-check",
];

export function dependenciasIncumplidas(paso, resultados = []) {
  const items = Array.isArray(resultados) ? resultados : [];
  const fallidos = items.filter((r) => !r.skipped && r.code !== 0).map((r) => r.nombre);
  if (paso.nombre === "skips") return fallidos.filter((n) => n === "test");
  // Si un check falló, el writer correspondiente no debe regenerar callado.
  if (ESCRITORES_DOCS.includes(paso.nombre)) {
    return fallidos.filter((n) => CHECKS_DOCS.includes(n));
  }
  return [];
}

export function resumir(resultados) {
  const items = Array.isArray(resultados) ? resultados : [];
  const fallidos = items.filter((r) => !r.skipped && r.code !== 0).map((r) => r.nombre);
  const saltados = items.filter((r) => r.skipped).map((r) => r.nombre);
  const motivos = Object.fromEntries(
    items.filter((r) => r.skipped).map((r) => [r.nombre, r.motivo ?? "dependencia incumplida"]),
  );
  return { ok: fallidos.length === 0, fallidos, saltados, motivos, total: items.length };
}

export const REPORTE_VITEST = "vitest-report.json";

/** Comando concreto para extraer los tests fallidos del reporte JSON de Vitest. */
export function comandoTestsFallidos(reporte = REPORTE_VITEST) {
  return `node -e 'const r=JSON.parse(require("node:fs").readFileSync(${JSON.stringify(reporte)},"utf8")); for (const s of r.testResults??[]) for (const t of s.assertionResults??[]) if (t.status==="failed") console.log(t.fullName)'`;
}

export function nombresTestsFallidos(reporte = REPORTE_VITEST) {
  try {
    const r = JSON.parse(readFileSync(reporte, "utf8"));
    /** @type {string[]} */
    const nombres = [];
    for (const s of r.testResults ?? []) {
      for (const t of s.assertionResults ?? []) {
        if (t.status === "failed") nombres.push(t.fullName ?? t.title ?? "(sin nombre)");
      }
    }
    return nombres;
  } catch {
    return [];
  }
}

/** Para fallos de hook/setup que no dejan asserts fallidos, nombra el archivo de la suite. */
export function nombresSuitesFallidas(reporte = REPORTE_VITEST) {
  try {
    const r = JSON.parse(readFileSync(reporte, "utf8"));
    return (r.testResults ?? []).filter((s) => s.status === "failed").map((s) => s.name);
  } catch {
    return [];
  }
}

/**
 * Resume el resultado separando pasos fallidos de pasos omitidos por dependencia.
 * El recibo solo se menciona si efectivamente se escribió (rutaRecibo no nulo).
 * @param {{ ok: boolean, fallidos: string[], saltados?: string[], motivos?: Record<string, string>, total: number }} resumen
 * @param {{ rutaRecibo?: string | null, reporte?: string }} opciones
 */
export function textoResumen(resumen, { rutaRecibo = null, reporte = REPORTE_VITEST } = {}) {
  if (resumen.ok) return `verify ok (${resumen.total} pasos)`;
  const lineas = [`verify falló en: ${resumen.fallidos.join(", ")}`];
  if (resumen.fallidos.includes("test")) {
    const nombres = nombresTestsFallidos(reporte);
    if (nombres.length) {
      lineas.push(`verify: tests fallidos (según ${reporte}):`);
      for (const n of nombres) lineas.push(`  - ${n}`);
    } else {
      const suites = nombresSuitesFallidas(reporte);
      if (suites.length) {
        lineas.push(`verify: suites fallidas (según ${reporte}):`);
        for (const s of suites) lineas.push(`  - ${s}`);
      } else {
        lineas.push(`verify: no se pudieron leer los nombres de tests fallidos de ${reporte}; extraelos con:`);
      }
    }
    lineas.push(`  ${comandoTestsFallidos(reporte)}`);
  }
  for (const nombre of resumen.saltados ?? []) {
    const motivo = resumen.motivos?.[nombre] ?? "dependencia incumplida";
    const aclaracion = nombre === "skips" ? "; no es un hallazgo del gate de skips" : "";
    lineas.push(`verify omitió ${nombre} (${motivo}${aclaracion})`);
  }
  if (rutaRecibo) lineas.push(`verify: detalle en el recibo ${rutaRecibo}`);
  return lineas.join("\n");
}
