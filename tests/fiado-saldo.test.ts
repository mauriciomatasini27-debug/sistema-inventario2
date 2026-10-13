import { describe, expect, it } from "vitest";
import {
  bucketizar,
  bucket_de,
  crear_movimiento,
  derivar_saldo,
  dias_atraso,
  estado_saldo,
  saldo_con_cache,
  verificar_cache,
  MS_POR_DIA,
} from "../src/modules/credit/saldos.js";

const DIA = MS_POR_DIA;
const HOY = 1_789_000_000_000;

function mov(tipo: "venta" | "cobro" | "devolucion" | "ajuste_debito" | "ajuste_credito" | "incobrable" | "inicial" | "reversion", debe: bigint, haber: bigint, key: string) {
  const r = crear_movimiento({ customerId: "cli-1", tipo, debeCentavos: debe, haberCentavos: haber, fecha: HOY, idempotencyKey: key });
  expect(r.ok).toBe(true);
  if (!r.ok) throw new Error("mov invalido en test");
  return r.movimiento;
}

describe("FC4 saldo SUM(debe-haber) + cache", () => {
  it("deriva saldo en centavos bigint sin floats", () => {
    const movs = [
      mov("venta", 30000n, 0n, "v1"),
      mov("venta", 20000n, 0n, "v2"),
      mov("cobro", 0n, 15000n, "c1"),
      mov("devolucion", 0n, 5000n, "d1"),
      mov("ajuste_debito", 1000n, 0n, "ad1"),
      mov("ajuste_credito", 0n, 500n, "ac1"),
      mov("incobrable", 0n, 500n, "i1"),
    ];
    expect(derivar_saldo(movs)).toBe(30000n);
    expect(derivar_saldo([])).toBe(0n);
  });

  it("supera 2^53 exacto (por eso bigint, ADR-0004)", () => {
    const grande = 10_000_000_000_000n; // $100M en centavos
    expect(derivar_saldo([mov("venta", grande, 0n, "g1"), mov("cobro", 0n, 1n, "g2")])).toBe(grande - 1n);
  });

  it("saldo_con_cache devuelve el valor a persistir en la misma tx", () => {
    const movs = [mov("venta", 30000n, 0n, "v1"), mov("cobro", 0n, 10000n, "c1")];
    const { saldo, cache } = saldo_con_cache(movs);
    expect(saldo).toBe(20000n);
    expect(cache).toBe(saldo);
  });

  it("verificar_cache reporta sin autocorregir", () => {
    expect(verificar_cache(20000n, 20000n)).toEqual({ ok: true, diferencia: 0n });
    const drift = verificar_cache(20000n, 15000n);
    expect(drift).toEqual({ ok: false, diferencia: 5000n });
    // Sin autocorrección: el caché sigue intacto, solo se reporta.
    expect(drift.diferencia).not.toBe(0n);
  });

  it("a favor online ok, offline a_revisar", () => {
    expect(estado_saldo(-500n, false)).toBe("ok");
    expect(estado_saldo(-500n, true)).toBe("a_revisar");
    expect(estado_saldo(0n, true)).toBe("ok");
    expect(estado_saldo(1000n, true)).toBe("ok");
  });

  it("constructor rechaza cero, negativo y doble lado", () => {
    expect(crear_movimiento({ customerId: "c", tipo: "venta", debeCentavos: 0n, haberCentavos: 0n, fecha: HOY, idempotencyKey: "x" })).toMatchObject({ status: 422 });
    expect(crear_movimiento({ customerId: "c", tipo: "venta", debeCentavos: -1n, haberCentavos: 0n, fecha: HOY, idempotencyKey: "x" })).toMatchObject({ status: 422 });
    expect(crear_movimiento({ customerId: "c", tipo: "venta", debeCentavos: 1n, haberCentavos: 1n, fecha: HOY, idempotencyKey: "x" })).toMatchObject({ status: 422 });
    expect(crear_movimiento({ customerId: "c", tipo: "reversion", debeCentavos: 1n, haberCentavos: 0n, fecha: HOY, idempotencyKey: "x" })).toMatchObject({ status: 422 });
  });
});

describe("FC7 buckets deterministas sin scoring", () => {
  it("dias_atraso piso por dia, futuro = 0", () => {
    expect(dias_atraso(HOY - 30 * DIA, HOY)).toBe(30);
    expect(dias_atraso(HOY - (30 * DIA + 1), HOY)).toBe(30);
    expect(dias_atraso(HOY + DIA, HOY)).toBe(0);
    expect(bucket_de(0)).toBe("0-30");
    expect(bucket_de(30)).toBe("0-30");
    expect(bucket_de(31)).toBe("31-60");
    expect(bucket_de(60)).toBe("31-60");
    expect(bucket_de(61)).toBe(">60");
  });

  it("clasifica 0-30/31-60/>60 con totales", () => {
    const r = bucketizar(
      [
        { id: "a", totalCentavos: 10000n, fecha: HOY - 5 * DIA },
        { id: "b", totalCentavos: 20000n, fecha: HOY - 30 * DIA },
        { id: "c", totalCentavos: 40000n, fecha: HOY - 45 * DIA },
        { id: "d", totalCentavos: 80000n, fecha: HOY - 90 * DIA },
      ],
      HOY,
    );
    expect(r.buckets["0-30"]).toEqual({ cantidad: 2, totalCentavos: 30000n });
    expect(r.buckets["31-60"]).toEqual({ cantidad: 1, totalCentavos: 40000n });
    expect(r.buckets[">60"]).toEqual({ cantidad: 1, totalCentavos: 80000n });
    expect(r.totalCentavos).toBe(150000n);
    expect(r.detalle).toHaveLength(4);
    // Determinista: misma entrada, misma salida.
    expect(bucketizar(
      [
        { id: "a", totalCentavos: 10000n, fecha: HOY - 5 * DIA },
        { id: "b", totalCentavos: 20000n, fecha: HOY - 30 * DIA },
        { id: "c", totalCentavos: 40000n, fecha: HOY - 45 * DIA },
        { id: "d", totalCentavos: 80000n, fecha: HOY - 90 * DIA },
      ],
      HOY,
    )).toEqual(r);
  });

  it("vacio da buckets en cero", () => {
    const r = bucketizar([], HOY);
    expect(r.totalCentavos).toBe(0n);
    expect(r.detalle).toEqual([]);
  });
});
