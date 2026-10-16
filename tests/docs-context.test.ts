import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buscarContexto, cargarCandidatos, formatearTexto } from "../scripts/docs-context-lib.mjs";

const AQUI = dirname(fileURLToPath(import.meta.url));
const CLI = join(AQUI, "..", "scripts", "docs-context.mjs");

function fm(sobre: Record<string, string> = {}): string {
  const d = {
    id: "X-1",
    tipo: "adr",
    estado: "propuesto",
    modulos: "[]",
    depende_de: "[]",
    reemplaza: "[]",
    reemplazado_por: '""',
    modifica: "[]",
    modificado_por: "[]",
    resumen: '""',
    ...sobre,
  };
  return [
    "---",
    `id: ${d.id}`,
    `tipo: ${d.tipo}`,
    `estado: ${d.estado}`,
    `modulos: ${d.modulos}`,
    `depende_de: ${d.depende_de}`,
    `reemplaza: ${d.reemplaza}`,
    `reemplazado_por: ${d.reemplazado_por}`,
    `modifica: ${d.modifica}`,
    `modificado_por: ${d.modificado_por}`,
    `resumen: ${d.resumen}`,
    "---",
    "",
  ].join("\n");
}

function mkRaiz(archivos: Record<string, string>): string {
  const raiz = mkdtempSync(join(tmpdir(), "docs-context-"));
  for (const [rel, texto] of Object.entries(archivos)) {
    const abs = join(raiz, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, texto);
  }
  return raiz;
}

function raizBase() {
  return mkRaiz({
    "a.md": `${fm({
      id: "ADR-0001",
      tipo: "adr",
      estado: "aceptado",
      modulos: "[caja]",
      depende_de: "[PRD-CAJA-01]",
      resumen: '"Caja base aceptada."',
    })}\n# ADR-0001 Caja base\n\n## Decisión\n\nUsamos caja con devoluciones.\n\n## Ticket\n\nDetalle de caja.\n`,
    "b.md": `${fm({
      id: "PRD-CAJA-01",
      tipo: "prd",
      estado: "propuesto",
      modulos: "[caja, ventas]",
      resumen: '"QR y vencimientos de caja."',
    })}\n# PRD-CAJA-01 QR\n\n## Qué cambia\n\nAgrega QR a la caja.\n\n## Historias\n\nHistoria de caja.\n`,
    "c.md": `${fm({
      id: "ADR-0002",
      tipo: "adr",
      estado: "aceptado",
      modulos: "[ventas]",
      resumen: '"Ventas con devoluciones."',
    })}\n# ADR-0002 Ventas\n\n## Devoluciones parciales\n\nLas devoluciones se descuentan del ticket.\n\n## Otro\n\nSin término.\n`,
    "d-reemplazado.md": `${fm({ id: "ADR-0009", estado: "reemplazado", modulos: "[caja]" })}\n# ADR-0009\n\n## Decisión\n\nCaja vieja.\n`,
    "e-deprecado.md": `${fm({ id: "ADR-0010", estado: "deprecado", modulos: "[caja]" })}\n# ADR-0010\n\n## Decisión\n\nCaja vieja.\n`,
    "archivo/old.md": `${fm({ id: "ADR-0011", estado: "aceptado", modulos: "[caja]" })}\n# ADR-0011\n\n## Decisión\n\nCaja archivada.\n`,
    "historico/old.md": `${fm({ id: "ADR-0012", estado: "aceptado", modulos: "[caja]" })}\n# ADR-0012\n\n## Decisión\n\nCaja histórica.\n`,
    "sin-fm.md": "# Sin frontmatter\n\nCaja suelta.\n",
  });
}

describe("docs:context candidatos", () => {
  it("excluye reemplazado, deprecado, archivo, historico y sin frontmatter", () => {
    const docs = cargarCandidatos(raizBase());
    const ids = docs.map((d) => d.id).sort();
    expect(ids).toEqual(["ADR-0001", "ADR-0002", "PRD-CAJA-01"]);
  });
});

describe("docs:context por id", () => {
  it("el id exacto va primero y arrastra vecinos depende_de activos", () => {
    const docs = cargarCandidatos(raizBase());
    const r = buscarContexto("ADR-0001", docs);
    expect(r.tipo).toBe("id");
    expect(r.docs[0]?.id).toBe("ADR-0001");
    expect(r.docs.map((d) => d.id)).toContain("PRD-CAJA-01");
    const primero = r.docs[0];
    expect(primero?.ruta).toMatch(/a\.md$/);
    expect(primero?.estado).toBe("aceptado");
  });
});

