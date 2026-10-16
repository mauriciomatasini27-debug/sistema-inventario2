import { readFileSync } from "node:fs";
import { join } from "node:path";
import { listarDocs, parseFrontmatter } from "./docs-lib.mjs";

const ORDEN_TIPOS = ["adr", "prd", "plan", "spec", "historico"];
const TITULOS = { adr: "ADR", prd: "PRD", plan: "Plan", spec: "Spec", historico: "Histórico" };
const GENERADOS = new Set(["INDEX.md", "graph.json"]);

function comoArreglo(v) {
  if (Array.isArray(v)) return v.map((x) => String(x ?? "").trim()).filter((x) => x !== "");
  const t = String(v ?? "").trim();
  return t === "" ? [] : [t];
}

function comoTexto(v) {
  if (Array.isArray(v)) return String(v[0] ?? "").trim();
  return String(v ?? "").trim();
}

function primeraLinea(s) {
  for (const l of String(s ?? "").split("\n")) {
    const t = l.trim();
    if (t !== "") return t;
  }
  return "";
}

function esReemplazado(estado) {
  return estado === "reemplazado" || estado === "deprecado";
}

function omitir(rel) {
  const partes = String(rel).split("/");
  if (partes.includes("roadmap")) return true;
  if (partes.some((p) => p.startsWith("_") || p === "_origen-docx")) return true;
  const base = partes[partes.length - 1] ?? "";
  return GENERADOS.has(base);
}

export function leerDoc(rel, texto) {
  const parsed = parseFrontmatter(texto);
  if (!parsed.tiene) return null;
  const d = parsed.datos ?? {};
  const id = comoTexto(d.id) || comoTexto(d.item) || rel;
  return {
    id,
    rel,
    ruta: rel,
    tipo: comoTexto(d.tipo).toLowerCase() || "spec",
    estado: comoTexto(d.estado).toLowerCase() || "propuesto",
    modulos: comoArreglo(d.modulos),
    depende_de: comoArreglo(d.depende_de),
    reemplaza: comoArreglo(d.reemplaza),
    reemplazado_por: comoTexto(d.reemplazado_por),
    resumen: primeraLinea(comoTexto(d.resumen)),
  };
}

export function colectarDocs(raiz = "docs") {
  const base = String(raiz ?? "docs").replace(/\\/g, "/").replace(/\/+$/, "") || "docs";
  const docs = [];
  const sinFm = [];
  for (const rel of listarDocs(base).filter((r) => !omitir(r))) {
    const texto = readFileSync(join(base, rel), "utf8");
    const doc = leerDoc(rel.replace(/\\/g, "/"), texto);
    if (doc === null) sinFm.push(rel);
    else docs.push({ ...doc, ruta: `${base}/${doc.rel}` });
  }
  docs.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : a.rel < b.rel ? -1 : 1));
  sinFm.sort();
  return { docs, sinFm };
}

function lineaDoc(doc) {
  const mods = doc.modulos.length > 0 ? doc.modulos.join(", ") : "-";
  const flecha = doc.reemplazado_por !== "" ? ` → ${doc.reemplazado_por}` : "";
  const resumen = primeraLinea(doc.resumen);
  const cola = resumen === "" ? "" : ` · ${resumen}`;
  return `- [${doc.id}](${doc.rel}) · ${doc.estado}${flecha} · ${mods}${cola}`;
}

export function renderIndice(docs, sinFm) {
  const activos = docs.filter((d) => !esReemplazado(d.estado));
  const viejos = docs.filter((d) => esReemplazado(d.estado));
  const out = ["# Índice de documentación", "", "Generado por `npm run docs:index`. No editar a mano.", ""];
  for (const tipo of ORDEN_TIPOS) {
    const grupo = activos.filter((d) => d.tipo === tipo);
    if (grupo.length === 0) continue;
    out.push(`## ${TITULOS[tipo]}`, "");
    for (const d of grupo) out.push(lineaDoc(d));
    out.push("");
  }
  const otros = activos.filter((d) => !ORDEN_TIPOS.includes(d.tipo));
  if (otros.length > 0) {
    out.push("## Otros", "");
    for (const d of otros) out.push(lineaDoc(d));
    out.push("");
  }
  if (viejos.length > 0) {
    out.push("## Reemplazados / deprecados", "");
    for (const d of viejos) out.push(lineaDoc(d));
    out.push("");
  }
  if ((sinFm ?? []).length > 0) {
    out.push("## Sin frontmatter", "");
    for (const r of sinFm) out.push(`- ${r}`);
    out.push("");
  }
  return out.join("\n");
}

export function renderGrafo(docs) {
  const ids = new Set(docs.map((d) => d.id));
  const nodos = docs.map((d) => ({ id: d.id, ruta: d.ruta, tipo: d.tipo, estado: d.estado, modulos: d.modulos }));
  const aristas = [];
  const faltantes = [];
  const enlazar = (de, a, tipo) => {
    if (ids.has(a)) aristas.push({ de, a, tipo });
    else faltantes.push({ de, a });
  };
  for (const d of docs) {
    for (const a of d.depende_de) enlazar(d.id, a, "depende_de");
    for (const a of d.reemplaza) enlazar(d.id, a, "reemplaza");
    if (d.reemplazado_por !== "") enlazar(d.id, d.reemplazado_por, "reemplazado_por");
  }
  const porDeA = (x, y) => (x.de < y.de ? -1 : x.de > y.de ? 1 : x.a < y.a ? -1 : x.a > y.a ? 1 : 0);
  aristas.sort((x, y) => porDeA(x, y) || (x.tipo < y.tipo ? -1 : 1));
  faltantes.sort(porDeA);
  return `${JSON.stringify({ nodos, aristas, faltantes }, null, 2)}\n`;
}

export function generarContenidos(raiz = "docs") {
  const { docs, sinFm } = colectarDocs(raiz);
  return { index: renderIndice(docs, sinFm), grafo: renderGrafo(docs) };
}
