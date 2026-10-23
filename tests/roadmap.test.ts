import { describe, expect, it } from "vitest";
import {
  aplicarSeccion,
  arranqueContradiceHecho,
  guardaPR,
  parsearAvance,
  recortarPrologo,
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

  it("falla si estado hecho y el texto arranca con parcial", () => {
    let mensaje = "";
    try {
      parsearAvance(avanceValido({ estado: "hecho", texto: "ROAD1-S1 parcial: falta algo." }), "bad-parcial.md");
    } catch (e) {
      mensaje = (e as Error).message;
    }
    expect(mensaje).toContain("bad-parcial.md");
  });

  it("acepta hecho con parcial entre paréntesis", () => {
    expect(
      parsearAvance(avanceValido({ estado: "hecho", texto: "DASH-S8 hecho (parcial: slice)." }), "dash.md"),
    ).toMatchObject({ texto: "DASH-S8 hecho (parcial: slice)." });
  });
});

describe("arranqueContradiceHecho", () => {
  it("detecta parcial tras id y no dentro de paréntesis", () => {
    expect(arranqueContradiceHecho("hecho", "ITEM parcial: x")).toBe(true);
    expect(arranqueContradiceHecho("hecho", "DASH-S8 hecho (parcial: slice)")).toBe(false);
    expect(arranqueContradiceHecho("pendiente", "ITEM parcial: x")).toBe(false);
  });
});

describe("renderizarSeccion", () => {
  it("genera tabla con filas abiertas ordenada por fecha descendente y ADR", () => {
    const seccion = renderizarSeccion([
      {
        item: "X-S1",
        estado: "hecho",
        adr: "ADR-0099",
        prd: "PRD-X",
        fecha: "2026-10-13",
        texto: "Cerrado.",
      },
      {
        item: "ROAD1-S1",
        estado: "pendiente",
        adr: "ADR-0076",
        prd: "PRD-ROAD-01",
        fecha: "2026-10-14",
        texto: "Abierto.",
      },
      {
        item: "Y-S2",
        estado: "pendiente",
        adr: "ADR-0080",
        prd: "PRD-Y",
        fecha: "2026-10-13",
        texto: "También abierto.",
      },
    ]);
    expect(seccion).toContain("## Avances por PR (generado)");
    expect(seccion).toContain("npm run roadmap");
    expect(seccion).toContain("docs/roadmap/avances/");
    expect(seccion).toContain("| Fecha | Item | Estado | Avance | PRD / ADR |");
    expect(seccion).not.toContain("X-S1");
    const iNuevo = seccion.indexOf("2026-10-14");
    const iViejo = seccion.indexOf("2026-10-13");
    expect(iNuevo).toBeGreaterThan(-1);
    expect(iViejo).toBeGreaterThan(iNuevo);
    expect(seccion).toContain("| 2026-10-14 | ROAD1-S1 | pendiente | Abierto. | PRD-ROAD-01 / ADR-0076 |");
  });

  it("desempata por ADR ascendente ante igual fecha entre abiertos", () => {
    const seccion = renderizarSeccion([
      {
        item: "B",
        estado: "pendiente",
        adr: "ADR-0099",
        prd: "PRD-X",
        fecha: "2026-10-14",
        texto: "B.",
      },
      {
        item: "A",
        estado: "pendiente",
        adr: "ADR-0076",
        prd: "PRD-X",
        fecha: "2026-10-14",
        texto: "A.",
      },
    ]);
    expect(seccion.indexOf("ADR-0076")).toBeLessThan(seccion.indexOf("ADR-0099"));
  });

  it("sin abiertos muestra Sin avances abiertos y no lista hechos", () => {
    const seccion = renderizarSeccion([
      {
        item: "CERRADO-1",
        estado: "hecho",
        adr: "ADR-0001",
        prd: "PRD-1",
        fecha: "2026-10-14",
        texto: "Listo.",
      },
    ]);
    expect(seccion).toContain("Sin avances abiertos.");
    expect(seccion).not.toContain("CERRADO-1");
    expect(seccion).not.toContain("| Fecha | Item | Estado | Avance | PRD / ADR |");
  });
});

