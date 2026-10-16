import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  aplicarFrontmatter,
  extraerResumen,
  inferirFrontmatter,
  listarDocs,
  parseFrontmatter,
  serializeFrontmatter,
} from "../scripts/docs-lib.mjs";

const BASE = {
  id: "ADR-0052",
  tipo: "adr",
  estado: "aceptado",
  modulos: ["caja", "inventario"],
  depende_de: [],
  reemplaza: [],
  reemplazado_por: "",
  resumen: "Resumen factual en una línea.",
};

describe("parseFrontmatter", () => {
  it("sin bloque --- devuelve tiene=false y cuerpo idéntico", () => {
    const texto = "# Título\n\nCuerpo con --- adentro.\n";
    const r = parseFrontmatter(texto);
    expect(r.tiene).toBe(false);
    expect(r.cuerpo).toBe(texto);
  });

  it("sin cierre --- devuelve tiene=false y cuerpo idéntico", () => {
    const texto = "---\nid: X\ncuerpo sin cierre\n";
    const r = parseFrontmatter(texto);
    expect(r.tiene).toBe(false);
    expect(r.cuerpo).toBe(texto);
  });

  it("parsea escalares, listas inline, comillas y bloque | con cuerpo byte-idéntico", () => {
    const cuerpo = "# ADR-0052 - Algo\n\nEstado: aceptado.\n\nTexto --- con guiones.\n";
    const texto =
      "---\n" +
      "id: ADR-0052\n" +
      "tipo: adr\n" +
      "estado: aceptado\n" +
      "modulos: [caja, inventario]\n" +
      "depende_de: []\n" +
      "reemplaza: []\n" +
      'reemplazado_por: ""\n' +
      "resumen: |\n" +
      "  Línea uno.\n" +
      "  Línea dos.\n" +
      "---\n" +
      cuerpo;
    const r = parseFrontmatter(texto);
    expect(r.tiene).toBe(true);
    expect(r.datos.id).toBe("ADR-0052");
    expect(r.datos.modulos).toEqual(["caja", "inventario"]);
    expect(r.datos.depende_de).toEqual([]);
    expect(r.datos.reemplazado_por).toBe("");
    expect(r.datos.resumen).toBe("Línea uno.\nLínea dos.");
    expect(r.cuerpo).toBe(cuerpo);
  });

  it("ignora comentarios # y líneas vacías del bloque", () => {
    const texto = "---\n# tipo: adr|prd\ntipo: prd\n\nid: PRD-XXX-01\n---\nCuerpo\n";
    const r = parseFrontmatter(texto);
    expect(r.tiene).toBe(true);
    expect(r.datos.tipo).toBe("prd");
    expect(r.datos.id).toBe("PRD-XXX-01");
    expect(r.cuerpo).toBe("Cuerpo\n");
  });
});

describe("serializeFrontmatter", () => {
  it("emite orden fijo, listas inline y resumen multilínea como bloque |", () => {
    const out = serializeFrontmatter({
      ...BASE,
      resumen: "Uno.\nDos.",
      depende_de: ["ADR-0001"],
    });
    const lineas = out.split("\n");
    expect(lineas[0]).toBe("---");
    expect(lineas[lineas.length - 2]).toBe("---");
    const claves = lineas
      .slice(1, -2)
      .filter((l) => /^[A-Za-z0-9_-]+:/.test(l))
      .map((l) => l.split(":")[0]);
    expect(claves[0]).toBe("id");
    expect(claves).toEqual([
      "id",
      "tipo",
      "estado",
      "modulos",
      "depende_de",
      "reemplaza",
      "reemplazado_por",
      "resumen",
    ]);
    expect(out).toContain("modulos: [caja, inventario]");
    expect(out).toContain("depende_de: [ADR-0001]");
    expect(out).toContain("resumen: |\n  Uno.\n  Dos.\n");
  });

  it("roundtrip parse(serialize(d)) conserva los datos", () => {
    for (const datos of [
      BASE,
      { ...BASE, resumen: "Uno.\nDos.\nTres.", depende_de: ["ADR-0001", "PRD-PERS-02"] },
      { ...BASE, modulos: [], reemplazado_por: "ADR-0060", estado: "reemplazado" },
    ]) {
      expect(parseFrontmatter(serializeFrontmatter(datos)).datos).toEqual(datos);
    }
  });
});

