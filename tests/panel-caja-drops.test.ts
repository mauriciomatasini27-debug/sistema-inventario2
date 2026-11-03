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

describe("P1-49: el dueño registra un retiro desde /panel/caja", () => {
  it("la tarjeta pide jornada, monto, motivo, quién lo carga y si el conteo es sorpresa", () => {
    expect(caja).toContain("Retiro a caja fuerte");
    expect(caja).toContain('id="drop-form"');
    expect(caja).toContain('data-campo="fecha_jornada"');
    expect(caja).toContain('data-campo="monto_centavos"');
    expect(caja).toContain('data-campo="motivo"');
    expect(caja).toContain('data-campo="creado_por"');
    expect(caja).toContain('value="panel-web"');
    expect(caja).toContain('id="drop-sorpresa" type="checkbox"');
    expect(caja).toContain('$("drop-fecha").value = fechaJornada');
  });

  it("confirma y postea /api/cash/drops con JSON y una Idempotency-Key", () => {
    const drop = bloque('$("drop-form").addEventListener', '$("turno-form").addEventListener');
    const post = drop.indexOf('fetch("/api/cash/drops"');
    expect(drop.indexOf("confirmar(")).toBeGreaterThan(-1);
    expect(post).toBeGreaterThan(drop.indexOf("confirmar("));
    expect(drop).toContain('"Content-Type": "application/json"');
    expect(drop).toContain("Idempotency-Key");
    expect(drop).toContain("crypto.randomUUID()");
    const cuerpo = drop.slice(drop.indexOf("JSON.stringify("));
    expect(cuerpo).toContain("fecha_jornada:");
    expect(cuerpo).toContain("monto_centavos:");
    expect(cuerpo).toContain("motivo:");
    expect(cuerpo).toContain("creado_por:");
    expect(cuerpo).toMatch(/sorpresa\s*[,:]/);
  });

  it("un 201 muestra el drop_id y refresca saldo e historial; el error usa textoError", () => {
    const drop = bloque('$("drop-form").addEventListener', '$("turno-form").addEventListener');
    const ok = drop.indexOf("r.status === 201");
    expect(ok).toBeGreaterThan(-1);
    const despues = drop.slice(ok, ok + 280);
    expect(despues).toContain("drop_id");
    expect(despues).toContain("cargarBalance()");
    expect(despues).toContain("cargarMovimientos()");
    expect(drop).toContain('textoError(j.error, r.status)');
    expect(drop).toContain('mensaje("error", "")');
  });
});
