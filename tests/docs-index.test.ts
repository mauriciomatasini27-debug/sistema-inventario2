import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { colectarDocs, generarContenidos } from "../scripts/docs-index-lib.mjs";

const AQUI = dirname(fileURLToPath(import.meta.url));
const CLI = join(AQUI, "..", "scripts", "docs-index.mjs");

function fm(sobre: Record<string, string> = {}): string {
  return [
    "---",
    `id: ${sobre.id ?? "X-1"}`,
    `tipo: ${sobre.tipo ?? "adr"}`,
    `estado: ${sobre.estado ?? "propuesto"}`,
    `modulos: ${sobre.modulos ?? "[]"}`,
    `depende_de: ${sobre.depende_de ?? "[]"}`,
    `reemplaza: ${sobre.reemplaza ?? "[]"}`,
    `reemplazado_por: ${sobre.reemplazado_por ?? '""'}`,
    `modifica: ${sobre.modifica ?? "[]"}`,
    `modificado_por: ${sobre.modificado_por ?? "[]"}`,
    `resumen: ${sobre.resumen ?? '""'}`,
    "---",
    "",
  ].join("\n");
}

function mkRaiz(archivos: Record<string, string>): string {
  const raiz = mkdtempSync(join(tmpdir(), "docs-index-"));
  for (const [rel, texto] of Object.entries(archivos)) {
    const abs = join(raiz, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, texto);
  }
  return raiz;
}

function raizBase(): string {
  return mkRaiz({
    "a.md": [
      "---",
      "id: ADR-0001",
      "tipo: adr",
      "estado: aceptado",
      "modulos: [caja, inventario]",
      "depende_de: [ADR-0002]",
      "reemplaza: []",
      'reemplazado_por: ""',
      "resumen: |",
      "  Primera línea.",
      "  Segunda línea.",
      "---",
      "",
      "# ADR-0001",
      "",
    ].join("\n"),
    "b.md": `${fm({ id: "ADR-0002", tipo: "adr", estado: "propuesto" })}\n# ADR-0002\n`,
    "p.md": `${fm({ id: "PRD-X-01", tipo: "prd", estado: "propuesto", modulos: "[caja]", depende_de: "[ADR-0001, ADR-9999]" })}\n# PRD\n`,
    "sub/y.md": `${fm({ id: "PRD-Y-01", tipo: "prd", estado: "aceptado" })}\n# PRD-Y\n`,
    "plan.md": `${fm({ id: "PLAN-X-01", tipo: "plan", estado: "reemplazado", reemplaza: "[ADR-0001]", reemplazado_por: "ADR-0002" })}\n# Plan\n`,
    "plan-ok.md": `${fm({ id: "PLAN-X-02", tipo: "plan", estado: "propuesto" })}\n# Plan vigente\n`,
    "viejo.md": `${fm({ id: "SPEC-1", tipo: "spec", estado: "deprecado" })}\n# Spec\n`,
    "nuevo.md": `${fm({ id: "SPEC-2", tipo: "spec", estado: "propuesto", modulos: "[offline]" })}\n# Spec nuevo\n`,
    "hist.md": `${fm({ id: "HIST-1", tipo: "historico", estado: "deprecado" })}\n# Hist\n`,
    "hist-ok.md": `${fm({ id: "HIST-2", tipo: "historico", estado: "propuesto" })}\n# Hist vigente\n`,
    "sin-fm.md": "# Sin frontmatter\n\nTexto suelto.\n",
    "_plantilla.md": `${fm({ id: "SKIP-1", tipo: "adr" })}\n# Plantilla\n`,
    "INDEX.md": "# Viejo\n",
    "graph.json": "{}",
    "_origen-docx/viejo.md": `${fm({ id: "SKIP-2", tipo: "adr" })}\n# Origen\n`,
  });
}

describe("docs:index colecta", () => {
  it("agrupa por tipo y omite plantillas, INDEX.md, graph.json y _origen-docx", () => {
    const { docs, sinFm } = colectarDocs(raizBase());
    expect(docs.map((d) => d.id).sort()).toEqual([
      "ADR-0001",
      "ADR-0002",
      "HIST-1",
      "HIST-2",
      "PLAN-X-01",
      "PLAN-X-02",
      "PRD-X-01",
      "PRD-Y-01",
      "SPEC-1",
      "SPEC-2",
    ]);
    expect(sinFm).toEqual(["sin-fm.md"]);
  });
});

