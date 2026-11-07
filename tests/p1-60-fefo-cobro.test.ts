import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asc, eq, inArray } from "drizzle-orm";
import { customerMovements } from "../src/db/schema-credito.js";
import {
  cashMovements,
  products,
  sales,
  stockLots,
  stockMovements,
  ticketLines,
  ticketPayments,
  tickets,
} from "../src/db/schema.js";
import { ticketDiscounts } from "../src/db/schema-tickets.js";
import { asegurarBasePrivada } from "./helpers/pg-privada.js";
import { ventaACuenta } from "../src/lib/repos/fiado.js";
import { aplicarVentaLotes, type MovimientoStockNuevo } from "../src/lib/repos/stock.js";
import { getTenantDb } from "../src/lib/db.js";
import { resetStore, store } from "../src/lib/store.js";
import { conTenant } from "../src/lib/tenant-mode.js";
import { descontar, type Sku } from "../src/modules/inventario/inventario.js";
import { registrar_venta } from "../src/modules/sales/registro_venta.js";

// P1-60: VENTA no entra por aplicarMovimiento. Si el tipo vuelve a
// aceptarla, esta asignación deja de compilar.
type Tipo = MovimientoStockNuevo["tipo"];
type Sobró = Exclude<Tipo, "ALTA" | "COMPENSATORIO" | "MERMA" | "AJUSTE_CONTEO">;
const ventaQuedaAfuera: [Sobró] extends [never] ? true : never = true;