describe("aplicarFrontmatter", () => {
  it("agrega frontmatter sin tocar el cuerpo", () => {
    const texto = "# ADR-0052 - Algo\n\nEstado: aceptado.\n";
    const nuevo = aplicarFrontmatter(texto, BASE);
    const r = parseFrontmatter(nuevo);
    expect(r.tiene).toBe(true);
    expect(r.datos.id).toBe("ADR-0052");
    expect(r.cuerpo).toBe(texto);
  });

  it("las claves no vacías existentes ganan sobre las inferidas", () => {
    const texto =
      "---\nid: ADR-0052\ntipo: adr\nestado: aceptado\nmodulos: [fiscal]\n" +
      "depende_de: []\nreemplaza: []\nreemplazado_por: \"\"\nresumen: Viejo.\n---\nCuerpo\n";
    const nuevo = aplicarFrontmatter(texto, { ...BASE, estado: "propuesto", modulos: [] });
    const r = parseFrontmatter(nuevo);
    expect(r.datos.estado).toBe("aceptado");
    expect(r.datos.modulos).toEqual(["fiscal"]);
    expect(r.datos.resumen).toBe("Viejo.");
    expect(r.cuerpo).toBe("Cuerpo\n");
  });

  it("es idempotente y preserva --- internos del cuerpo", () => {
    const texto = "# T\n\n---\n\nMás cuerpo.\n";
    const una = aplicarFrontmatter(texto, BASE);
    expect(aplicarFrontmatter(una, BASE)).toBe(una);
    expect(parseFrontmatter(una).cuerpo).toBe(texto);
  });
});