describe("recortarPrologo", () => {
  it("reemplaza el preámbulo y conserva marcadores y cola", () => {
    const tail = "tail line";
    const roadmap = ["# Viejo", "basura", INICIO, "sección", FIN, "", tail].join("\n");
    const out = recortarPrologo(roadmap);
    expect(out.startsWith("# Roadmap\n\nEl estado vivo son los avances")).toBe(true);
    expect(out).toContain(INICIO);
    expect(out).toContain(FIN);
    expect(out.endsWith(tail)).toBe(true);
    expect(out).not.toContain("basura");
  });

  it("deja el roadmap igual si falta el marcador", () => {
    const roadmap = "# Solo título\n";
    expect(recortarPrologo(roadmap)).toBe(roadmap);
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
    const a = parsearAvance("---\r\nitem: X\r\nestado: pendiente\r\nadr: ADR-1\r\nprd: PRD-1\r\nfecha: 2026-10-14\r\n---\r\na | b\r\n", "x.md");
    expect(renderizarSeccion([a])).toContain("a \\| b");
  });
});

function avanceChicoValido(sobre: { decision?: string[] } = {}) {
  const decision = sobre.decision ?? ["d1", "d2", "d3", "d4", "d5", "d6"];
  return [
    "---",
    "item: P1-6",
    "estado: hecho",
    "fecha: 2026-10-14",
    "---",
    "P1-6: avance chico de prueba.",
    "",
    "## Decisión",
    ...decision,
  ].join("\n");
}

describe("parsearAvance chico P<n>-<m>", () => {
  it("valida un avance chico sin adr/prd con Decisión de 6 líneas", () => {
    expect(parsearAvance(avanceChicoValido(), "P1-6.md")).toEqual({
      item: "P1-6",
      estado: "hecho",
      adr: "",
      prd: "",
      fecha: "2026-10-14",
      texto: "P1-6: avance chico de prueba.",
      chico: true,
      decision: ["d1", "d2", "d3", "d4", "d5", "d6"],
    });
  });

  it("detecta el id chico sin ruta ni extensión", () => {
    const a = parsearAvance(avanceChicoValido(), "docs/roadmap/avances/P1-6.md");
    expect((a as { chico?: boolean }).chico).toBe(true);
  });

  it("falla si la Decisión tiene 4 líneas", () => {
    let mensaje = "";
    try {
      parsearAvance(avanceChicoValido({ decision: ["d1", "d2", "d3", "d4"] }), "P1-6.md");
    } catch (e) {
      mensaje = (e as Error).message;
    }
    expect(mensaje).toContain("P1-6.md");
  });

  it("falla si la Decisión tiene 11 líneas", () => {
    let mensaje = "";
    try {
      parsearAvance(
        avanceChicoValido({
          decision: ["d1", "d2", "d3", "d4", "d5", "d6", "d7", "d8", "d9", "d10", "d11"],
        }),
        "P1-6.md",
      );
    } catch (e) {
      mensaje = (e as Error).message;
    }
    expect(mensaje).toContain("P1-6.md");
  });

  it("falla si falta la sección Decisión", () => {
    const texto = [
      "---",
      "item: P1-6",
      "estado: hecho",
      "fecha: 2026-10-14",
      "---",
      "P1-6: avance chico de prueba.",
    ].join("\n");
    let mensaje = "";
    try {
      parsearAvance(texto, "P1-6.md");
    } catch (e) {
      mensaje = (e as Error).message;
    }
    expect(mensaje).toContain("P1-6.md");
  });

  it("un avance numérico sin adr sigue fallando", () => {
    const texto = [
      "---",
      "item: ROAD1-S1",
      "estado: hecho",
      "prd: PRD-ROAD-01",
      "fecha: 2026-10-14",
      "---",
      "Algo.",
    ].join("\n");
    let mensaje = "";
    try {
      parsearAvance(texto, "0083.md");
    } catch (e) {
      mensaje = (e as Error).message;
    }
    expect(mensaje).toContain("0083.md");
  });
});

describe("renderizarSeccion con avance chico", () => {
  it("muestra — para adr/prd vacíos en avances abiertos", () => {
    const seccion = renderizarSeccion([
      {
        item: "P1-6",
        estado: "pendiente",
        adr: "",
        prd: "",
        fecha: "2026-10-14",
        texto: "Chico.",
      },
    ]);
    expect(seccion).toContain("—");
    expect(seccion).toContain("| 2026-10-14 | P1-6 | pendiente | Chico. | — / — |");
  });
});
