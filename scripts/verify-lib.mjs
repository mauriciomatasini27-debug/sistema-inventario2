export const PASOS_CI = ["typecheck", "arch", "test", "skips", "build"];
// DOCS-GATE-CHECK: los --check van antes de los writers para que el gate
// falle nombrando el comando en vez de regenerar callado.
export const PASOS_DOCS = ["docs:generados", "docs:estado-check", "docs:index-check", "docs:migraciones-check", "roadmap-check", "docs:migraciones", "roadmap", "docs:estado", "docs:index", "docs:check"];

const DEFS = {
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

export function resumir(resultados) {
  const items = Array.isArray(resultados) ? resultados : [];
  const fallidos = items.filter((r) => r.code !== 0).map((r) => r.nombre);
  return { ok: fallidos.length === 0, fallidos, total: items.length };
}