describe("docs:index INDEX.md", () => {
  it("declara que es generado y que no se edita a mano", () => {
    const { index } = generarContenidos(raizBase());
    expect(index).toContain("npm run docs:index");
    expect(index.toLowerCase()).toContain("no editar");
  });

  it("agrupa en secciones ADR, PRD, Plan, Spec e Histórico en ese orden", () => {
    const { index } = generarContenidos(raizBase());
    const secciones = ["## ADR", "## PRD", "## Plan", "## Spec", "## Histórico"];
    const pos = secciones.map((s) => index.indexOf(s));
    expect(pos.every((p) => p >= 0)).toBe(true);
    expect([...pos].sort((a, b) => a - b)).toEqual(pos);
  });

  it("escribe una línea compacta con id, estado, módulos y primera línea del resumen", () => {
    const { index } = generarContenidos(raizBase());
    expect(index).toContain("- [ADR-0001](a.md) · aceptado · caja, inventario · Primera línea.");
    expect(index).not.toContain("Segunda línea.");
    expect(index).toContain("- [ADR-0002](b.md) · propuesto · -");
  });

  it("mueve reemplazados y deprecados a la sección final con flecha al sucesor", () => {
    const { index } = generarContenidos(raizBase());
    const iPlan = index.indexOf("## Plan");
    const iFinal = index.indexOf("## Reemplazados / deprecados");
    expect(iFinal).toBeGreaterThan(-1);
    expect(index.indexOf("PLAN-X-01")).toBeGreaterThan(iFinal);
    expect(index.indexOf("SPEC-1")).toBeGreaterThan(iFinal);
    expect(index.indexOf("HIST-1")).toBeGreaterThan(iFinal);
    const lineaPlan = index.split("\n").find((l) => l.includes("PLAN-X-01")) ?? "";
    expect(lineaPlan).toContain("→ ADR-0002");
    const planSeccion = index.slice(iPlan, iFinal);
    expect(planSeccion).not.toContain("PLAN-X-01");
  });

  it("lista sin frontmatter al final solo con la ruta", () => {
    const { index } = generarContenidos(raizBase());
    const iSin = index.indexOf("## Sin frontmatter");
    expect(iSin).toBeGreaterThan(-1);
    expect(index.slice(iSin)).toContain("- sin-fm.md");
  });

  it("usa item como id cuando el frontmatter no trae id", () => {
    const raiz = mkRaiz({
      "av.md": `${fm({})}\n# Av\n`.replace("id: X-1\n", "item: P1-6\n"),
    });
    const { docs } = colectarDocs(raiz);
    expect(docs.map((d) => d.id)).toEqual(["P1-6"]);
  });

  it("es determinista entre dos corridas", () => {
    const raiz = raizBase();
    const una = generarContenidos(raiz);
    const otra = generarContenidos(raiz);
    expect(otra.index).toBe(una.index);
    expect(otra.grafo).toBe(una.grafo);
  });
});