describe("inferirFrontmatter", () => {
  it("ADR por ruta y título con Estado aceptado", () => {
    const d = inferirFrontmatter("docs/adr/0052-memoria.md", "# ADR-0052 - Memoria\n\nEstado: aceptado.\n");
    expect(d.id).toBe("ADR-0052");
    expect(d.tipo).toBe("adr");
    expect(d.estado).toBe("aceptado");
  });

  it("el título confirma el id aunque use dígitos sin ceros", () => {
    const d = inferirFrontmatter("docs/adr/0052-x.md", "# ADR-52 - Título\n\nEstado: propuesto.\n");
    expect(d.id).toBe("ADR-0052");
  });

  it("PRD por ruta, PLAN/EVIDENCIA/SPEC por nombre", () => {
    expect(inferirFrontmatter("docs/diseno/PRD-PERS-02-x.md", "# T\n").id).toBe("PRD-PERS-02");
    expect(inferirFrontmatter("docs/diseno/PRD-PERS-02-x.md", "# T\n").tipo).toBe("prd");
    expect(inferirFrontmatter("docs/diseno/PLAN-COM-01-x.md", "# T\n").tipo).toBe("plan");
    expect(inferirFrontmatter("docs/diseno/PLAN-COM-01-x.md", "# T\n").id).toBe("PLAN-COM-01");
    expect(inferirFrontmatter("docs/diseno/EVIDENCIA-UI-00-x.md", "# T\n").tipo).toBe("spec");
    expect(inferirFrontmatter("docs/diseno/SPEC-Y-01-x.md", "# T\n").tipo).toBe("spec");
  });

  it("historico usa tipo historico y estado deprecado", () => {
    const d = inferirFrontmatter("docs/historico/algo.md", "# Viejo\n");
    expect(d.tipo).toBe("historico");
    expect(d.estado).toBe("deprecado");
  });

  it("archivo usa tipo historico y estado deprecado", () => {
    const d = inferirFrontmatter("docs/archivo/algo.md", "# Viejo\n");
    expect(d.tipo).toBe("historico");
    expect(d.estado).toBe("deprecado");
  });

  it("doc de módulo 0N usa id MOD-0N y tipo spec", () => {
    const d = inferirFrontmatter("docs/01-fundacion/modo-offline.md", "# T\n");
    expect(d.id).toBe("MOD-01-MODO-OFFLINE");
    expect(d.tipo).toBe("spec");
  });

  it("otro doc usa slug en mayúsculas y tipo spec", () => {
    const d = inferirFrontmatter("docs/migracion-supabase.md", "# T\n");
    expect(d.id).toBe("MIGRACION-SUPABASE");
    expect(d.tipo).toBe("spec");
  });

  it("mapea cada variante de Estado incluyedo **Estado:** y reemplazado por", () => {
    const casos: Array<[string, string, string]> = [
      ["Estado: propuesta", "propuesto", ""],
      ["Estado: borrador", "propuesto", ""],
      ["Estado: draft", "propuesto", ""],
      ["**Estado:** aceptada", "aceptado", ""],
      ["estado: implementado", "hecho", ""],
      ["Estado: cerrado", "hecho", ""],
      ["Estado: Reemplazado por ADR-0052", "reemplazado", "ADR-0052"],
      ["Estado: superseded por PRD-PERS-02", "reemplazado", "PRD-PERS-02"],
      ["Estado: obsoleto", "deprecado", ""],
      ["Estado: archivado", "deprecado", ""],
      ["Sin línea de estado", "propuesto", ""],
    ];
    for (const [linea, estado, por] of casos) {
      const d = inferirFrontmatter("docs/adr/0001-x.md", `# T\n\n${linea}\n`);
      expect(d.estado, linea).toBe(estado);
      expect(d.reemplazado_por, linea).toBe(por);
    }
  });

  it("detecta modulos desde rutas src y palabras del nombre", () => {
    const d = inferirFrontmatter(
      "docs/adr/0001-x.md",
      "# T\n\nVer `src/modules/cash/caja.ts` y `src/modules/fiscal/afip.ts`.\n",
    );
    expect(d.modulos).toEqual(["caja", "fiscal"]);
  });

  it("depende_de excluye el propio id, ordena y uniquea", () => {
    const d = inferirFrontmatter(
      "docs/adr/0001-x.md",
      "# ADR-0001 - T\n\nVer ADR-0003, ADR-52, ADR-0003 y ADR-0001.\n",
    );
    expect(d.depende_de).toEqual(["ADR-0003", "ADR-0052"]);
  });

  it("depende_de topa en 10", () => {
    const menciones = Array.from({ length: 12 }, (_, i) => `ADR-${String(i + 2).padStart(4, "0")}`).join(" ");
    const d = inferirFrontmatter("docs/adr/0001-x.md", `# ADR-0001 - T\n\nVer ${menciones}.\n`);
    expect(d.depende_de.length).toBe(10);
    expect([...d.depende_de].sort()).toEqual(d.depende_de);
  });

  it("reemplaza sale de líneas Reemplaza/Supersede y resumen queda vacío", () => {
    const d = inferirFrontmatter("docs/adr/0060-x.md", "# T\n\nReemplaza ADR-0001.\n");
    expect(d.reemplaza).toEqual(["ADR-0001"]);
    expect(d.resumen).toBe("");
    const e = inferirFrontmatter("docs/adr/0060-x.md", "# T\n\nSupersede ADR-0002.\n");
    expect(e.reemplaza).toEqual(["ADR-0002"]);
  });
});

