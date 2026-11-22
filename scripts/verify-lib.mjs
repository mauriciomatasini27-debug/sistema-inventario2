// RETRO-03: el gate de ids de comentarios va primero para fallar temprano.
// RETRO-AUD-01: issues-locales va primero: un avance `hecho` con el issue abierto
// se detecta antes de gastar el resto del verify.
import { readFileSync } from "node:fs";

export const REPORTE_VITEST = "vitest-report.json";

export const PASOS_CI = ["comentarios", "issues-locales", "typecheck", "arch", "test", "skips", "build"];
// DOCS-GATE-CHECK: los --check van antes de los writers para que el gate
// falle nombrando el comando en vez de regenerar callado.
export const PASOS_DOCS = ["docs:generados", "docs:comentarios-check", "docs:estado-check", "docs:index-check", "docs:migraciones-check", "roadmap-check", "docs:migraciones", "roadmap", "docs:estado", "docs:index", "docs:check"];

const DEFS = {
  comentarios: { node: "scripts/check-comment-ids.mjs" },
  "issues-locales": { node: "scripts/verificar-issues-locales.mjs" },
  typecheck: { script: "typecheck" },
  arch: { script: "check:arch" },
  test: {
    script: "test",
    extra: ["--", "--reporter=default", "--reporter=json", `--outputFile=${REPORTE_VITEST}`],
  },
  skips: { node: "scripts/check-skips.mjs", extra: [REPORTE_VITEST] },
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
  const motivos = Object.fromEntries(items.filter((r) => r.skipped).map((r) => [r.nombre, r.motivo ?? ""]));
  return { ok: fallidos.length === 0, fallidos, saltados, motivos, total: items.length };
}

/** Nombres de los asserts fallidos del reporte JSON de Vitest (issue #420). */
export function nombresTestsFallidos(reporte = REPORTE_VITEST) {
  try {
    const datos = JSON.parse(readFileSync(reporte, "utf8"));
    const suites = datos.testResults ?? [];
    const asserts = suites
      .flatMap((f) => f.assertionResults ?? [])
      .filter((a) => a.status === "failed")
      .map((a) => a.fullName || a.title || "")
      .filter(Boolean);
    if (asserts.length) return asserts;
    // Un error de import/sintaxis deja la suite fallida sin asserts: mostrar ese mensaje.
    return suites
      .filter((f) => f.status === "failed")
      .map((f) => {
        const nombre = f.name ?? "suite";
        const msg = String(f.message ?? "").split("\n")[0].trim();
        return msg ? `${nombre}: ${msg}` : nombre;
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

export function comandoTestsFallidos(reporte = REPORTE_VITEST) {
  const ruta = reporte.startsWith("/") ? reporte : `./${reporte}`;
  const expr = [
    `const r=require('${ruta}');`,
    "const a=r.testResults.flatMap(f=>f.assertionResults||[]).filter(x=>x.status==='failed').map(x=>x.fullName||x.title);",
    "const s=a.length?a:r.testResults.filter(f=>f.status==='failed').map(f=>f.name+(f.message?': '+String(f.message).split('\\n')[0]:''));",
    "console.log(s.join('\\n'))",
  ].join("");
  return `node -e "${expr}"`;
}

/** Contrato de stdout de verify: razón inline, tests fallidos y recibo condicional. */
export function lineasResumen(resumen, opciones = {}) {
  const { rutaRecibo = "", nombres = [], rutaReporte = REPORTE_VITEST } = opciones;
  const { ok, fallidos = [], saltados = [], motivos = {}, total = 0 } = resumen;
  const lineas = [];

  if (saltados.length > 0) {
    const detalle = saltados
      .map((nombre) => `${nombre}${motivos[nombre] ? ` (${motivos[nombre]})` : ""}`)
      .join(", ");
    lineas.push(`verify: pasos omitidos: ${detalle}`);
  }
  if (saltados.length > 0 && rutaRecibo) {
    lineas.push(`verify: motivo de pasos omitidos también en ${rutaRecibo}`);
  }
  if (!ok) {
    if (nombres.length > 0) {
      lineas.push(`verify: tests fallidos (${rutaReporte}):`);
      for (const nombre of nombres.slice(0, 10)) lineas.push(`  - ${nombre}`);
      if (nombres.length > 10) lineas.push(`  ... y ${nombres.length - 10} más`);
    }
    if (fallidos.includes("test")) {
      if (nombres.length === 0) {
        lineas.push(`verify: sin nombres en ${rutaReporte}; mirá la salida del paso test`);
      }
      lineas.push(`verify: detalle: ${comandoTestsFallidos(rutaReporte)}`);
    }
  }
  lineas.push(ok ? `verify ok (${total} pasos)` : `verify falló en: ${fallidos.join(", ")}`);
  return lineas;
}
