import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  aplicarBaseline,
  checkEnlaces,
  checkEsquema,
  checkIds,
  esEsquemaDoc,
  formatoError,
} from "../scripts/docs-check-lib.mjs";

const AQUI = dirname(fileURLToPath(import.meta.url));
const CLI = join(AQUI, "..", "scripts", "docs-check.mjs");

function fm(sobre: Record<string, string> = {}): string {
  return [
    "---",
    `id: ${sobre.id ?? "ADR-0001"}`,
    `tipo: ${sobre.tipo ?? "adr"}`,
    `estado: ${sobre.estado ?? "propuesto"}`,
    `modulos: ${sobre.modulos ?? "[]"}`,
    `depende_de: ${sobre.depende_de ?? "[]"}`,
    `reemplaza: ${sobre.reemplaza ?? "[]"}`,
    `reemplazado_por: ${sobre.reemplazado_por ?? '""'}`,
    `resumen: ${sobre.resumen ?? '""'}`,
    "---",
    "",
  ].join("\n");
}

function doc(ruta: string, texto: string): { ruta: string; texto: string } {
  return { ruta, texto };
}

function raizCon(archivos: Record<string, string>): string {
  const raiz = mkdtempSync(join(tmpdir(), "docs-check-"));
  for (const [rel, texto] of Object.entries(archivos)) {
    const abs = join(raiz, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, texto);
  }
  return raiz;
}

function correr(raiz: string, base: string): { estado: number; salida: string } {
  try {
    const out = execFileSync(process.execPath, [CLI, "--raiz", raiz, "--baseline", base], {
      stdio: "pipe",
      encoding: "utf8",
    });
    return { estado: 0, salida: String(out) };
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    return { estado: err.status ?? 99, salida: String(err.stdout ?? "") + String(err.stderr ?? "") };
  }
}

