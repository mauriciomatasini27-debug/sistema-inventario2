import { describe, expect, it } from "vitest";
import { derivar_balance, type Movimiento } from "../src/modules/cash/caja.js";
import { revertir_movimiento, type AuditEntry, type ReversionOk } from "../src/modules/cash/reversion.js";

type MovConId = Movimiento & { id: string };

function movsBase(): Map<string, MovConId> {
  return new Map<string, MovConId>([
    ["m1", { id: "m1", tipo: "egreso", metodo: "Efectivo", monto_centavos: 15000n, origen: "venta" }],
    ["m2", { id: "m2", tipo: "ingreso", metodo: "QR", monto_centavos: 5000n, origen: "cobro_fiado" }],
  ]);
}

function ctx() {
  return {
    movimientos: movsBase(),
    reversiones: new Map<string, string>(),
    vistos: new Map<string, ReversionOk>(),
    auditoria: [] as AuditEntry[],
  };
}

describe("C7 reversión por movimiento opuesto", () => {
  it("revierte con tipo opuesto, mismo monto y metodo (201)", () => {
    const r = revertir_movimiento({ idempotencyKey: "rev-1", revierteA: "m1", motivo: "cobro duplicado", actor: "duena", ...ctx() });
    expect(r.status).toBe(201);
    if (r.status !== 201) return;
    expect(r.movimiento.tipo).toBe("ingreso");
    expect(r.movimiento.monto_centavos).toBe(15000n);
    expect(r.movimiento.metodo).toBe("Efectivo");
    expect(r.movimiento.revierteA).toBe("m1");
  });

  it("el compensatorio anula el efecto en el balance derivado", () => {
    const c = ctx();
    const r = revertir_movimiento({ idempotencyKey: "rev-b", revierteA: "m1", actor: "duena", ...c });
    expect(r.status).toBe(201);
    const balance = derivar_balance([...c.movimientos.values()]);
    // m1 egreso 15000 + compensatorio ingreso 15000 + m2 ingreso 5000.
    expect(balance.porMedio["Efectivo"]).toBe(0n);
    expect(balance.total).toBe(5000n);
  });

  it("revierte_a único: segunda reversión del mismo es 409", () => {
    const c = ctx();
    expect(revertir_movimiento({ idempotencyKey: "rev-a", revierteA: "m1", actor: "duena", ...c }).status).toBe(201);
    const r2 = revertir_movimiento({ idempotencyKey: "rev-b", revierteA: "m1", actor: "duena", ...c });
    expect(r2).toMatchObject({ status: 409 });
  });

  it("revierte_a inexistente es 422", () => {
    const r = revertir_movimiento({ idempotencyKey: "rev-x", revierteA: "nope", actor: "duena", ...ctx() });
    expect(r).toMatchObject({ status: 422 });
  });

  it("misma Idempotency-Key devuelve 409 con el original (E3)", () => {
    const c = ctx();
    const input = { revierteA: "m2", actor: "duena", ...c };
    expect(revertir_movimiento({ ...input, idempotencyKey: "dup" }).status).toBe(201);
    const r2 = revertir_movimiento({ ...input, idempotencyKey: "dup" });
    expect(r2.status).toBe(409);
    if (r2.status === 409) expect(r2.original?.movimiento.revierteA).toBe("m2");
  });

  it("sin actor es 422 y la original queda intacta (inmutable)", () => {
    const c = ctx();
    const antes = c.movimientos.get("m1");
    const r = revertir_movimiento({ idempotencyKey: "rev-s", revierteA: "m1", actor: "", ...c });
    expect(r).toMatchObject({ status: 422 });
    expect(c.movimientos.get("m1")).toEqual(antes);
  });

  it("cada reversión deja entrada en cash_audit_log", () => {
    const c = ctx();
    const r = revertir_movimiento({ idempotencyKey: "rev-audit", revierteA: "m1", motivo: "error de carga", actor: "duena", ...c });
    expect(r.status).toBe(201);
    expect(c.auditoria).toHaveLength(1);
    expect(c.auditoria[0]).toMatchObject({ accion: "reversion", revierteA: "m1", actor: "duena", motivo: "error de carga" });
    if (r.status === 201) expect(r.auditoria.movimientoId).toBe(r.movimiento.id);
  });
});