describe("docs:index graph.json", () => {
  it("emite nodos ordenados y aristas solo a ids existentes", () => {
    const { grafo } = generarContenidos(raizBase());
    const g = JSON.parse(grafo) as {
      nodos: { id: string; ruta: string; tipo: string; estado: string; modulos: string[] }[];
      aristas: { de: string; a: string; tipo: string }[];
      faltantes: { de: string; a: string }[];
    };
    expect(g.nodos.map((n) => n.id)).toEqual([
      "ADR-0001",
      "ADR-0002",
      "HIST-1",
      "HIST-2",
      "PLAN-X-01",
      "PLAN-X-02",
      "PRD-X-01",
      "PRD-Y-01",
      "SPEC-1",
      "SPEC-2",
    ]);
    expect(g.nodos[0]).toMatchObject({
      id: "ADR-0001",
      tipo: "adr",
      estado: "aceptado",
      modulos: ["caja", "inventario"],
    });
    expect(g.nodos[0]?.ruta.endsWith("a.md")).toBe(true);
    expect(g.aristas).toEqual([
      { de: "ADR-0001", a: "ADR-0002", tipo: "depende_de" },
      { de: "PLAN-X-01", a: "ADR-0001", tipo: "reemplaza" },
      { de: "PLAN-X-01", a: "ADR-0002", tipo: "reemplazado_por" },
      { de: "PRD-X-01", a: "ADR-0001", tipo: "depende_de" },
    ]);
    expect(g.faltantes).toEqual([{ de: "PRD-X-01", a: "ADR-9999" }]);
  });

  it("emite aristas modifica y modificado_por solo a ids existentes", () => {
    const raiz = mkRaiz({
      "old.md": `${fm({ id: "ADR-0066", modificado_por: "[ADR-0080]" })}\n# Viejo\n`,
      "new.md": `${fm({ id: "ADR-0080", modifica: "[ADR-0066, ADR-9999]" })}\n# Nuevo\n`,
    });
    const { grafo } = generarContenidos(raiz);
    const g = JSON.parse(grafo) as {
      aristas: { de: string; a: string; tipo: string }[];
      faltantes: { de: string; a: string }[];
    };
    expect(g.aristas).toContainEqual({ de: "ADR-0080", a: "ADR-0066", tipo: "modifica" });
    expect(g.aristas).toContainEqual({ de: "ADR-0066", a: "ADR-0080", tipo: "modificado_por" });
    expect(g.faltantes).toContainEqual({ de: "ADR-0080", a: "ADR-9999" });
  });

  it("la línea INDEX anuncia modificado por con todos los ids", () => {
    const raiz = mkRaiz({
      "old.md": `${fm({ id: "ADR-0066", modificado_por: "[ADR-0080, ADR-0081]" })}\n# Viejo\n`,
      "new.md": `${fm({ id: "ADR-0080", modifica: "[ADR-0066]" })}\n# Nuevo\n`,
      "new2.md": `${fm({ id: "ADR-0081", modifica: "[ADR-0066]" })}\n# Nuevo 2\n`,
    });
    const { index } = generarContenidos(raiz);
    const linea = index.split("\n").find((l) => l.includes("ADR-0066")) ?? "";
    expect(linea).toContain("· modificado por ADR-0080, ADR-0081");
    const limpia = index.split("\n").find((l) => l.startsWith("- [ADR-0080]")) ?? "";
    expect(limpia).not.toContain("modificado por");
  });
});

describe("docs:index roadmap", () => {
  it("excluye docs/roadmap de docs, INDEX y grafo", () => {
    const raiz = mkRaiz({
      "a.md": `${fm({ id: "ADR-0001" })}\n# A\n`,
      "roadmap/avances/P1-6.md": `${fm({ id: "P1-6", estado: "hecho" })}\n# Av\n`,
    });
    const { docs, sinFm } = colectarDocs(raiz);
    expect(docs.map((d) => d.id)).toEqual(["ADR-0001"]);
    expect(sinFm).toEqual([]);
    const { index, grafo } = generarContenidos(raiz);
    expect(index).not.toContain("P1-6");
    const g = JSON.parse(grafo) as { nodos: { id: string }[] };
    expect(g.nodos.map((n) => n.id)).toEqual(["ADR-0001"]);
  });
});

describe("docs:index CLI --raiz/--check", () => {
  it("--check sale 0 cuando está fresco y 1 con archivos rancios", () => {
    const raiz = raizBase();
    execFileSync(process.execPath, [CLI, "--raiz", raiz], { stdio: "pipe" });
    const fresco = (() => {
      try {
        execFileSync(process.execPath, [CLI, "--raiz", raiz, "--check"], { stdio: "pipe" });
        return 0;
      } catch (e) {
        return (e as { status?: number }).status ?? 99;
      }
    })();
    expect(fresco).toBe(0);
    writeFileSync(join(raiz, "b.md"), readFileSync(join(raiz, "b.md"), "utf8").replace("estado: propuesto", "estado: aceptado"));
    let estado = 0;
    let salida = "";
    try {
      execFileSync(process.execPath, [CLI, "--raiz", raiz, "--check"], { stdio: "pipe" });
    } catch (e) {
      estado = (e as { status?: number }).status ?? 99;
      const err = e as { stdout?: Buffer; stderr?: Buffer };
      salida = String(err.stdout ?? "") + String(err.stderr ?? "");
    }
    expect(estado).toBe(1);
    expect(salida).toMatch(/INDEX\.md|graph\.json/);
  });
});
