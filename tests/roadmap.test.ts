import { describe, expect, it } from "vitest";
import {
  aplicarSeccion,
  guardaPR,
  parsearAvance,
  renderizarSeccion,
} from "../scripts/roadmap-lib.mjs";

const INICIO = "<!-- roadmap:avances:inicio -->";
const FIN = "<!-- roadmap:avances:fin -->";

function avanceValido(sobre: Record<string, string> = {}) {
  return [
    "---",
    `item: ${sobre.item ?? "ROAD1-S1"}`,
    `estado: ${sobre.estado ?? "hecho"}`,
    `adr: ${sobre.adr ?? "ADR-0076"}`,
    `prd: ${sobre.prd ?? "PRD-ROAD-01"}`,
    `fecha: ${sobre.fecha ?? "2026-10-14"}`,
    "---",
    sobre.texto ?? "Avance de prueba.",
  ].join("\n");
}

describe("parsearAvance", () => {
  it("parsea un avance válido", () => {
    expect(parsearAvance(avanceValido(), "0076.md")).toEqual({
      item: "ROAD1-S1",
      estado: "hecho",
      adr: "ADR-0076",
      prd: "PRD-ROAD-01",
      fecha: "2026-10-14",
      texto: "Avance de prueba.",
    });
  });

  it("falla y nombra el archivo si falta estado", () => {
    const texto = [
      "---",
      "item: ROAD1-S1",
      "adr: ADR-0076",
      "prd: PRD-ROAD-01",
      "fecha: 2026-10-14",
      "---",
      "Algo.",
    ].join("\n");
    let mensaje = "";
    try {
      parsearAvance(texto, "0099.md");
    } catch (e) {
      mensaje = (e as Error).message;
    }
    expect(mensaje).toContain("0099.md");
  });

  it("falla y nombra el archivo si falta item", () => {
    const texto = [
      "---",
      "estado: hecho",
      "adr: ADR-0076",
      "prd: PRD-ROAD-01",
      "fecha: 2026-10-14",
      "---",
      "Algo.",
    ].join("\n");
    let mensaje = "";
    try {
      parsearAvance(texto, "0100.md");
    } catch (e) {
      mensaje = (e as Error).message;
    }
    expect(mensaje).toContain("0100.md");
  });

  it("falla si la fecha no es AAAA-MM-DD", () => {
    let mensaje = "";
    try {
      parsearAvance(avanceValido({ fecha: "14-10-2026" }), "0076.md");
    } catch (e) {
      mensaje = (e as Error).message;
    }
    expect(mensaje).toContain("0076.md");
  });

  it("falla si no hay línea de texto tras el front-matter", () => {
    const texto = [
      "---",
      "item: ROAD1-S1",
      "estado: hecho",
      "adr: ADR-0076",
      "prd: PRD-ROAD-01",
      "fecha: 2026-10-14",
      "---",
      "",
    ].join("\n");
    let mensaje = "";
    try {
      parsearAvance(texto, "0076.md");
    } catch (e) {
      mensaje = (e as Error).message;
    }
    expect(mensaje).toContain("0076.md");
  });

  it("falla si hay más de una línea de texto", () => {
    const texto = avanceValido() + "\nSegunda línea.";
    let mensaje = "";
    try {
      parsearAvance(texto, "0076.md");
    } catch (e) {
      mensaje = (e as Error).message;
    }
    expect(mensaje).toContain("0076.md");
  });
});

describe("renderizarSeccion", () => {
  it("genera tabla con dos filas ordenada por fecha descendente y ADR", () => {
    const seccion = renderizarSeccion([
      {
        item: "X-S1",
        estado: "hecho",
        adr: "ADR-0099",
        prd: "PRD-X",
        fecha: "2026-10-13",
        texto: "Viejo.",
      },
      {
        item: "ROAD1-S1",
        estado: "hecho",
        adr: "ADR-0076",
        prd: "PRD-ROAD-01",
        fecha: "2026-10-14",
        texto: "Nuevo.",
      },
    ]);
    expect(seccion).toContain("## Avances por PR (generado)");
    expect(seccion).toContain("npm run roadmap");
    expect(seccion).toContain("docs/roadmap/avances/");
    expect(seccion).toContain("| Fecha | Item | Estado | Avance | PRD / ADR |");
    const iNuevo = seccion.indexOf("2026-10-14");
    const iViejo = seccion.indexOf("2026-10-13");
    expect(iNuevo).toBeGreaterThan(-1);
    expect(iViejo).toBeGreaterThan(iNuevo);
    expect(seccion).toContain("| 2026-10-14 | ROAD1-S1 | hecho | Nuevo. | PRD-ROAD-01 / ADR-0076 |");
  });

  it("desempata por ADR ascendente ante igual fecha", () => {
    const seccion = renderizarSeccion([
      {
        item: "B",
        estado: "hecho",
        adr: "ADR-0099",
        prd: "PRD-X",
        fecha: "2026-10-14",
        texto: "B.",
      },
      {
        item: "A",
        estado: "hecho",
        adr: "ADR-0076",
        prd: "PRD-X",
        fecha: "2026-10-14",
        texto: "A.",
      },
    ]);
    expect(seccion.indexOf("ADR-0076")).toBeLessThan(seccion.indexOf("ADR-0099"));
  });
});

