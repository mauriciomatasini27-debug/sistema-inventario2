import { describe, expect, it } from "vitest";
import {
  archivosVisuales,
  esArchivoVisual,
  evaluarRevision,
  highsAbiertos,
  seccionRevision,
  veredicto,
} from "../scripts/cadena/interface-review-lib.mjs";

describe("esArchivoVisual", () => {
  it.each(["src/pages/venta.astro", "src/styles/global.css", "src/components/Boton.tsx", "src/x/y.jsx"])(
    "marca visual %s",
    (p) => expect(esArchivoVisual(p)).toBe(true),
  );
  it.each([
    "src/lib/offline.ts",
    "src/x/y.ts",
    "tests/cadena-interface-review.test.ts",
    "scripts/cadena/puede-mergear-lib.mjs",
    "docs/diseno/EVIDENCIA-UI-00-tickets.md",
    "drizzle/0024_x.sql",
    "src/x.astro.bak",
    "",
  ])("no marca %s", (p) => expect(esArchivoVisual(p)).toBe(false));
});

describe("archivosVisuales", () => {
  it("filtra visuales y descarta removed", () => {
    const files = [
      { filename: "src/a.astro", status: "modified" },
      { filename: "src/b.css", status: "removed" },
      { filename: "src/c.tsx", status: "added" },
      { filename: "src/d.ts", status: "modified" },
      { filename: "tests/x.test.ts", status: "added" },
    ];
    expect(archivosVisuales(files)).toEqual(["src/a.astro", "src/c.tsx"]);
  });
  it("tolerar undefined", () => expect(archivosVisuales(undefined)).toEqual([]));
});

describe("seccionRevision", () => {
  it("devuelve el cuerpo de la sección interface-review", () => {
    const cuerpo = "# Título\n\n## interface-review\n\n| a | b |\n\n**Verdict:** Approve\n\n## Otra\nno";
    const s = seccionRevision(cuerpo);
    expect(s).toContain("| a | b |");
    expect(s).toContain("Verdict");
    expect(s).not.toContain("Otra");
    expect(s).not.toContain("Título");
  });
  it("matchea cualquier nivel y case-insensitive", () => {
    expect(seccionRevision("### INTERFACE-REVIEW\ncontenido")).toContain("contenido");
  });
  it("corta en un encabezado de nivel igual o menor, no en uno más profundo", () => {
    const cuerpo = "## interface-review\nuno\n### sub\ndos\n## fin\ntres";
    expect(seccionRevision(cuerpo)).toBe("uno\n### sub\ndos");
  });
  it("ignora encabezados dentro de bloques de código", () => {
    const cuerpo = "```md\n## interface-review\n```\n\ntexto real";
    expect(seccionRevision(cuerpo)).toBeNull();
  });
  it("null si no existe", () => expect(seccionRevision("## Otra\nx")).toBeNull());
});

describe("veredicto", () => {
  it.each([
    ["**Verdict:** Approve", "Approve"],
    ["Veredicto: `Block`", "Block"],
    ["- veredicto: block", "Block"],
  ])("lee %s", (linea, esperado) => expect(veredicto(`${linea}\n`)).toBe(esperado));
  it("null sin línea de veredicto", () => expect(veredicto("| a | b |\n")).toBeNull());
  it("null con la palabra pero sin valor", () => expect(veredicto("Verdict pendiente\n")).toBeNull());
  it("null en sección null", () => expect(veredicto(null)).toBeNull());
});

