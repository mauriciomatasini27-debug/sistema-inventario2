export const ARCHIVOS_GENERADOS = [
  "docs/ESTADO.md",
  "docs/ROADMAP.md",
  "docs/INDEX.md",
  "docs/graph.json",
  "docs/roadmap/migraciones-aplicadas.md",
];

export function normalizarRuta(ruta) {
  return String(ruta ?? "").replace(/\\/g, "/").replace(/^\.\//, "").trim();
}

export function generadosEn(archivos) {
  const set = new Set((archivos ?? []).map(normalizarRuta));
  return ARCHIVOS_GENERADOS.filter((f) => set.has(f));
}

export function evaluarGuard({ archivos, principal }) {
  if (principal) return { ok: true, motivo: "", archivos: [] };
  const tocados = generadosEn(archivos);
  if (tocados.length === 0) return { ok: true, motivo: "", archivos: [] };
  const motivo = [
    `la rama commitea archivos generados: ${tocados.join(", ")}.`,
    "No se commitean en la rama: los regenera main con npm run docs:estado / docs:index / roadmap, así el PR no choca con otro que ya se mergeó.",
    `Quitalos del commit con: git checkout $(git merge-base origin/main HEAD) -- ${tocados.join(" ")}`,
  ].join("\n");
  return { ok: false, motivo, archivos: tocados };
}
