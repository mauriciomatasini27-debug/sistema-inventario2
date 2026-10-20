export const PASOS_CI = ["typecheck", "arch", "test", "skips", "build"];
export const PASOS_DOCS = ["docs:generados", "numeros", "roadmap", "docs:estado", "docs:index", "docs:check"];

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
  "docs:generados": { node: "scripts/docs-generados.mjs" },
  numeros: { node: "scripts/check-numeros.mjs" },
  "docs:estado": { node: "scripts/docs-estado.mjs" },
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
