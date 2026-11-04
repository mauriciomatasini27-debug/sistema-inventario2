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

describe("P1-53: el dueño crea un vencimiento y lo paga desde /panel/caja", () => {
  it("la tarjeta pide concepto, fecha y hora, y monto", () => {
    const tarjeta = bloque("<h2>Vencimientos de caja</h2>", "<h2>Registrar movimiento</h2>");
    expect(tarjeta).toContain('id="venc-lista"');
    expect(tarjeta).toContain('id="estado-venc"');
    expect(tarjeta).toContain('id="venc-form"');
    expect(tarjeta).toContain('id="venc-concepto"');
    expect(tarjeta).toContain('data-campo="concepto"');
    expect(tarjeta).toContain('id="venc-vence"');
    expect(tarjeta).toContain('data-campo="vence_el"');
    expect(tarjeta).toContain('type="datetime-local"');
    expect(tarjeta).toContain('id="venc-monto"');
    expect(tarjeta).toContain('data-campo="monto_centavos"');
    expect(tarjeta).toContain('id="venc-enviar"');
    expect(tarjeta).toContain('id="estado-venc-form"');
  });

  it("lista con GET /api/cash/due-items y ofrece Pagar solo si no está pagada", () => {
    const lista = bloque("const cargarVencimientos", "const pagarVencimiento");
    expect(lista).toContain('fetch("/api/cash/due-items")');
    expect(lista).not.toContain("?id=");
    expect(lista).toContain("v.concepto");
    expect(lista).toContain("formatearCentavos(v.montoCentavos)");
    expect(lista).toContain("v.estado");
    expect(lista).toContain('v.estado !== "pagada"');
    expect(lista).toContain('boton.textContent = "Pagar"');
    expect(lista).toContain("Sin vencimientos de caja.");
    expect(lista).toContain('mensaje("error", "")');
  });

  it("confirma y manda PATCH /api/cash/due-items?id= con Idempotency-Key y sin metodo", () => {
    const pago = bloque("const pagarVencimiento", '$("venc-form").addEventListener');
    const patch = pago.indexOf('method: "PATCH"');
    expect(pago.indexOf("confirmar(")).toBeGreaterThan(-1);
    expect(patch).toBeGreaterThan(pago.indexOf("confirmar("));
    expect(pago).toContain('"/api/cash/due-items?id="');
    expect(pago).toContain("encodeURIComponent(v.id)");
    expect(pago).toContain("Idempotency-Key");
    expect(pago).toContain("crypto.randomUUID()");
    expect(pago).not.toContain("JSON.stringify");
    expect(pago).not.toContain("metodo");
    expect(pago).not.toContain('method: "GET"');
  });

  it("un 200 refresca lista, saldo y movimientos; un 409 dice que ya está pagado", () => {
    const pago = bloque("const pagarVencimiento", '$("venc-form").addEventListener');
    const ok = pago.indexOf("r.status === 200");
    const ya = pago.indexOf('j.error === "ya pagada"');
    expect(ok).toBeGreaterThan(-1);
    expect(ya).toBeGreaterThan(ok);
    const despues = pago.slice(ok, ya);
    expect(despues).toContain("cargarVencimientos()");
    expect(despues).toContain("cargarMovimientos()");
    expect(despues).toContain("cargarBalance()");
    expect(pago).toContain("Ese vencimiento ya está pagado.");
    expect(pago.slice(ya)).toContain("cargarVencimientos()");
    expect(pago).toContain("textoError(j.error, r.status)");
    expect(pago).toContain('mensaje("error", "")');
  });

  it("postea /api/cash/due-items con concepto, vence_el y monto, y un 201 refresca la lista", () => {
    const alta = bloque('$("venc-form").addEventListener', '$("mov-form").addEventListener');
    const post = alta.indexOf('fetch("/api/cash/due-items"');
    expect(post).toBeGreaterThan(-1);
    expect(alta).toContain('method: "POST"');
    expect(alta).toContain('"Content-Type": "application/json"');
    expect(alta).not.toContain("?id=");
    expect(alta).not.toContain("Idempotency-Key");
    const cuerpo = alta.slice(alta.indexOf("JSON.stringify("));
    expect(cuerpo).toContain("concepto,");
    expect(cuerpo).toContain("vence_el: vence");
    expect(cuerpo).toContain("monto_centavos: monto");
    expect(alta).toContain("isoDesdeLocal");
    const ok = alta.indexOf("r.status === 201");
    expect(ok).toBeGreaterThan(post);
    expect(alta.slice(ok)).toContain("cargarVencimientos()");
    expect(alta).toContain("erroresDesdeZod(j.error)");
    expect(alta).toContain("textoError(j.error, r.status)");
    expect(alta).toContain('mensaje("error", "")');
  });
});