describe("docs:check esquema", () => {
  it("acepta un doc válido sin errores", () => {
    expect(checkEsquema([doc("docs/adr/0001-x.md", `${fm()}\n# T\n`)])).toEqual([]);
  });

  it("omite docs/roadmap del esquema aunque el frontmatter sea inválido", () => {
    const mal = "---\ntipo: adr\n---\n# Sin id\n";
    expect(checkEsquema([doc("docs/roadmap/avances/P1-6.md", mal)])).toEqual([]);
    expect(esEsquemaDoc("docs/roadmap/avances/P1-6.md")).toBe(false);
    expect(esEsquemaDoc("docs/adr/0001-x.md")).toBe(true);
  });

  it("omite docs sin frontmatter", () => {
    expect(checkEsquema([doc("docs/README.md", "# Título\n\nTexto.\n")])).toEqual([]);
  });

  it("falla sin id", () => {
    const errores = checkEsquema([doc("docs/adr/0001-x.md", `${fm({ id: '""' })}\n# T\n`)]);
    expect(errores.length).toBe(1);
    expect(errores[0]?.mensaje).toMatch(/id/);
  });

  it("falla con tipo fuera del enum", () => {
    const errores = checkEsquema([doc("docs/adr/0001-x.md", `${fm({ tipo: "ensayo" })}\n# T\n`)]);
    expect(errores.length).toBe(1);
    expect(errores[0]?.mensaje).toMatch(/tipo/);
  });

  it("falla con estado fuera del enum", () => {
    const errores = checkEsquema([doc("docs/adr/0001-x.md", `${fm({ estado: "borrador" })}\n# T\n`)]);
    expect(errores.length).toBe(1);
    expect(errores[0]?.mensaje).toMatch(/estado/);
  });

  it("falla cuando modulos no es lista", () => {
    const texto = `${fm()}\n# T\n`.replace("modulos: []", "modulos: caja");
    const errores = checkEsquema([doc("docs/adr/0001-x.md", texto)]);
    expect(errores.length).toBe(1);
    expect(errores[0]?.mensaje).toMatch(/modulos/);
  });

  it("falla cuando depende_de no es lista", () => {
    const texto = `${fm()}\n# T\n`.replace("depende_de: []", "depende_de: ADR-0002");
    const errores = checkEsquema([doc("docs/adr/0001-x.md", texto)]);
    expect(errores.length).toBe(1);
    expect(errores[0]?.mensaje).toMatch(/depende_de/);
  });

  it("falla cuando reemplaza no es lista", () => {
    const texto = `${fm()}\n# T\n`.replace("reemplaza: []", "reemplaza: ADR-0002");
    const errores = checkEsquema([doc("docs/adr/0001-x.md", texto)]);
    expect(errores.length).toBe(1);
    expect(errores[0]?.mensaje).toMatch(/reemplaza/);
  });

  it("falla con resumen de más de 3 líneas", () => {
    const texto = [
      "---",
      "id: ADR-0001",
      "tipo: adr",
      "estado: propuesto",
      "modulos: []",
      "depende_de: []",
      "reemplaza: []",
      'reemplazado_por: ""',
      "resumen: |",
      "  Una.",
      "  Dos.",
      "  Tres.",
      "  Cuatro.",
      "---",
      "",
      "# T",
      "",
    ].join("\n");
    const errores = checkEsquema([doc("docs/adr/0001-x.md", texto)]);
    expect(errores.length).toBe(1);
    expect(errores[0]?.mensaje).toMatch(/resumen/);
  });

  it("exige reemplazado_por cuando estado es reemplazado", () => {
    const errores = checkEsquema([doc("docs/adr/0001-x.md", `${fm({ estado: "reemplazado" })}\n# T\n`)]);
    expect(errores.length).toBe(1);
    expect(errores[0]?.mensaje).toMatch(/reemplazado_por/);
  });

  it("marca ids duplicados en cada doc repetido", () => {
    const archivos = [
      doc("docs/adr/0001-a.md", `${fm({ id: "ADR-0001" })}\n# A\n`),
      doc("docs/adr/0001-b.md", `${fm({ id: "ADR-0001" })}\n# B\n`),
    ];
    const errores = checkEsquema(archivos);
    expect(errores.length).toBe(2);
    expect(errores[0]?.mensaje).toMatch(/duplicado/);
  });

  it("formatea ruta:línea mensaje", () => {
    expect(formatoError({ ruta: "docs/adr/0001-x.md", linea: 2, mensaje: "tipo inválido" })).toBe(
      "docs/adr/0001-x.md:2 tipo inválido",
    );
  });
});

describe("docs:check ids existen", () => {
  it("acepta referencias a ids del lote", () => {
    const archivos = [
      doc("docs/adr/0001-x.md", `${fm({ id: "ADR-0001", depende_de: "[ADR-0002]" })}\n# A\n`),
      doc("docs/adr/0002-x.md", `${fm({ id: "ADR-0002" })}\n# B\n`),
    ];
    expect(checkIds(archivos)).toEqual([]);
  });

  it("falla cuando depende_de apunta a un id ausente", () => {
    const archivos = [doc("docs/a.md", `${fm({ id: "SPEC-UI-00", depende_de: "[PRD-UI-00]" })}\n# T\n`)];
    const errores = checkIds(archivos);
    expect(errores.length).toBe(1);
    expect(errores[0]?.ruta).toBe("docs/a.md");
    expect(errores[0]?.mensaje).toContain("PRD-UI-00");
  });

  it("falla cuando reemplaza y reemplazado_por apuntan a ids ausentes", () => {
    const archivos = [
      doc("docs/a.md", `${fm({ id: "A-1", reemplaza: "[FANTASMA-1]", reemplazado_por: "FANTASMA-2" })}\n# T\n`),
    ];
    const errores = checkIds(archivos);
    expect(errores.map((e) => e.mensaje).join("\n")).toContain("FANTASMA-1");
    expect(errores.map((e) => e.mensaje).join("\n")).toContain("FANTASMA-2");
  });
});

