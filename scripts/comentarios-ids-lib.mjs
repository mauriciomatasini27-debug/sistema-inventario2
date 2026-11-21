// P10-25: catálogo de ids de ítem para check-comment-ids.
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ID_EN_TEXTO = /\b([A-Z][A-Z0-9]*(?:-[A-Za-z0-9]+)+)\b/g;

export function cargarIdsConocidos(raiz = process.cwd()) {
  const ids = new Set();

  const avancesDir = join(raiz, "docs", "roadmap", "avances");
  try {
    for (const nombre of readdirSync(avancesDir)) {
      if (!nombre.endsWith(".md") || nombre === "README.md") continue;
      const texto = readFileSync(join(avancesDir, nombre), "utf8");
      const m = /^---\n[\s\S]*?\nitem:\s*(.+)\n/m.exec(texto);
      if (m) ids.add(m[1].trim());
      const base = nombre.replace(/\.md$/, "");
      if (base) ids.add(base);
    }
  } catch {
    /* sin avances */
  }

  try {
    const graph = JSON.parse(readFileSync(join(raiz, "docs", "graph.json"), "utf8"));
    const nodos = graph?.nodos ?? graph?.nodes ?? [];
    for (const n of nodos) {
      if (n?.id) ids.add(String(n.id));
    }
  } catch {
    /* sin graph */
  }

  try {
    const roadmap = readFileSync(join(raiz, "docs", "ROADMAP.md"), "utf8");
    for (const m of roadmap.matchAll(ID_EN_TEXTO)) ids.add(m[1]);
  } catch {
    /* sin roadmap */
  }

  return ids;
}

export function sugerirIdDeRama(raiz = process.cwd(), base) {
  if (!base) return "";
  try {
    const diff = execFileSync("git", ["diff", "--name-only", "--diff-filter=A", `${base}...HEAD`], {
      encoding: "utf8",
      cwd: raiz,
    });
    const nuevo = diff
      .split("\n")
      .find((f) => f.startsWith("docs/roadmap/avances/") && f.endsWith(".md"));
    if (!nuevo) return "";
    const texto = readFileSync(join(raiz, nuevo), "utf8");
    const m = /^---\n[\s\S]*?\nitem:\s*(.+)\n/m.exec(texto);
    return m ? m[1].trim() : nuevo.replace(/^docs\/roadmap\/avances\//, "").replace(/\.md$/, "");
  } catch {
    return "";
  }
}

export function extraerIdsDeTexto(texto) {
  const found = [];
  if (!texto) return found;
  const re = new RegExp(ID_EN_TEXTO.source, "g");
  let m;
  while ((m = re.exec(texto)) !== null) found.push(m[1]);
  return found;
}