describe("docs:context modifica/modificado_por", () => {
  function raizModifica(): string {
    return mkRaiz({
      "old.md":
        `${fm({ id: "ADR-0066", estado: "aceptado", modificado_por: "[ADR-0080]", resumen: '"Viejo resumen."' })}\n` +
        "# ADR-0066 Viejo\n\n## Decisión\n\nViejo texto.\n",
      "new.md":
        `${fm({ id: "ADR-0080", estado: "aceptado", modifica: "[ADR-0066]", resumen: '"Nuevo resumen."' })}\n` +
        "# ADR-0080 Nuevo\n\n## Decisión\n\nNuevo texto.\n",
    });
  }

  it("candidatos exponen modifica y modificado_por", () => {
    const docs = cargarCandidatos(raizModifica());
    expect(docs.find((d) => d.id === "ADR-0066")?.modificado_por).toEqual(["ADR-0080"]);
    expect(docs.find((d) => d.id === "ADR-0066")?.modifica).toEqual([]);
    expect(docs.find((d) => d.id === "ADR-0080")?.modifica).toEqual(["ADR-0066"]);
    expect(docs.find((d) => d.id === "ADR-0080")?.modificado_por).toEqual([]);
  });

  it("el id exacto arrastra a sus modificadores con rango de Decisión", () => {
    const raiz = raizModifica();
    const docs = cargarCandidatos(raiz);
    const r = buscarContexto("ADR-0066", docs);
    expect(r.tipo).toBe("id");
    expect(r.docs[0]?.id).toBe("ADR-0066");
    expect(r.docs.map((d) => d.id)).toContain("ADR-0080");
    const primero = r.docs[0];
    expect(primero?.modificado_por).toEqual(["ADR-0080"]);
    expect(primero?.modificadores).toEqual([
      {
        id: "ADR-0080",
        ruta: `${raiz}/new.md`,
        resumen: "Nuevo resumen.",
        decision: { start: 16, end: 19, heading: "Decisión" },
      },
    ]);
  });

  it("formatearTexto imprime la línea ↳ con el rango de Decisión del modificador", () => {
    const raiz = raizModifica();
    const docs = cargarCandidatos(raiz);
    const texto = formatearTexto(buscarContexto("ADR-0066", docs));
    expect(texto).toContain(`↳ modificado por ADR-0080 · ${raiz}/new.md · Nuevo resumen.`);
    expect(texto).toContain("    - L16-L19 ## Decisión");
  });

  it("los modificadores cuentan dentro del tope de 10", () => {
    const archivos: Record<string, string> = {};
    const ids = Array.from({ length: 11 }, (_, i) => `ADR-${String(80 + i).padStart(4, "0")}`);
    archivos["old.md"] =
      `${fm({ id: "ADR-0066", estado: "aceptado", modificado_por: `[${ids.join(", ")}]`, resumen: '"Base."' })}\n` +
      "# ADR-0066 Base\n\n## Decisión\n\nBase.\n";
    for (let i = 0; i < ids.length; i += 1) {
      const id = ids[i] ?? "";
      archivos[`m${i}.md`] =
        `${fm({ id, estado: "aceptado", modifica: "[ADR-0066]", resumen: `"Mod ${i}."` })}\n` +
        `# ${id} Mod\n\n## Decisión\n\nMod ${i}.\n`;
    }
    const docs = cargarCandidatos(mkRaiz(archivos));
    const r = buscarContexto("ADR-0066", docs);
    expect(r.docs.length).toBe(10);
    expect(r.docs[0]?.id).toBe("ADR-0066");
    expect(r.docs[0]?.modificado_por?.length).toBe(11);
  });
});