const hayPG = Boolean(process.env.PG_TEST_URL_A);
const sufijo = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6)}`.replace(/[^a-z0-9]/g, "").slice(0, 10);
const AHORA = new Date("2026-11-06T15:00:00.000Z");
const MARZO = new Date("2026-03-01T15:00:00.000Z");

describe("P1-60 el tipo de aplicarMovimiento no incluye VENTA", () => {
  it("compila solo con alta, merma, ajuste y compensatorio", () => {
    expect(ventaQuedaAfuera).toBe(true);
  });
});

describe.skipIf(!hayPG)("P1-60 el cobro consume stock_lots en orden FEFO", () => {
  let basePriv = "";
  const keys: string[] = [];
  const skus: string[] = [];

  function fijarMulti() {
    process.env.TENANT_MODE = "multi";
    process.env["TENANT_DATABASE_URL_tenant-a"] = basePriv;
  }

  function skuNuevo(marca: string): string {
    const sku = `FEFO${marca}${sufijo}`.toUpperCase().slice(0, 32);
    skus.push(sku);
    return sku;
  }

  beforeAll(async () => {
    basePriv = await asegurarBasePrivada("p1_60_fefo", process.env.PG_TEST_URL_A ?? "");
    fijarMulti();
    resetStore();
  });

  afterAll(async () => {
    if (!basePriv) return;
    fijarMulti();
    await conTenant("tenant-a", async () => {
      const db = getTenantDb();
      const ventas = keys.length > 0 ? await db.select({ id: sales.id }).from(sales).where(inArray(sales.idempotencyKey, keys)) : [];
      const saleIds = ventas.map((v) => v.id);
      if (keys.length > 0) await db.delete(customerMovements).where(inArray(customerMovements.idempotencyKey, keys));
      if (saleIds.length > 0) {
        await db.delete(ticketPayments).where(inArray(ticketPayments.saleId, saleIds));
        await db.delete(ticketDiscounts).where(inArray(ticketDiscounts.saleId, saleIds));
        await db.delete(ticketLines).where(inArray(ticketLines.saleId, saleIds));
        await db.delete(tickets).where(inArray(tickets.saleId, saleIds));
        await db.delete(cashMovements).where(inArray(cashMovements.saleId, saleIds));
        await db.delete(sales).where(inArray(sales.id, saleIds));
      }
      if (keys.length > 0) await db.delete(stockMovements).where(inArray(stockMovements.idemKey, keys));
      if (skus.length > 0) {
        await db.delete(stockLots).where(inArray(stockLots.sku, skus));
        await db.delete(products).where(inArray(products.sku, skus));
      }
    });
    delete process.env.TENANT_MODE;
    delete process.env["TENANT_DATABASE_URL_tenant-a"];
  });

  async function sembrar(sku: string, stock: number, lotes: ReadonlyArray<{ restante: number; vence: Date }>) {
    const db = getTenantDb();
    await db.insert(products).values({ sku, nombre: sku, precioCentavos: 1000n, stockActual: stock });
    await db.insert(stockLots).values(
      lotes.map((l) => ({
        sku,
        cantidad: l.restante,
        cantidadRestante: l.restante,
        venceEl: l.vence,
        costoCentavos: 100n,
      })),
    );
  }

  async function movimientos(key: string) {
    const db = getTenantDb();
    return db.select().from(stockMovements).where(eq(stockMovements.idemKey, key)).orderBy(asc(stockMovements.createdAt));
  }

  async function restantes(sku: string) {
    const db = getTenantDb();
    const lotes = await db.select().from(stockLots).where(eq(stockLots.sku, sku)).orderBy(asc(stockLots.venceEl));
    const prod = await db.select({ stockActual: products.stockActual }).from(products).where(eq(products.sku, sku));
    return { lotes, stockActual: prod[0]?.stockActual };
  }

  it("dos lotes, venta de 5: movimientos −3 y −2, restantes 0 y 8, stock_actual −5", async () => {
    fijarMulti();
    const sku = skuNuevo("ab");
    const key = `p160-fefo-${sufijo}`;
    keys.push(key);
    const temprano = new Date("2026-11-07T00:00:00.000Z");
    const tarde = new Date("2026-12-01T00:00:00.000Z");
    await conTenant("tenant-a", async () => {
      await sembrar(sku, 13, [
        { restante: 10, vence: tarde },
        { restante: 3, vence: temprano },
      ]);
      const db = getTenantDb();
      await db.transaction(async (tx) => {
        await aplicarVentaLotes(tx, { skus: [sku], offline: false, ahora: AHORA }, async (lotes) => {
          const d = descontar({
            lotes,
            lineas: [{ sku: sku as Sku, cantidad: 5 }],
            modo: "ONLINE",
            idemKey: key,
          });
          if (!d.ok) throw new Error(d.codigo);
          return {
            consumo: {
              idemKey: key,
              tomas: d.valor.descuentos.map((t) => ({ loteId: t.loteId, sku: t.sku, cantidad: t.cantidad })),
              mutarExistencias: true,
            },
            valor: true,
          };
        });
      });
      const movs = await movimientos(key);
      const estado = await restantes(sku);
      expect(movs.map((m) => ({ delta: m.delta, tipo: m.tipo, loteId: m.loteId }))).toEqual([
        { delta: -3, tipo: "VENTA", loteId: estado.lotes[0]?.id },
        { delta: -2, tipo: "VENTA", loteId: estado.lotes[1]?.id },
      ]);
      expect(estado.lotes.map((l) => l.cantidadRestante)).toEqual([0, 8]);
      expect(estado.stockActual).toBe(8);
      expect(movs.every((m) => typeof m.loteId === "string" && m.loteId.length === 36)).toBe(true);
    });
  });

  it("POST del mostrador parte la misma venta y persiste el UUID del lote", async () => {
    fijarMulti();
    const sku = skuNuevo("rg");
    const key = `p160-reg-${sufijo}`;
    keys.push(key);
    const temprano = new Date("2026-11-07T00:00:00.000Z");
    const tarde = new Date("2026-12-01T00:00:00.000Z");
    await conTenant("tenant-a", async () => {
      await sembrar(sku, 13, [
        { restante: 10, vence: tarde },
        { restante: 3, vence: temprano },
      ]);
      const r = await registrar_venta({
        key,
        lineas: [{ product_id: sku, qty: 5, precio_centavos: 1000 }],
        medio: "Efectivo",
        deviceCode: `fefo-${sufijo}`.slice(0, 32),
        seqLocal: 1,
        offline: false,
        clientOccurredAt: AHORA.toISOString(),
      });
      expect(r.ok).toBe(true);
      if (!r.ok) throw new Error("la venta falló");
      expect(r.venta.fuente).toBe("db");
      const movs = await movimientos(key);
      const estado = await restantes(sku);
      expect(movs.map((m) => ({ delta: m.delta, tipo: m.tipo, loteId: m.loteId }))).toEqual([
        { delta: -3, tipo: "VENTA", loteId: estado.lotes[0]?.id },
        { delta: -2, tipo: "VENTA", loteId: estado.lotes[1]?.id },
      ]);
      expect(estado.lotes.map((l) => l.cantidadRestante)).toEqual([0, 8]);
      expect(estado.stockActual).toBe(8);
    });
  });

  it("el vencido anterior a clientOccurredAt no se vende aunque el reloj de pared ya pasó el otro lote", async () => {
    fijarMulti();
    const sku = skuNuevo("ex");
    const key = `p160-ex-${sufijo}`;
    keys.push(key);
    await conTenant("tenant-a", async () => {
      await sembrar(sku, 13, [
        { restante: 3, vence: new Date("2026-02-01T00:00:00.000Z") },
        { restante: 10, vence: new Date("2026-06-01T00:00:00.000Z") },
      ]);
      const r = await registrar_venta({
        key,
        lineas: [{ product_id: sku, qty: 5, precio_centavos: 1000 }],
        medio: "Efectivo",
        deviceCode: `fefo-${sufijo}`.slice(0, 32),
        seqLocal: 2,
        offline: false,
        clientOccurredAt: MARZO.toISOString(),
      });
      expect(r.ok).toBe(true);
      if (!r.ok) throw new Error("la venta falló");
      const movs = await movimientos(key);
      const estado = await restantes(sku);
      expect(movs.map((m) => ({ delta: m.delta, loteId: m.loteId }))).toEqual([
        { delta: -5, loteId: estado.lotes[1]?.id },
      ]);
      expect(estado.lotes.map((l) => l.cantidadRestante)).toEqual([3, 5]);
      expect(estado.stockActual).toBe(8);
    });
  });

  it("sobreventa offline inserta lo tomado y no baja restante ni stock_actual", async () => {
    fijarMulti();
    const sku = skuNuevo("sv");
    const key = `p160-sv-${sufijo}`;
    keys.push(key);
    await conTenant("tenant-a", async () => {
      await sembrar(sku, 13, [
        { restante: 10, vence: new Date("2026-12-01T00:00:00.000Z") },
        { restante: 3, vence: new Date("2026-11-07T00:00:00.000Z") },
      ]);
      const r = await registrar_venta({
        key,
        lineas: [{ product_id: sku, qty: 20, precio_centavos: 1000 }],
        medio: "Efectivo",
        deviceCode: `fefo-${sufijo}`.slice(0, 32),
        seqLocal: 3,
        offline: true,
        clientOccurredAt: AHORA.toISOString(),
      });
      expect(r.ok).toBe(true);
      if (!r.ok) throw new Error("la venta falló");
      expect(r.venta.efecto.ticket.sobreventa).toBe(true);
      const movs = await movimientos(key);
      const estado = await restantes(sku);
      expect(movs.map((m) => m.delta)).toEqual([-3, -10]);
      expect(estado.lotes.map((l) => l.cantidadRestante)).toEqual([3, 10]);
      expect(estado.stockActual).toBe(13);
    });
  });

  it("la venta a cuenta con memoria vacía baja los lotes de la base y el espejo guarda esos UUID", async () => {
    fijarMulti();
    resetStore();
    const sku = skuNuevo("fi");
    const key = `p160-fi-${sufijo}`;
    keys.push(key);
    const visto = await conTenant("tenant-a", async () => {
      await sembrar(sku, 13, [
        { restante: 10, vence: new Date("2026-12-01T00:00:00.000Z") },
        { restante: 3, vence: new Date("2026-11-07T00:00:00.000Z") },
      ]);
      const r = await ventaACuenta({
        key,
        customerId: `cli-${sufijo}`,
        lineas: [{ sku, qty: 5, precioCentavos: 1000 }],
        deviceCode: `fefo-${sufijo}`.slice(0, 32),
        seqLocal: 4,
        topeCentavos: 1_000_000,
        saldoActualCentavos: 0,
      });
      const moves = store.stockMoves.filter((m) => m.idemKey === key);
      return { r, moves };
    });
    expect(visto.r.ok).toBe(true);
    if (!visto.r.ok) throw new Error(visto.r.codigo);
    expect(visto.r.fuente).toBe("db");
    const estado = await conTenant("tenant-a", () => restantes(sku));
    expect(estado.lotes.map((l) => l.cantidadRestante)).toEqual([0, 8]);
    expect(estado.stockActual).toBe(8);
    expect(visto.moves.map((m) => m.loteId)).toEqual([estado.lotes[0]?.id, estado.lotes[1]?.id]);
  });
});
