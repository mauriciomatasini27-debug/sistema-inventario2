import { describe, expect, it } from "vitest";
import {
  siguiente_numero,
  vender_mostrador,
  LEYENDA_NO_FISCAL,
  type TicketEmitido,
  type VenderMostradorInput,
} from "../src/modules/sales/vender_mostrador.js";
import type { Lote, LotId, Sku } from "../src/modules/inventario/inventario.js";

const sku = (s: string) => s as Sku;
const lot = (s: string) => s as LotId;
const lote = (id: string, s: string, cantidad: number, venceEl: Date | null = null): Lote => ({
  id: lot(id),
  sku: sku(s),
  cantidad,
  venceEl,
  costoCentavos: 1000n,
});

function base(over: Partial<VenderMostradorInput> = {}): VenderMostradorInput {
  return {
    idempotencyKey: "k-" + Math.random().toString(36).slice(2),
    lineas: [{ sku: sku("YERBA"), cantidad: 2, precioCentavos: 15000n }],
    medio: "Efectivo",
    deviceCode: "KIOSCO-01",
    seqLocal: 41,
    offline: false,
    lotes: [lote("l1", "YERBA", 10)],
    vistos: new Map<string, TicketEmitido>(),
    ultimoDefinitivo: { n: 128 },
    grant: { rol: "dueno" },
    ...over,
  };
}

describe("vender_mostrador", () => {
  it("siguiente_numero correlativo sin huecos", () => {
    expect(siguiente_numero(null)).toBe("T-000001");
    expect(siguiente_numero({ n: 128 })).toBe("T-000129");
  });

  it("online feliz compone FEFO + ticket + egreso con leyenda", () => {
    const r = vender_mostrador(
      base({ lotes: [lote("tarde", "YERBA", 10, new Date("2027-01-01")), lote("pronto", "YERBA", 10, new Date("2026-01-01"))] }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.efecto.ticket).toMatchObject({ kind: "online", definitivo: "T-000129", provisorio: "KIOSCO-01-41", leyenda: LEYENDA_NO_FISCAL });
    expect(r.efecto.descuentos.map((d) => d.loteId)).toEqual(["pronto"]);
    expect(r.efecto.egreso).toMatchObject({ tipo: "egreso", origen: "venta", monto_centavos: 30000n });
    expect(r.efecto.movimientosStock).toHaveLength(1);
    expect(r.efecto.vistoARegistrar.key).toBeDefined();
  });

  it("no muta los vistos de entrada", () => {
    const vistos = new Map<string, TicketEmitido>();
    const r = vender_mostrador(base({ idempotencyKey: "nm-1", vistos }));
    expect(r.ok).toBe(true);
    expect(vistos.size).toBe(0);
  });

  it("retry idéntico devuelve 409 sin consumir número", () => {
    const vistos = new Map<string, TicketEmitido>();
    const r1 = vender_mostrador(base({ idempotencyKey: "doble-1", vistos, ultimoDefinitivo: { n: 5 } }));
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;
    vistos.set("doble-1", r1.efecto.ticket);
    const r2 = vender_mostrador(base({ idempotencyKey: "doble-1", vistos, ultimoDefinitivo: { n: 6 } }));
    expect(r2).toMatchObject({ ok: false, codigo: "YA_VISTA", status: 409 });
    if (r2.ok || r2.codigo !== "YA_VISTA") return;
    expect(r2.original.definitivo).toBe("T-000006");
  });

  it("offline sin stock da provisorio + faltantes sin definitivo", () => {
    const r = vender_mostrador(base({ offline: true, lotes: [lote("l1", "YERBA", 1)], ultimoDefinitivo: { n: 9 } }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.efecto.ticket.definitivo).toBeNull();
    expect(r.efecto.ticket.sobreventa).toBe(true);
    expect(r.efecto.faltantes).toEqual([{ sku: "YERBA", faltante: 1 }]);
  });

  it("online sin stock revierte todo", () => {
    const r = vender_mostrador(base({ lotes: [lote("l1", "YERBA", 1)] }));
    expect(r).toMatchObject({ ok: false, codigo: "SIN_STOCK", status: 422 });
  });

  it("total cero es línea inválida, no ticket gratis", () => {
    const r = vender_mostrador(base({ lineas: [{ sku: sku("YERBA"), cantidad: 1, precioCentavos: 0n }] }));
    expect(r).toMatchObject({ ok: false, codigo: "LINEA_INVALIDA", status: 422 });
  });
});
