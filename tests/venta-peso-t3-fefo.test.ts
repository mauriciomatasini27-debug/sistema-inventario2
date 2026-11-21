import { describe, expect, it } from "vitest";
import { descontar, type Lote, type LotId, type Sku } from "../src/modules/inventario/inventario.js";
import { vender_mostrador, type TicketEmitido, type VenderMostradorInput } from "../src/modules/sales/vender_mostrador.js";
import { resetStore, store } from "../src/lib/store.js";
import { POST as postSales } from "../src/pages/api/sales.js";
import { ctx } from "./helpers/ctx.js";

const sku = (s: string) => s as Sku;
const lot = (s: string) => s as LotId;
const lote = (id: string, s: string, cantidad: number, venceEl: Date | null = null): Lote => ({
  id: lot(id),
  sku: sku(s),
  cantidad,
  venceEl,
  costoCentavos: 1000n,
});

const CUANDO = "2026-11-21T12:00:00.000-03:00";

function base(over: Partial<VenderMostradorInput> = {}): VenderMostradorInput {
  return {
    idempotencyKey: "k-t3-" + Math.random().toString(36).slice(2),
    lineas: [{ sku: sku("PAPAS"), cantidad: 1250, precioCentavos: 5000n, porPeso: true }],
    medio: "Efectivo",
    deviceCode: "KIOSCO-01",
    seqLocal: 41,
    offline: false,
    lotes: [lote("l1", "PAPAS", 5000)],
    vistos: new Map<string, TicketEmitido>(),
    ultimoDefinitivo: { n: 128 },
    grant: { rol: "dueno" },
    ...over,
  };
}

describe("T3 #387 FEFO por gramos con consumo parcial entre lotes", () => {
  it("una venta mayor al lote viejo consume ese lote completo y el resto del siguiente", () => {
    const r = vender_mostrador(
      base({
        lotes: [
          lote("viejo", "PAPAS", 1000, new Date("2026-11-25T00:00:00Z")),
          lote("nuevo", "PAPAS", 500, new Date("2026-12-20T00:00:00Z")),
        ],
      }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.efecto.descuentos).toEqual([
      { loteId: "viejo", sku: "PAPAS", cantidad: 1000 },
      { loteId: "nuevo", sku: "PAPAS", cantidad: 250 },
    ]);
    expect(r.efecto.movimientosStock.map((m) => ({ loteId: m.loteId, delta: m.delta }))).toEqual([
      { loteId: "viejo", delta: -1000 },
      { loteId: "nuevo", delta: -250 },
    ]);
    expect(r.efecto.egreso.monto_centavos).toBe(6250n);
  });

  it("el consumo parcial no redondea ni deja cantidades negativas en ningún lote", () => {
    const r = descontar({
      lotes: [
        lote("a", "PAPAS", 1000, new Date("2026-11-25T00:00:00Z")),
        lote("b", "PAPAS", 333, new Date("2026-12-01T00:00:00Z")),
        lote("c", "PAPAS", 777, new Date("2026-12-20T00:00:00Z")),
      ],
      lineas: [{ sku: sku("PAPAS"), cantidad: 1250, porPeso: true }],
      modo: "ONLINE",
      idemKey: "k-t3-parcial",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const tomas = r.valor.descuentos.map((d) => d.cantidad);
    expect(tomas).toEqual([1000, 250]);
    expect(tomas.every((n) => Number.isInteger(n) && n > 0)).toBe(true);
    const porLote = new Map(r.valor.descuentos.map((d) => [d.loteId as string, d.cantidad]));
    expect(porLote.get("a")).toBeLessThanOrEqual(1000);
    expect(porLote.get("b")).toBeLessThanOrEqual(333);
    expect(porLote.has("c")).toBe(false);
    expect(r.valor.movimientos.reduce((s, m) => s + m.delta, 0)).toBe(-1250);
  });

  it("FEFO ordena vencimiento ASC y deja los lotes sin vencimiento al final", () => {
    const r = descontar({
      lotes: [
        lote("sin-vence", "PAPAS", 400, null),
        lote("tarde", "PAPAS", 400, new Date("2026-12-20T00:00:00Z")),
        lote("temprano", "PAPAS", 400, new Date("2026-11-25T00:00:00Z")),
      ],
      lineas: [{ sku: sku("PAPAS"), cantidad: 900, porPeso: true }],
      modo: "ONLINE",
      idemKey: "k-t3-orden",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.valor.descuentos.map((d) => d.loteId)).toEqual(["temprano", "tarde", "sin-vence"]);
    expect(r.valor.descuentos.map((d) => d.cantidad)).toEqual([400, 400, 100]);
  });

  it("un solo lote descuenta todo el peso pedido y deja el resto", () => {
    const r = vender_mostrador(base({ lotes: [lote("unico", "PAPAS", 5000)] }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.efecto.descuentos).toEqual([{ loteId: "unico", sku: "PAPAS", cantidad: 1250 }]);
    expect(r.efecto.movimientosStock).toHaveLength(1);
    expect(5000 - r.efecto.descuentos[0]!.cantidad).toBe(3750);
  });
});

describe("T3 #387 sin peso suficiente: SIN_STOCK sin escribir movimientos", () => {
  it("el núcleo rechaza SIN_STOCK y no devuelve descuentos ni movimientos", () => {
    const r = vender_mostrador(base({ lotes: [lote("l1", "PAPAS", 1000)] }));
    expect(r).toMatchObject({ ok: false, codigo: "SIN_STOCK", status: 422 });
    expect(r.ok).toBe(false);
  });

  it("con dos lotes que no alcanzan tampoco hay efectos parciales", () => {
    const d = descontar({
      lotes: [lote("a", "PAPAS", 600), lote("b", "PAPAS", 400)],
      lineas: [{ sku: sku("PAPAS"), cantidad: 1250, porPeso: true }],
      modo: "ONLINE",
      idemKey: "k-t3-sin-stock",
    });
    expect(d).toEqual({ ok: false, codigo: "SIN_STOCK" });
  });

  it("la venta rechazada no muta stock ni escribe movimientos en el adaptador", async () => {
    delete process.env.TENANT_MODE;
    delete process.env.TENANT_DATABASE_URL;
    resetStore();
    store.stock.set("VP-T3-SIN", 1000);
    const antesMoves = store.stockMoves.length;
    const antesTickets = store.ticketLineas.length;
    const r = (await postSales(
      ctx("http://localhost/api/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
        body: {
          medio: "Efectivo",
          device_code: "caja-01",
          seq_local: 7,
          client_occurred_at: CUANDO,
          offline: false,
          lineas: [{ product_id: "VP-T3-SIN", qty: 1250, precio_centavos: 5000, por_peso: true }],
        },
      }),
    )) as Response;
    expect(r.status).toBe(422);
    expect(((await r.json()) as { error: string }).error).toBe("stock insuficiente");
    expect(store.stock.get("VP-T3-SIN")).toBe(1000);
    expect(store.stockMoves).toHaveLength(antesMoves);
    expect(store.ticketLineas).toHaveLength(antesTickets);
  });
});