describe("aplicarSeccion", () => {
  it("reemplaza solo la sección entre marcadores y deja el resto igual", () => {
    const roadmap = ["# T", "", "previo", INICIO, "viejo", FIN, "", "posterior"].join("\n");
    const salida = aplicarSeccion(roadmap, "## S\n\nnuevo");
    expect(salida).toContain(`${INICIO}\n## S\n\nnuevo\n${FIN}`);
    expect(salida.startsWith("# T\n\nprevio\n")).toBe(true);
    expect(salida.endsWith("\n\nposterior")).toBe(true);
    expect(salida).not.toContain("viejo");
  });

  it("inserta antes de Decisiones registradas si faltan marcadores", () => {
    const roadmap = ["# T", "", "## Decisiones registradas", "", "- d1"].join("\n");
    const salida = aplicarSeccion(roadmap, "## S");
    expect(salida).toContain(INICIO);
    expect(salida).toContain(FIN);
    expect(salida.indexOf(INICIO)).toBeLessThan(salida.indexOf("## Decisiones registradas"));
    expect(salida).toContain("- d1");
  });

  it("inserta al final si no hay marcadores ni Decisiones", () => {
    const roadmap = ["# T", "", "texto"].join("\n");
    const salida = aplicarSeccion(roadmap, "## S");
    expect(salida.startsWith("# T\n\ntexto")).toBe(true);
    expect(salida).toContain(INICIO);
    expect(salida).toContain(FIN);
  });

  it("es idempotente", () => {
    const roadmap = ["# T", "", "## Decisiones registradas"].join("\n");
    const una = aplicarSeccion(roadmap, "## S\n\ncuerpo");
    expect(aplicarSeccion(una, "## S\n\ncuerpo")).toBe(una);
  });
});

describe("guardaPR", () => {
  it("falla si toca src/ y docs/ROADMAP.md", () => {
    const r = guardaPR(["src/x.ts", "docs/ROADMAP.md"]);
    expect(r.ok).toBe(false);
    expect(r.motivo.length).toBeGreaterThan(0);
  });

  it("pasa con solo un archivo de avance", () => {
    const r = guardaPR(["docs/roadmap/avances/0099.md"]);
    expect(r.ok).toBe(true);
  });

  it("pasa si ROADMAP.md va solo con archivos de la herramienta", () => {
    const r = guardaPR([
      "docs/ROADMAP.md",
      "docs/roadmap/avances/0099.md",
      "scripts/roadmap-lib.mjs",
      "tests/roadmap-extra.test.ts",
      ".github/workflows/roadmap-guard.yml",
    ]);
    expect(r.ok).toBe(true);
  });

  it("pasa sin docs/ROADMAP.md aunque toque src/", () => {
    expect(guardaPR(["src/x.ts"]).ok).toBe(true);
  });

  it("falla si ROADMAP.md va con un workflow ajeno", () => {
    const r = guardaPR(["docs/ROADMAP.md", ".github/workflows/ci.yml"]);
    expect(r.ok).toBe(false);
  });
});

describe("roadmap: bordes de formato", () => {
  it("escapa | en el texto y acepta CRLF", async () => {
    const { parsearAvance, renderizarSeccion } = await import("../scripts/roadmap-lib.mjs");
    const a = parsearAvance("---\r\nitem: X\r\nestado: hecho\r\nadr: ADR-1\r\nprd: PRD-1\r\nfecha: 2026-10-14\r\n---\r\na | b\r\n", "x.md");
    expect(renderizarSeccion([a])).toContain("a \\| b");
  });
});