describe("listarDocs", () => {
  it("lista md ordenados y salta _*, _origen-docx y node_modules", () => {
    const raiz = mkdtempSync(join(tmpdir(), "docsfm-"));
    mkdirSync(join(raiz, "sub"), { recursive: true });
    mkdirSync(join(raiz, "_origen-docx"), { recursive: true });
    mkdirSync(join(raiz, "node_modules", "x"), { recursive: true });
    writeFileSync(join(raiz, "b.md"), "# b\n");
    writeFileSync(join(raiz, "a.md"), "# a\n");
    writeFileSync(join(raiz, "_plantilla.md"), "# p\n");
    writeFileSync(join(raiz, "sub", "c.md"), "# c\n");
    writeFileSync(join(raiz, "sub", "_otro.md"), "# o\n");
    writeFileSync(join(raiz, "_origen-docx", "d.md"), "# d\n");
    writeFileSync(join(raiz, "node_modules", "x", "e.md"), "# e\n");
    writeFileSync(join(raiz, "nota.txt"), "txt\n");
    expect(listarDocs(raiz)).toEqual(["a.md", "b.md", "sub/c.md"]);
  });
});

describe("CLI docs-frontmatter", () => {
  const CLI = join("scripts", "docs-frontmatter.mjs");

  function arbol(): { docs: string; adr: string; original: string } {
    const base = mkdtempSync(join(tmpdir(), "docsfm-cli-"));
    const docs = join(base, "docs");
    const adr = join(docs, "adr");
    mkdirSync(adr, { recursive: true });
    const original = "# ADR-0052 - Memoria\n\nEstado: aceptado.\n\nVer `src/modules/cash/caja.ts`.\n";
    writeFileSync(join(adr, "0052-memoria.md"), original);
    return { docs, adr, original };
  }

  it("dry-run imprime ruta/id/tipo/estado/modulos y no escribe nada", () => {
    const { docs, adr, original } = arbol();
    const salida = execFileSync("node", [CLI, "--dry-run", docs], { encoding: "utf8" });
    const lineas = salida.trim().split("\n");
    expect(lineas[0]).toContain("0052-memoria.md");
    expect(lineas[0]).toContain("ADR-0052");
    expect(lineas[0]).toContain("adr");
    expect(lineas[0]).toContain("aceptado");
    expect(lineas[0]).toContain("caja");
    expect(lineas[0]!.split("\t").length).toBe(5);
    expect(salida).toMatch(/1 archivos?/);
    expect(readFileSync(join(adr, "0052-memoria.md"), "utf8")).toBe(original);
  });

  it("--write aplica frontmatter sin tocar el cuerpo y es idempotente", () => {
    const { docs, adr, original } = arbol();
    execFileSync("node", [CLI, "--write", docs], { encoding: "utf8" });
    const una = readFileSync(join(adr, "0052-memoria.md"), "utf8");
    expect(una).not.toBe(original);
    expect(parseFrontmatter(una).cuerpo).toBe(original);
    expect(parseFrontmatter(una).datos.id).toBe("ADR-0052");
    execFileSync("node", [CLI, "--write", docs], { encoding: "utf8" });
    expect(readFileSync(join(adr, "0052-memoria.md"), "utf8")).toBe(una);
  });

  it("--resumen rellena solo vacíos sin tocar cuerpo ni sobrescribir", () => {
    const base = mkdtempSync(join(tmpdir(), "docsfm-res-"));
    const docs = join(base, "docs");
    mkdirSync(docs, { recursive: true });
    const conDecision = "# T\n\n## Decisión\n\nAdoptar monolito modular para kioscos.\n";
    writeFileSync(join(docs, "a.md"), conDecision);
    execFileSync("node", [CLI, "--write", "--resumen", docs], { encoding: "utf8" });
    const una = readFileSync(join(docs, "a.md"), "utf8");
    expect(parseFrontmatter(una).cuerpo).toBe(conDecision);
    expect(String(parseFrontmatter(una).datos.resumen)).toContain("Adoptar monolito");
    execFileSync("node", [CLI, "--write", "--resumen", docs], { encoding: "utf8" });
    expect(readFileSync(join(docs, "a.md"), "utf8")).toBe(una);
    const fija = una.replace(/resumen: .*\n/, "resumen: Fijo a mano.\n");
    writeFileSync(join(docs, "a.md"), fija);
    execFileSync("node", [CLI, "--write", "--resumen", docs], { encoding: "utf8" });
    expect(String(parseFrontmatter(readFileSync(join(docs, "a.md"), "utf8")).datos.resumen)).toContain(
      "Fijo a mano",
    );
  });
});

