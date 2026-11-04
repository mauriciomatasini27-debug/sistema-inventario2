import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const caja = readFileSync(join(process.cwd(), "src/pages/panel/caja.astro"), "utf8");

function bloque(desde: string, hasta?: string): string {
  const inicio = caja.indexOf(desde);
  const fin = hasta ? caja.indexOf(hasta, inicio + desde.length) : caja.length;
  expect(inicio, desde).toBeGreaterThan(-1);
  expect(fin, hasta ?? "fin").toBeGreaterThan(inicio);
  return caja.slice(inicio, fin);
}

describe("P1-51: el dueño descarga el historial CSV desde /panel/caja", () => {
  it("el botón Exportar CSV está en últimos movimientos", () => {
    const tarjeta = bloque("<h2>Últimos movimientos</h2>", "<h2>Vencimientos de caja</h2>");
    expect(tarjeta).toContain('id="export-enviar" type="button"');
    expect(tarjeta).toContain(">Exportar CSV<");
    expect(tarjeta).toContain('id="estado-export"');
  });

  it("pide GET /api/cash/export sin query y baja caja-historial.csv", () => {
    const exportar = bloque('$("export-enviar").addEventListener', '$("drop-form").addEventListener');
    expect(exportar).toContain('fetch("/api/cash/export")');
    expect(exportar).not.toContain("/api/cash/export?");
    expect(exportar).not.toContain('method: "POST"');
    expect(exportar).toContain("r.blob()");
    expect(exportar).toContain("URL.createObjectURL");
    expect(exportar).toContain('a.download = "caja-historial.csv"');
    expect(exportar).toContain("URL.revokeObjectURL");
  });

  it("un 403, un 422 o un 503 usan textoError y un fallo de red avisa sin conexión", () => {
    const exportar = bloque('$("export-enviar").addEventListener', '$("drop-form").addEventListener');
    const error = exportar.indexOf("textoError(j.error, r.status)");
    expect(exportar.indexOf("if (!r.ok)")).toBeGreaterThan(-1);
    expect(error).toBeGreaterThan(exportar.indexOf("if (!r.ok)"));
    expect(exportar).toContain('mensaje("error", "")');
  });
});
