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

describe("P1-50: el dueño revierte un movimiento desde /panel/caja", () => {
  it("la tabla de últimos movimientos muestra el id para pegarlo en revierte_a", () => {
    expect(caja).toContain("<th>Id</th>");
    const historial = bloque("const cargarMovimientos", "const cargarVencimientos");
    expect(historial).toContain("celdas([m.id, m.tipo, m.metodo, formatearCentavos(m.monto_centavos), m.origen])");
  });

  it("la tarjeta pide el id, el motivo y quién lo carga, con actor panel-web", () => {
    const tarjeta = bloque("<h2>Revertir movimiento</h2>", "<h2>Cerrar jornada</h2>");
    expect(tarjeta).toContain('id="rev-form"');
    expect(tarjeta).toContain('id="rev-id"');
    expect(tarjeta).toContain('data-campo="revierte_a"');
    expect(tarjeta).toContain('data-campo="motivo"');
    expect(tarjeta).toContain('data-campo="actor"');
    expect(tarjeta).toContain('value="panel-web"');
    expect(tarjeta).toContain('id="rev-enviar"');
    expect(tarjeta).toContain('id="estado-rev"');
  });

  it("confirma y postea /api/cash/reversals con JSON y una Idempotency-Key", () => {
    const rev = bloque('$("rev-form").addEventListener', "cargarBalance();\n  cargarMovimientos();");
    const post = rev.indexOf('fetch("/api/cash/reversals"');
    expect(rev.indexOf("confirmar(")).toBeGreaterThan(-1);
    expect(post).toBeGreaterThan(rev.indexOf("confirmar("));
    expect(rev).toContain('method: "POST"');
    expect(rev).toContain('"Content-Type": "application/json"');
    expect(rev).toContain("Idempotency-Key");
    expect(rev).toContain("crypto.randomUUID()");
    const cuerpo = rev.slice(rev.indexOf("JSON.stringify("));
    expect(cuerpo).toContain("revierte_a:");
    expect(cuerpo).toContain("motivo:");
    expect(cuerpo).toContain("actor");
  });

  it("un 201 refresca el historial y el error usa textoError", () => {
    const rev = bloque('$("rev-form").addEventListener', "cargarBalance();\n  cargarMovimientos();");
    const ok = rev.indexOf("r.status === 201");
    const error = rev.indexOf("textoError(j.error, r.status)");
    expect(ok).toBeGreaterThan(-1);
    expect(error).toBeGreaterThan(ok);
    const despues = rev.slice(ok, error);
    expect(despues).toContain("movimiento_id");
    expect(despues).toContain("cargarMovimientos()");
    expect(rev).toContain("textoError(j.error, r.status)");
    expect(rev).toContain('mensaje("error", "")');
  });
});
