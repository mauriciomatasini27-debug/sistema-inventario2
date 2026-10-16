import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const RX_EVIDENCIA = /^##\s+Evidencia de aceptación/;
const RX_SECCION = /^##\s+/;
const RX_PREEXISTENTE = /preexistente/i;
const RX_ISSUE = /github\.com\/\S+\/(?:issues|pull)\/\d+|#\d+/;

// ADR aceptados antes de ARQ-S8 que ya documentan fallos pasados con la palabra.
// El trinquete rige para el contenido nuevo: un ADR fuera de esta lista no se acepta.
const PERMITIDOS: ReadonlySet<string> = new Set<string>([
  "0053-repos-dominio-sin-store.md",
  "0054-repos-fiscal-sin-store.md",
  "0055-repos-canales-sin-store.md",
  "0056-repo-caja-sin-store.md",
  "0057-repos-compras-pagos-sin-store.md",
  "0058-repos-servicios-fiado-sin-store.md",
  "0059-jobs-sin-store.md",
  "0060-repo-ocr-sin-store.md",
  "0061-repo-sync-sin-store.md",
  "0062-repos-catalogo-stock-sin-store.md",
  "0063-ventas-devoluciones-sin-store.md",
  "0066-dueno-real-y-correlativo-unico.md",
]);

export function extraerEvidencia(texto: string): string {
  const lineas = texto.split("\n");
  const inicio = lineas.findIndex((l) => RX_EVIDENCIA.test(l));
  if (inicio < 0) return "";
  let fin = lineas.findIndex((l, i) => i > inicio && RX_SECCION.test(l));
  if (fin < 0) fin = lineas.length;
  return lineas.slice(inicio, fin).join("\n");
}

export function evidenciaAceptable(texto: string): boolean {
  const seccion = extraerEvidencia(texto);
  if (seccion === "" || !RX_PREEXISTENTE.test(seccion)) return true;
  return RX_ISSUE.test(seccion);
}

describe("ARQ-S8 evidencia sin preexistente", () => {
  it("preexistente en Evidencia solo pasa con issue enlazado", () => {
    expect(evidenciaAceptable("## Evidencia de aceptación\n- 2 failed (caja-c11 preexistentes)\n")).toBe(false);
    expect(evidenciaAceptable("## Evidencia de aceptación\n- 2 failed, ver https://github.com/o/r/issues/12\n")).toBe(true);
    expect(evidenciaAceptable("## Evidencia de aceptación\n- 2 failed (ver #12), resto en verde\n")).toBe(true);
    expect(evidenciaAceptable("## Evidencia de aceptación\n- todo en verde\n")).toBe(true);
    expect(evidenciaAceptable("## Decisión\n- un fallo preexistente documentado\n")).toBe(true);
  });

  it("ignora un bloque frontmatter inicial al extraer Evidencia", () => {
    const fm =
      "---\n" +
      "id: ADR-0001\n" +
      "tipo: adr\n" +
      "estado: aceptado\n" +
      "modulos: []\n" +
      "depende_de: []\n" +
      "reemplaza: []\n" +
      'reemplazado_por: ""\n' +
      'resumen: ""\n' +
      "---\n";
    expect(extraerEvidencia(`${fm}## Evidencia de aceptación\n- todo en verde\n`)).toContain("todo en verde");
    expect(evidenciaAceptable(`${fm}## Evidencia de aceptación\n- 2 failed (caja-c11 preexistentes)\n`)).toBe(false);
    expect(evidenciaAceptable(`${fm}## Evidencia de aceptación\n- 2 failed, ver #12\n`)).toBe(true);
  });

  it("ningún ADR nuevo usa preexistente sin issue en Evidencia", () => {
    const mal: string[] = [];
    for (const f of readdirSync(join("docs", "adr"))) {
      if (!f.endsWith(".md") || f.startsWith("_") || PERMITIDOS.has(f)) continue;
      const texto = readFileSync(join("docs", "adr", f), "utf8");
      if (!evidenciaAceptable(texto)) mal.push(f);
    }
    expect(
      mal,
      mal.length > 0
        ? `Evidencia con "preexistente" sin issue enlazado: el fallo se arregla o trae https://github.com/<org>/<repo>/issues/N o #N:\n${mal.join("\n")}`
        : "",
    ).toEqual([]);
  });
});