describe("docs:check enlaces", () => {
  it("acepta enlaces que resuelven e ignora http, mailto y anclas puras", () => {
    const archivos = [
      doc("docs/a.md", "# T\n\n[ok](b.md) [web](https://ejemplo.com) [mail](mailto:a@b.c) [ancla](#t).\n"),
      doc("docs/b.md", "# B\n"),
    ];
    expect(checkEnlaces(archivos, new Set(["docs/a.md", "docs/b.md"]))).toEqual([]);
  });

  it("acepta destino con ancla cuando el archivo existe", () => {
    const archivos = [doc("docs/a.md", "# T\n\nVer [sección](b.md#titulo).\n")];
    expect(checkEnlaces(archivos, new Set(["docs/a.md", "docs/b.md"]))).toEqual([]);
  });

  it("reporta el roto con su línea", () => {
    const archivos = [doc("docs/a.md", "# T\n\nVer [falta](falta.md).\n")];
    const errores = checkEnlaces(archivos, new Set(["docs/a.md"]));
    expect(errores.length).toBe(1);
    expect(errores[0]?.ruta).toBe("docs/a.md");
    expect(errores[0]?.linea).toBe(3);
    expect(errores[0]?.mensaje).toContain("falta.md");
  });

  it("ignora destinos bajo _origen-docx y archivo", () => {
    const archivos = [doc("docs/a.md", "# T\n\n[viejo](_origen-docx/v.md) [h](archivo/x.md).\n")];
    expect(checkEnlaces(archivos, new Set(["docs/a.md"]))).toEqual([]);
  });

  it("la baseline tolera el roto listado pero el nuevo falla", () => {
    const rotos = [{ ruta: "docs/a.md", linea: 3, mensaje: "enlace roto a falta.md" }];
    const r = aplicarBaseline(rotos, ["docs/a.md -> falta.md"]);
    expect(r.nuevos).toEqual([]);
    expect(r.obsoletas).toEqual([]);
    const r2 = aplicarBaseline(
      [...rotos, { ruta: "docs/b.md", linea: 1, mensaje: "enlace roto a otra.md" }],
      ["docs/a.md -> falta.md"],
    );
    expect(r2.nuevos.length).toBe(1);
    expect(r2.nuevos[0]?.ruta).toBe("docs/b.md");
  });

  it("la baseline solo achica: la entrada obsoleta falla", () => {
    const r = aplicarBaseline([], ["docs/a.md -> falta.md"]);
    expect(r.obsoletas).toEqual(["docs/a.md -> falta.md"]);
  });
});

describe("docs:check CLI --raiz", () => {
  it("sale 0 en un árbol sano y fresco", () => {
    const raiz = raizCon({
      "docs/a.md": `${fm({ id: "ADR-0001" })}\n# A\n\nVer [b](b.md).\n`,
      "docs/b.md": `${fm({ id: "ADR-0002" })}\n# B\n`,
    });
    const base = join(raiz, "baseline.json");
    writeFileSync(base, "[]");
    execFileSync(process.execPath, [join(AQUI, "..", "scripts", "docs-index.mjs"), "--raiz", join(raiz, "docs")], {
      stdio: "pipe",
    });
    expect(correr(join(raiz, "docs"), base).estado).toBe(0);
  });

  it("sale 1 con esquema roto e imprime ruta:línea", () => {
    const raiz = raizCon({
      "docs/a.md": `${fm({ id: "ADR-0001", tipo: "ensayo" })}\n# A\n`,
    });
    const base = join(raiz, "baseline.json");
    writeFileSync(base, "[]");
    execFileSync(process.execPath, [join(AQUI, "..", "scripts", "docs-index.mjs"), "--raiz", join(raiz, "docs")], {
      stdio: "pipe",
    });
    const r = correr(join(raiz, "docs"), base);
    expect(r.estado).toBe(1);
    expect(r.salida).toMatch(/docs\/a\.md:\d+ /);
  });
});