describe("docs:context por modulo", () => {
  it("prioriza docs con el modulo en frontmatter", () => {
    const docs = cargarCandidatos(raizBase());
    const r = buscarContexto("caja", docs);
    expect(r.tipo).toBe("modulo");
    const ids = r.docs.map((d) => d.id);
    expect(ids.slice(0, 2).sort()).toEqual(["ADR-0001", "PRD-CAJA-01"]);
  });

  it("para id/modulo cita Decisión, Qué cambia o Historias", () => {
    const docs = cargarCandidatos(raizBase());
    const r = buscarContexto("caja", docs);
    const adr = r.docs.find((d) => d.id === "ADR-0001");
    expect(adr?.secciones.length).toBeGreaterThan(0);
    expect(adr?.secciones.length).toBeLessThanOrEqual(4);
    const titulos = (adr?.secciones ?? []).map((s) => s.heading);
    expect(titulos.some((t) => /decisi/i.test(t))).toBe(true);
    const prd = r.docs.find((d) => d.id === "PRD-CAJA-01");
    const ptitulos = (prd?.secciones ?? []).map((s) => s.heading);
    expect(ptitulos.some((t) => /qu.cambia|historias/i.test(t))).toBe(true);
  });
});

describe("docs:context por tema", () => {
  it("encuentra headings cuya sección contiene el término con rangos 1-based", () => {
    const raiz = mkRaiz({
      "t.md": `${fm({ id: "ADR-0002", estado: "aceptado", resumen: '"Ventas."' })}\n# ADR-0002 Ventas\n\n## Devoluciones parciales\n\nLas devoluciones se descuentan.\n\n## Otro\n\nNada relevante.\n`,
    });
    const docs = cargarCandidatos(raiz);
    const r = buscarContexto("devoluciones", docs);
    expect(r.tipo).toBe("tema");
    expect(r.docs.length).toBe(1);
    const sec = r.docs[0]?.secciones ?? [];
    expect(sec.length).toBe(1);
    expect(sec[0]?.heading).toMatch(/Devoluciones/);
    // frontmatter 12 líneas + "" + "# ..." = heading ## en línea 16, sección hasta línea 19
    expect(sec[0]?.start).toBe(16);
    expect(sec[0]?.end).toBe(19);
  });
});

describe("docs:context tope 5-10 y determinismo", () => {
  function raizMuchos(): string {
    const archivos: Record<string, string> = {};
    for (let i = 1; i <= 12; i += 1) {
      const id = `ADR-${String(100 + i).padStart(4, "0")}`;
      archivos[`${i}.md`] =
        `${fm({ id, estado: "aceptado", modulos: "[caja]", resumen: '"Caja."' })}\n# ${id}\n\n## Decisión\n\nCaja ${i}.\n`;
    }
    return mkRaiz(archivos);
  }

  it("corta en 10 aunque haya 12 candidatos", () => {
    const docs = cargarCandidatos(raizMuchos());
    const r = buscarContexto("caja", docs);
    expect(r.docs.length).toBe(10);
    for (const d of r.docs) expect(d.secciones.length).toBeLessThanOrEqual(4);
  });

  it("devuelve menos de 5 solo si hay menos matches", () => {
    const docs = cargarCandidatos(raizBase());
    const r = buscarContexto("devoluciones", docs);
    expect(r.docs.length).toBeLessThanOrEqual(10);
    expect(r.docs.length).toBeGreaterThanOrEqual(1);
  });

  it("es determinista entre dos corridas", () => {
    const docs = cargarCandidatos(raizBase());
    const una = buscarContexto("caja", docs);
    const otra = buscarContexto("caja", docs);
    expect(otra).toEqual(una);
  });
});

describe("docs:context CLI --json", () => {
  it("emite forma máquina y sale 1 si no hay matches", () => {
    const raiz = raizBase();
    const salida = execFileSync(process.execPath, [CLI, "--raiz", raiz, "--json", "caja"], {
      encoding: "utf8",
    });
    const j = JSON.parse(salida);
    expect(j.query).toBe("caja");
    expect(j.total).toBeGreaterThan(0);
    expect(typeof j.tokensAprox).toBe("number");
    expect(Array.isArray(j.docs)).toBe(true);
    const primero = j.docs[0];
    expect(typeof primero.id).toBe("string");
    expect(typeof primero.ruta).toBe("string");
    expect(typeof primero.estado).toBe("string");
    expect(typeof primero.resumen).toBe("string");
    expect(Array.isArray(primero.secciones)).toBe(true);
    expect(typeof primero.secciones[0]?.start).toBe("number");
    expect(typeof primero.secciones[0]?.end).toBe("number");
    expect(typeof primero.secciones[0]?.heading).toBe("string");
    let estado = 0;
    try {
      execFileSync(process.execPath, [CLI, "--raiz", raiz, "zzz-sin-match-xyz"], { stdio: "pipe" });
    } catch (e) {
      estado = (e as { status?: number }).status ?? 99;
    }
    expect(estado).toBe(1);
  });
});
