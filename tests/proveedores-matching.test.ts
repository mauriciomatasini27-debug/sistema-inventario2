import { describe, expect, it } from "vitest";
import {
  dentroTolerancia,
  matchearBorrador,
  type OrdenMatchable,
} from "../src/modules/purchases/matching.js";

const AHORA = "2026-10-10T12:00:00.000-03:00";
const CUIT = "30-12345678-1";

function oc(id: string, over: Partial<OrdenMatchable> = {}): OrdenMatchable {
  return {
    id,
    supplierCuit: CUIT,
    estado: "abierta",
    totalCentavos: 16_480_000n,
    ...over,
  };
}

describe("matching determinista borrador↔OC", () => {
  it("misma entrada siempre misma salida (sin IA)", () => {
    const args = { draftId: "borr-1", cuit: CUIT, totalCentavos: 16_480_000n, ordenes: [oc("oc-1")], ahoraIso: AHORA };
    expect(matchearBorrador(args)).toEqual(matchearBorrador(args));
  });

  it("match exacto mismo proveedor mismo monto", () => {
    const r = matchearBorrador({
      draftId: "borr-1",
      cuit: "30.12345678.1",
      totalCentavos: 16_480_000n,
      ordenes: [oc("oc-1")],
      ahoraIso: AHORA,
    });
    expect(r.candidatos).toHaveLength(1);
    expect(r.candidatos[0]).toMatchObject({ orderId: "oc-1", diferenciaCentavos: 0n });
    expect(r.log[0]).toMatchObject({ coincide: true });
  });

  it("tolerancia 1%: dentro matchea, fuera no", () => {
    const base = 10_000_000n;
    // 0.9% dentro, 1.5% fuera.
    expect(dentroTolerancia(10_090_000n, base)).toBe(true);
    expect(dentroTolerancia(10_100_000n, base)).toBe(true);
    expect(dentroTolerancia(10_150_000n, base)).toBe(false);
    const r = matchearBorrador({
      draftId: "borr-t",
      cuit: CUIT,
      totalCentavos: 10_090_000n,
      ordenes: [oc("oc-a", { totalCentavos: base }), oc("oc-b", { totalCentavos: base })],
      ahoraIso: AHORA,
      toleranciaPct: 1,
    });
    expect(r.candidatos).toHaveLength(2);
    const r2 = matchearBorrador({
      draftId: "borr-t",
      cuit: CUIT,
      totalCentavos: 10_150_000n,
      ordenes: [oc("oc-a", { totalCentavos: base })],
      ahoraIso: AHORA,
    });
    expect(r2.candidatos).toHaveLength(0);
    expect(r2.log[0]).toMatchObject({ coincide: false, motivo: expect.stringMatching(/tolerancia/) });
  });

  it("proveedor distinto y orden cerrada no matchean con motivo", () => {
    const r = matchearBorrador({
      draftId: "borr-2",
      cuit: CUIT,
      totalCentavos: 16_480_000n,
      ordenes: [
        oc("oc-otro", { supplierCuit: "20-00000000-1" }),
        oc("oc-cerrada", { estado: "cerrada" }),
      ],
      ahoraIso: AHORA,
    });
    expect(r.candidatos).toHaveLength(0);
    expect(r.log).toHaveLength(2);
    expect(r.log[0]).toMatchObject({ coincide: false, motivo: "proveedor distinto" });
    expect(r.log[1]).toMatchObject({ coincide: false, motivo: "orden cerrada" });
  });

  it("candidatos ordenados por diferencia asc y log cubre toda OC evaluada", () => {
    const r = matchearBorrador({
      draftId: "borr-3",
      cuit: CUIT,
      totalCentavos: 10_000_000n,
      ordenes: [
        oc("oc-lejos", { totalCentavos: 10_050_000n }),
        oc("oc-cerca", { totalCentavos: 10_010_000n }),
        oc("oc-otro", { supplierCuit: "20-00000000-1", totalCentavos: 10_000_000n }),
      ],
      ahoraIso: AHORA,
    });
    expect(r.candidatos.map((c) => c.orderId)).toEqual(["oc-cerca", "oc-lejos"]);
    expect(r.log).toHaveLength(3);
    expect(r.log.every((l) => l.draftId === "borr-3" && l.creadoEn === AHORA)).toBe(true);
    expect(Object.isFrozen(r.candidatos)).toBe(true);
  });

  it("tolerancia inválida lanza error de dominio", () => {
    expect(() => dentroTolerancia(1n, 1n, -1)).toThrow();
  });
});
