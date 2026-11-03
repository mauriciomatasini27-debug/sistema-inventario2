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

describe("P1-43: el dueño abre, concilia y resuelve desde /panel/caja", () => {
  it("abrir manda la jornada y una Idempotency-Key, y borra el esperado de la pantalla", () => {
    const abrir = bloque('$("turno-form").addEventListener', '$("conciliar-form").addEventListener');
    expect(abrir).toContain('fetch("/api/cash/shifts"');
    expect(abrir).toContain("Idempotency-Key");
    expect(abrir).toContain("fecha_jornada: fechaJornada");
    expect(abrir).toContain("esperado_centavos: esperado");
    expect(abrir).toContain('$("turno-esperado").value = ""');
    expect(abrir).not.toMatch(/\/api\/cash\/shifts\//);
  });

  it("conciliar confirma, manda el desglose y no reenvía el esperado", () => {
    const conciliar = bloque('$("conciliar-form").addEventListener', '$("resolver-form").addEventListener');
    const post = conciliar.indexOf('fetch("/api/cash/shifts/conciliate"');
    expect(conciliar.indexOf("confirmar(")).toBeGreaterThan(-1);
    expect(post).toBeGreaterThan(conciliar.indexOf("confirmar("));
    expect(conciliar).toContain("Idempotency-Key");
    expect(conciliar).toContain("contado_centavos: contado");
    expect(conciliar).toContain("conteos_por_medio: conteos");
    expect(conciliar).not.toContain("esperado");
  });

  it("resolver confirma y el body no trae rol", () => {
    const resolver = bloque('$("resolver-form").addEventListener');
    const post = resolver.indexOf('fetch("/api/cash/shifts/resolve"');
    expect(resolver.indexOf("confirmar(")).toBeGreaterThan(-1);
    expect(post).toBeGreaterThan(resolver.indexOf("confirmar("));
    expect(resolver).toContain("resuelto_por: quien");
    expect(resolver).toContain("nota,");
    expect(resolver).not.toMatch(/rol\s*:/);
    expect(resolver).not.toContain("Idempotency-Key");
  });

  it("el cierre de jornada sigue en la página y no aparecen reversas, export ni qr", () => {
    expect(caja).toContain('fetch("/api/cash/close"');
    expect(caja).toContain('close_type: "manual"');
    for (const ruta of ["/api/cash/reversals", "/api/cash/export", "/api/cash/qr"]) {
      expect(caja).not.toContain(ruta);
    }
  });
});
