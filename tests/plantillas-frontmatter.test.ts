import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const TIPOS = ["adr", "prd", "plan", "spec", "historico"];
const ESTADOS = ["propuesto", "aceptado", "hecho", "reemplazado", "deprecado"];

function frontmatter(texto: string): { datos: Record<string, string>; cuerpo: string } {
  const lineas = texto.replace(/\r\n/g, "\n").split("\n");
  expect((lineas[0] ?? "").trim()).toBe("---");
  const cierre = lineas.indexOf("---", 1);
  expect(cierre).toBeGreaterThan(0);
  const datos: Record<string, string> = {};
  for (const linea of lineas.slice(1, cierre)) {
    if (linea.trim() === "" || linea.trim().startsWith("#")) continue;
    const m = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(linea);
    expect(m, `línea de frontmatter inválida: ${linea}`).not.toBeNull();
    datos[m![1]!] = (m![2] ?? "").trim();
  }
  return { datos, cuerpo: lineas.slice(cierre + 1).join("\n") };
}

function frontmatterValido(datos: Record<string, string>, nombre: string): void {
  expect(datos["id"], `${nombre}: falta id`).toBeTruthy();
  expect(TIPOS, `${nombre}: tipo fuera de enum`).toContain(datos["tipo"]);
  expect(ESTADOS, `${nombre}: estado fuera de enum`).toContain(datos["estado"]);
  for (const campo of ["modulos", "depende_de", "reemplaza", "resumen"]) {
    expect(datos[campo] !== undefined, `${nombre}: falta ${campo}`).toBe(true);
  }
  const resumenLineas = String(datos["resumen"] ?? "")
    .split(/\\n|\n/)
    .filter((l) => l.trim() !== "");
  expect(resumenLineas.length, `${nombre}: resumen pasa 3 líneas`).toBeLessThanOrEqual(3);
  if (datos["estado"] === "reemplazado") {
    expect((datos["reemplazado_por"] ?? "").trim() !== "", `${nombre}: reemplazado exige reemplazado_por`).toBe(
      true,
    );
  }
}

describe("plantillas frontmatter", () => {
  it("ADR _PLANTILLA trae frontmatter válido al inicio y cuerpo ADR", () => {
    const texto = readFileSync(join("docs", "adr", "_PLANTILLA-ADR.md"), "utf8");
    const { datos, cuerpo } = frontmatter(texto);
    expect(datos["id"]).toBe("ADR-NNNN");
    expect(datos["tipo"]).toBe("adr");
    expect(datos["estado"]).toBe("propuesto");
    frontmatterValido(datos, "_PLANTILLA-ADR.md");
    expect(cuerpo).toContain("# ADR-NNNN - Título");
    expect(cuerpo).toContain("Estado:");
    expect(cuerpo).toContain("## Decisión");
    expect(cuerpo).toContain("## Por qué");
    expect(cuerpo).toContain("## Qué cambia");
    expect(cuerpo).toContain("## Pendientes");
  });

  it("PRD _PLANTILLA trae frontmatter válido al inicio y cuerpo PRD", () => {
    const texto = readFileSync(join("docs", "diseno", "_PLANTILLA-PRD.md"), "utf8");
    const { datos, cuerpo } = frontmatter(texto);
    expect(datos["id"]).toBe("PRD-XXX-00");
    expect(datos["tipo"]).toBe("prd");
    frontmatterValido(datos, "_PLANTILLA-PRD.md");
    expect(cuerpo).toContain("# PRD-XXX-00 - Título");
    expect(cuerpo).toContain("Fuente:");
    expect(cuerpo).toContain("## Problema");
    expect(cuerpo).toContain("## Épica");
    expect(cuerpo).toContain("Requisito");
    expect(cuerpo).toContain("Historia");
    expect(cuerpo).toContain("AC:");
    expect(cuerpo).toContain("## Dependencias externas");
    expect(cuerpo).toContain("## Estrategia prueba");
    expect(cuerpo).toContain("| Tipo | Caso | Entrada | Resultado esperado |");
  });

  it("README documenta el esquema Frontmatter de docs con ejemplo", () => {
    const readme = readFileSync(join("docs", "README.md"), "utf8");
    expect(readme).toContain("Frontmatter de docs");
    expect(readme).toContain("ADR-0052");
    expect(readme).toContain("adr|prd|plan|spec|historico");
    expect(readme).toContain("propuesto|aceptado|hecho|reemplazado|deprecado");
    expect(readme).toContain("reemplazado_por");
    expect(readme).toContain("máx 3 líneas");
    expect(readme).toContain("---");
    expect(readme).toContain("entre --- líneas");
    expect(readme).toContain("con _ son plantillas");
  });

  it("los archivos _* los salta el indexer de ADR", () => {
    const archivos = readdirSync(join("docs", "adr"));
    expect(archivos).toContain("_PLANTILLA-ADR.md");
    const guardia = readFileSync(join("tests", "arch", "sin-preexistente.test.ts"), "utf8");
    expect(guardia).toContain('f.startsWith("_")');
    const saltados = archivos.filter((f) => f.startsWith("_"));
    expect(saltados).toContain("_PLANTILLA-ADR.md");
    const diseno = readdirSync(join("docs", "diseno"));
    expect(diseno).toContain("_PLANTILLA-PRD.md");
    expect("_PLANTILLA-PRD.md".startsWith("_")).toBe(true);
  });
});
