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

describe("P1-52: el dueño lista, carga y deshace un comprobante QR desde /panel/caja", () => {
  it("la tarjeta pide número y monto, y dice que el origen es manual", () => {
    const tarjeta = bloque("<h2>Comprobantes QR</h2>", "<h2>Retiro a caja fuerte</h2>");
    expect(tarjeta).toContain('id="qr-form"');
    expect(tarjeta).toContain('id="qr-numero"');
    expect(tarjeta).toContain('data-campo="numero_operacion"');
    expect(tarjeta).toContain('id="qr-monto"');
    expect(tarjeta).toContain('data-campo="monto_centavos"');
    expect(tarjeta).toContain('id="qr-body"');
    expect(tarjeta).toContain('id="estado-qr-lista"');
    expect(tarjeta).toContain('id="qr-enviar"');
    expect(tarjeta).toContain('id="estado-qr"');
    expect(tarjeta).toContain("El origen queda como carga manual.");
    expect(tarjeta).not.toContain("fecha_operacion");
    expect(tarjeta).not.toContain("sin_comprobante");
    expect(tarjeta).not.toContain("bot");
    expect(tarjeta).not.toContain("gmail");
  });

  it("lista con GET /api/cash/qr y sin filtro", () => {
    const lista = bloque("const cargarQr", "const deshacerComprobante");
    expect(lista).toContain('fetch("/api/cash/qr")');
    expect(lista).not.toContain('fetch("/api/cash/qr?');
    expect(lista).not.toContain("filtro");
    expect(lista).toContain("q.numeroOperacion");
    expect(lista).toContain("formatearCentavos(q.montoCentavos)");
    expect(lista).toContain("q.estado");
    expect(lista).toContain("q.origen");
    expect(lista).toContain('boton.textContent = "Deshacer"');
    expect(lista).toContain("Sin comprobantes QR.");
    expect(lista).toContain('mensaje("error", "")');
  });

  it("confirma y postea /api/cash/qr con origen manual y una Idempotency-Key", () => {
    const alta = bloque('$("qr-form").addEventListener', "void Promise.all([");
    const post = alta.indexOf('fetch("/api/cash/qr"');
    expect(alta.indexOf("confirmar(")).toBeGreaterThan(-1);
    expect(post).toBeGreaterThan(alta.indexOf("confirmar("));
    expect(alta).toContain('method: "POST"');
    expect(alta).toContain('"Content-Type": "application/json"');
    expect(alta).toContain("Idempotency-Key");
    expect(alta).toContain("crypto.randomUUID()");
    const cuerpo = alta.slice(alta.indexOf("JSON.stringify("));
    expect(cuerpo).toContain("numero_operacion:");
    expect(cuerpo).toContain("monto_centavos:");
    expect(cuerpo).toContain('origen: "manual"');
    expect(cuerpo).not.toContain("fecha_operacion");
    expect(cuerpo).not.toContain('"bot"');
    expect(cuerpo).not.toContain('"gmail"');
    expect(cuerpo).not.toContain("filtro");
  });

  it("un 201 refresca la lista y un 409 de duplicado dice que el número ya está cargado", () => {
    const alta = bloque('$("qr-form").addEventListener', "void Promise.all([");
    const ok = alta.indexOf("r.status === 201");
    const duplicado = alta.indexOf('j.error === "ya registrado"');
    expect(ok).toBeGreaterThan(-1);
    expect(duplicado).toBeGreaterThan(ok);
    expect(alta.slice(ok, duplicado)).toContain("cargarQr()");
    expect(alta).toContain("Ese número de operación ya está cargado.");
    expect(alta).toContain("textoError(j.error, r.status)");
    expect(alta).toContain('mensaje("error", "")');
  });

  it("deshacer confirma y manda DELETE /api/cash/qr con el número", () => {
    const undo = bloque("const deshacerComprobante", '$("qr-form").addEventListener');
    const post = undo.indexOf('method: "DELETE"');
    expect(undo.indexOf("confirmar(")).toBeGreaterThan(-1);
    expect(post).toBeGreaterThan(undo.indexOf("confirmar("));
    expect(undo).toContain('"/api/cash/qr?numero_operacion="');
    expect(undo).toContain("encodeURIComponent(numero)");
    const ok = undo.indexOf("r.status === 200");
    expect(ok).toBeGreaterThan(post);
    expect(undo.slice(ok)).toContain("cargarQr()");
    expect(undo).toContain("textoError(j.error, r.status)");
    expect(undo).toContain('mensaje("error", "")');
  });
});
