import { describe, expect, it } from "vitest";
import {
  disponibleCentavos,
  limiteDesdeFicha,
  motivoTope,
  resolverCredito,
  supera_limite,
  type CreditoResuelto,
} from "../src/modules/credit/limite.js";

function credito(tope: bigint, saldo: bigint, rol: "dueno" | "empleado" = "empleado"): CreditoResuelto {
  const r = resolverCredito({ customerId: "cli-1", topeAlmacenado: tope, saldoCentavos: saldo, rol });
  if (!r.ok) throw new Error(r.codigo);
  return r.valor;
}

describe("límite de ficha", () => {
  it("tope 0 es abierto y no bloquea ni un saldo enorme", () => {
    const limite = limiteDesdeFicha(0n);
    expect(limite).toEqual({ kind: "abierto" });
    if ("ok" in limite) return;
    expect(supera_limite(9_000_000_000n, limite)).toBe(false);
    expect(disponibleCentavos(credito(0n, 9_000_000_000n))).toBeNull();
  });

  it("el techo supera solo si el saldo nuevo pasa el centavo, y ese predicado frena al empleado", () => {
    const limite = limiteDesdeFicha(10_000n);
    expect(limite).toEqual({ kind: "techo", centavos: 10_000n });
    if ("ok" in limite) return;
    expect(supera_limite(10_000n, limite)).toBe(false);
    expect(supera_limite(10_001n, limite)).toBe(true);
    const empleado = credito(10_000n, 9_000n, "empleado");
    expect(supera_limite(empleado.saldoCentavos + 2_000n, empleado.limite)).toBe(true);
    expect(empleado.rol).toBe("empleado");
    expect(disponibleCentavos(empleado)).toBe(1_000n);
    expect(disponibleCentavos(credito(10_000n, 12_000n))).toBe(0n);
    expect(disponibleCentavos(credito(100n, -50n))).toBe(150n);
  });

  it("un tope negativo es ficha corrupta y no se vende", () => {
    expect(limiteDesdeFicha(-1n)).toEqual({ ok: false, codigo: "TOPE_CORRUPTO", status: 422 });
    expect(resolverCredito({ customerId: "cli-1", topeAlmacenado: -1n, saldoCentavos: 0n, rol: "dueno" })).toEqual({
      ok: false,
      codigo: "TOPE_CORRUPTO",
      status: 422,
    });
  });

  it("un id vacío no arma crédito", () => {
    expect(resolverCredito({ customerId: "  ", topeAlmacenado: 0n, saldoCentavos: 0n, rol: "empleado" })).toEqual({
      ok: false,
      codigo: "FICHA_INVALIDA",
      status: 422,
    });
  });

  it("el bot usa la misma lectura: tope 0 no es deudor por tope, el negativo tampoco", () => {
    expect(motivoTope(900_000n, 0n)).toBe(false);
    expect(motivoTope(150_000n, 100_000n)).toBe(true);
    expect(motivoTope(100_000n, 100_000n)).toBe(false);
    expect(motivoTope(1n, -5n)).toBe(false);
  });
});
