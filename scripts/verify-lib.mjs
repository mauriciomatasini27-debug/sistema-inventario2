// RETRO-03: el gate de ids de comentarios va primero para fallar temprano.
export const PASOS_CI = ["comentarios", "typecheck", "arch", "test", "skips", "build"];
// DOCS-GATE-CHECK: los --check van antes de los writers para que el gate
// falle nombrando el comando en vez de regenerar callado.
export const PASOS_DOCS = ["docs:generados", "docs:comentarios-check", "docs:estado-check", "docs:index-check", "docs:migraciones-check", "roadmap-check", "docs:migraciones", "roadmap", "docs:estado", "docs:index", "docs:check"];

const DEFS = {
  comentarios: { node: "scripts/check-comment-ids.mjs" },
  typecheck: { script: "typecheck" },
  arch: { script: "check:arch" },
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
  return { ok: fallidos.length === 0, fallidos, saltados, total: items.length };
}