describe("highsAbiertos", () => {
  const tabla = [
    "| Severity | Domain | Status | Location | Before | After | Why |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    "| HIGH | Accessibility | Regression | `src/Dialog.tsx:42` | a | b | falta nombre accesible |",
    "| MEDIUM | Layout | Introduced | `src/X.tsx:1` | a | b | c |",
    "| HIGH | Typography | Pre-existing | `src/Y.tsx:9` | a | b | viejo |",
    "| HIGH | Colors | Regression · Resuelto | `src/Z.css:3` | a | b | contraste |",
    "| ~~HIGH~~ | UI | Regression | `src/W.tsx:5` | a | b | tachado |",
  ].join("\n");

  it("devuelve solo el HIGH abierto con su location y why", () => {
    expect(highsAbiertos(tabla)).toEqual([
      { location: "`src/Dialog.tsx:42`", why: "falta nombre accesible" },
    ]);
  });
  it("sin headers, la primera celda es severidad", () => {
    expect(highsAbiertos("| HIGH | `src/A.ts:1` |")).toEqual([{ location: "", why: "" }]);
  });
  it("sin sección devuelve []", () => expect(highsAbiertos("")).toEqual([]));
  it("la palabra fixed en Why no cierra el HIGH", () => {
    const t = [
      "| Severity | Domain | Status | Location | Before | After | Why |",
      "| --- | --- | --- | --- | --- | --- | --- |",
      "| HIGH | Layout | Introduced | `src/A.astro:3` | a | b | Fixed header tapa el botón |",
    ].join("\n");
    expect(highsAbiertos(t)).toHaveLength(1);
  });
  it("sin columna Status, solo una celda que sea exactamente la marca cierra", () => {
    expect(highsAbiertos("| HIGH | `src/A.astro:1` | Resuelto |")).toEqual([]);
    expect(highsAbiertos("| HIGH | `src/A.astro:1` | fixed width rompe |")).toHaveLength(1);
  });
  it("saltea la tabla bajo un subencabezado Pre-existing (formato sin Status)", () => {
    const t = [
      "No actionable interface findings in this change.",
      "",
      "### Pre-existing",
      "",
      "| Severity | Domain | Location | Issue |",
      "| --- | --- | --- | --- |",
      "| HIGH | Colors | `src/pages/admin.astro:24` | ash viejo |",
      "",
      "### Verification",
      "",
      "| HIGH | Layout | `src/B.astro:2` | nuevo |",
    ].join("\n");
    expect(highsAbiertos(t)).toEqual([{ location: "", why: "" }]);
  });
});

describe("evaluarRevision", () => {
  const visual = [{ filename: "src/pages/venta.astro", status: "modified" }];

  it("sin archivos visuales no aplica y sin motivos", () => {
    expect(evaluarRevision({ cuerpo: "", files: [{ filename: "src/a.ts", status: "modified" }] })).toEqual({
      aplica: false,
      motivos: [],
    });
  });
  it("bloquea PR visual sin sección, nombrando los archivos", () => {
    const r = evaluarRevision({ cuerpo: "cuerpo", files: visual });
    expect(r.aplica).toBe(true);
    expect(r.motivos).toHaveLength(1);
    expect(r.motivos[0]).toBe(
      "PR visual (1 archivos: src/pages/venta.astro) sin sección `## interface-review` en el cuerpo",
    );
  });
  it("bloquea si falta el veredicto", () => {
    const r = evaluarRevision({ cuerpo: "## interface-review\n\n| a | b |\n", files: visual });
    expect(r.motivos.some((m) => /veredicto/i.test(m))).toBe(true);
  });
  it("bloquea con veredicto Block", () => {
    const r = evaluarRevision({ cuerpo: "## interface-review\n\n**Verdict:** Block\n", files: visual });
    expect(r.motivos.some((m) => /Block/.test(m))).toBe(true);
  });
  it("un motivo por HIGH abierto", () => {
    const cuerpo = [
      "## interface-review",
      "",
      "**Verdict:** Approve",
      "",
      "| Severity | Domain | Status | Location | Before | After | Why |",
      "| --- | --- | --- | --- | --- | --- | --- |",
      "| HIGH | A11y | Regression | `src/A.tsx:1` | a | b | faltó label |",
      "| HIGH | Layout | Introduced | `src/B.css:2` | a | b | overlap |",
    ].join("\n");
    const r = evaluarRevision({ cuerpo, files: visual });
    expect(r.motivos).toHaveLength(2);
    expect(r.motivos[0]).toContain("src/A.tsx:1");
    expect(r.motivos[1]).toContain("src/B.css:2");
  });
  it("pasa con Approve y sin HIGH abiertos", () => {
    const cuerpo = [
      "## interface-review",
      "",
      "**Verdict:** Approve",
      "",
      "| Severity | Domain | Status | Location | Before | After | Why |",
      "| --- | --- | --- | --- | --- | --- | --- |",
      "| LOW | Writing | Introduced | `src/A.astro:1` | a | b | copy |",
    ].join("\n");
    expect(evaluarRevision({ cuerpo, files: visual })).toEqual({ aplica: true, motivos: [] });
  });
});