describe("extraerResumen", () => {
  it("prioriza la sección Decisión sobre el resto", () => {
    const texto = [
      "# ADR-0001 - Algo",
      "",
      "## Contexto",
      "",
      "Este contexto no debe salir en el resumen.",
      "",
      "## Decisión",
      "",
      "Adoptar monolito modular con Postgres por cliente.",
      "",
    ].join("\n");
    expect(extraerResumen(texto)).toBe("Adoptar monolito modular con Postgres por cliente.");
  });

  it("usa Objetivo cuando no hay Decisión", () => {
    const texto = ["# Título", "", "## Objetivo", "", "Reducir quiebres de stock en kioscos."].join("\n");
    expect(extraerResumen(texto)).toBe("Reducir quiebres de stock en kioscos.");
  });

  it("ignora frontmatter y salta Estado, Fecha, Fuentes, tablas, código y AC", () => {
    const texto = [
      "---",
      "id: ADR-0001",
      "tipo: adr",
      "estado: aceptado",
      "modulos: []",
      "depende_de: []",
      "reemplaza: []",
      'reemplazado_por: ""',
      'resumen: ""',
      "---",
      "# ADR-0001 - Algo",
      "",
      "Estado: aceptado. Fecha: 2026-10-10.",
      "Fuentes: doc interno.",
      "",
      "## Decisión",
      "",
      "| Par | Ratio |",
      "|---|---|",
      "| a | 1 |",
      "```",
      "codigo -- raro",
      "```",
      "- Historia X. AC: Given algo When algo Then algo.",
      "Adoptar [monolito](https://ejemplo.com) con `Drizzle` para kioscos.",
      "",
    ].join("\n");
    expect(extraerResumen(texto)).toBe("Adoptar monolito con Drizzle para kioscos.");
  });

  it("incluye subsecciones y cae al primer párrafo si la sección no sirve", () => {
    const anidado = ["# T", "", "## 1. Resumen", "", "### 1.1 Problema", "", "El fiado es parte del kiosco."].join(
      "\n",
    );
    expect(extraerResumen(anidado)).toBe("El fiado es parte del kiosco.");
    const soloTabla = ["# T", "", "## Resumen", "", "| a | b |", "", "Primer párrafo real del doc."].join("\n");
    expect(extraerResumen(soloTabla)).toBe("Primer párrafo real del doc.");
  });

  it("corta en 3 líneas de 110 con frases completas y devuelve vacío sin prosa", () => {
    const larga =
      "Primera frase factual sobre el sistema de inventario. " +
      "Segunda frase factual sobre ventas y caja offline. " +
      "Tercera frase factual sobre sincronización por tenant. " +
      "Cuarta frase que no debe entrar en el resumen.";
    const r = extraerResumen(`# T\n\n${larga}\n`);
    const lineas = r.split("\n");
    expect(lineas.length).toBeLessThanOrEqual(3);
    for (const l of lineas) expect(l.length).toBeLessThanOrEqual(110);
    expect(r).toContain("Primera frase factual");
    expect(r).not.toContain("Cuarta frase");
    expect(extraerResumen("# Solo título\n\n| a | b |\n")).toBe("");
    expect(extraerResumen("")).toBe("");
  });
});
