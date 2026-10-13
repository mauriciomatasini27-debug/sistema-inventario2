import { describe, expect, it } from "vitest";
import {
  descontar,
  ingresar,
  normalizarCodigo,
  resolverCodigo,
  type CodigoProducto,
  type Lote,
  type LotId,
  type Sku,
} from "../src/modules/inventario/inventario.js";

const sku = (s: string) => s as Sku;
const lot = (s: string) => s as LotId;

function lote(id: string, s: string, cantidad: number, venceEl: Date | null = null): Lote {
  return { id: lot(id), sku: sku(s), cantidad, venceEl, costoCentavos: 1000n };
}

describe("núcleo inventario FEFO", () => {
  it("consume primero el lote que vence antes", () => {
    const r = descontar({
      lotes: [lote("l-tarde", "YERBA", 10, new Date("2027-01-01")), lote("l-pronto", "YERBA", 10, new Date("2026-01-01"))],
      lineas: [{ sku: sku("YERBA"), cantidad: 5 }],
      modo: "ONLINE",
      idemKey: "k1",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.valor.descuentos).toHaveLength(1);
    expect(r.valor.descuentos[0]?.loteId).toBe("l-pronto");
    expect(r.valor.movimientos[0]).toMatchObject({ idemKey: "k1", tipo: "VENTA", delta: -5 });
  });

  it("lote sin vencimiento va último (NULLS LAST)", () => {
    const r = descontar({
      lotes: [lote("l-sin", "YERBA", 10), lote("l-con", "YERBA", 10, new Date("2026-06-01"))],
      lineas: [{ sku: sku("YERBA"), cantidad: 12 }],
      modo: "ONLINE",
      idemKey: "k2",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.valor.descuentos.map((d) => [d.loteId, d.cantidad])).toEqual([
      ["l-con", 10],
      ["l-sin", 2],
    ]);
  });

  it("online sin stock revierte todo (422, sin parcial)", () => {
    const r = descontar({
      lotes: [lote("l1", "YERBA", 2)],
      lineas: [{ sku: sku("YERBA"), cantidad: 5 }],
      modo: "ONLINE",
      idemKey: "k3",
    });
    expect(r).toMatchObject({ ok: false, codigo: "SIN_STOCK" });
  });

  it("offline acepta y marca sobreventa sin bloquear (E2)", () => {
    const r = descontar({
      lotes: [lote("l1", "YERBA", 2)],
      lineas: [{ sku: sku("YERBA"), cantidad: 5 }],
      modo: "OFFLINE_PERMITIDO",
      idemKey: "k4",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.valor.sobreventa).toEqual([{ sku: "YERBA", faltante: 3 }]);
    expect(r.valor.movimientos).toHaveLength(1);
  });

  it("línea inválida no descuenta nada", () => {
    const r1 = descontar({ lotes: [lote("l1", "A", 5)], lineas: [{ sku: sku("A"), cantidad: 0 }], modo: "ONLINE", idemKey: "k" });
    expect(r1.ok).toBe(false);
    if (!r1.ok) expect(r1.codigo).toBe("LINEA_INVALIDA");
    const r2 = descontar({ lotes: [], lineas: [], modo: "ONLINE", idemKey: "k" });
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.codigo).toBe("LINEA_INVALIDA");
  });

  it("ingresar valida qty y costo, emite ALTA por lote", () => {
    const ok = ingresar({
      altas: [{ id: lot("n1"), sku: sku("A"), cantidad: 3, venceEl: null, costoCentavos: 500n }],
      idemKey: "alta-1",
    });
    expect(ok.ok).toBe(true);
    if (!ok.ok) return;
    expect(ok.valor.movimientos).toMatchObject([{ idemKey: "alta-1", tipo: "ALTA", delta: 3 }]);
    const badQty = ingresar({ altas: [{ id: lot("n2"), sku: sku("A"), cantidad: 0, venceEl: null, costoCentavos: 0n }], idemKey: "x" });
    expect(badQty.ok).toBe(false);
    if (!badQty.ok) expect(badQty.codigo).toBe("LOTE_INVALIDO");
    const badCost = ingresar({ altas: [{ id: lot("n3"), sku: sku("A"), cantidad: 1, venceEl: null, costoCentavos: -1n }], idemKey: "x" });
    expect(badCost.ok).toBe(false);
    if (!badCost.ok) expect(badCost.codigo).toBe("LOTE_INVALIDO");
  });

  it("resolverCodigo normaliza y desconoce con null", () => {
    const codigos: CodigoProducto[] = [{ codigo: "750123", sku: sku("YERBA"), padre: null }];
    expect(resolverCodigo(codigos, " 750123 ")).toBe("YERBA");
    expect(resolverCodigo(codigos, "750124")).toBeNull();
    expect(normalizarCodigo(" ab-12 ")).toBe("AB-12");
  });
});
