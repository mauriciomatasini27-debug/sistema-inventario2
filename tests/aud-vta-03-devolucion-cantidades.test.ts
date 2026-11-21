import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { products, ticketCounters } from "../src/db/schema.js";
import { getTenantDb } from "../src/lib/db.js";
import { filaContadorTicket } from "../src/lib/repos/ticket-counters.js";
import { registrarDevolucion } from "../src/lib/repos/ventas.js";
import { resetStore, store } from "../src/lib/store.js";
import { conTenant } from "../src/lib/tenant-mode.js";
import type { Sku } from "../src/modules/inventario/inventario.js";
import { registrar_devolucion, type DevolucionInput } from "../src/modules/sales/devoluciones.js";
import { registrar_venta, type LineaVentaInput } from "../src/modules/sales/registro_venta.js";
import { ctx } from "./helpers/ctx.js";

// AUD-VTA-03: una devolución no puede reponer más unidades de las vendidas
// (descontando las ya devueltas) ni un producto que no estaba en la venta.

const PG = process.env.PG_TEST_URL_A;
const ENV = ["TENANT_MODE", "TENANT_DATABASE_URL", "CONTROL_DATABASE_URL", "DEFAULT_TENANT_ID"] as const;
const nuevoSku = (p: string) => `${p}${randomUUID().slice(0, 8)}`.toUpperCase();

// AUD-VTA-03: sale_returns.numero_devolucion es único en toda la base pero el
// contador es por comercio; con otros archivos devolviendo en paralelo, el
// comercio de prueba arranca su serie en un tramo propio para no chocar.
async function sembrarContadorDevolucion(tenantId: string): Promise<void> {
  const base = 500_000 + Math.floor(Math.random() * 490_000);
  await conTenant(tenantId, () =>
    getTenantDb().insert(ticketCounters).values(filaContadorTicket("devolucion", base)).onConflictDoNothing(),
  );
}
const sku = (s: string) => s as Sku;

function guardarEnv(): Record<string, string | undefined> {
  return Object.fromEntries(ENV.map((k) => [k, process.env[k]]));
}
function restaurarEnv(snap: Record<string, string | undefined>): void {
  for (const k of ENV) {
    if (snap[k] === undefined) delete process.env[k];
    else process.env[k] = snap[k];
  }
}

describe("AUD-VTA-03 núcleo puro: tope de unidades por SKU", () => {
  const base = (over: Partial<DevolucionInput>): DevolucionInput => ({
    idempotencyKey: "dev-aud-03",
    saleId: "sale-1",
    ventaTotalCentavos: 10000n,
    acumuladoPrevioCentavos: 0n,
    montoCentavos: 1000n,
    items: [{ sku: sku("YERBA"), cantidad: 1 }],
    medio: "Efectivo",
    fueAcuenta: false,
    motivo: "falla",
    actor: "duena",
    ultimoDevolucion: null,
    vistos: new Map(),
    ...over,
  });
  const devolvibles = new Map([["YERBA", 2]]);

  it("hasta lo devolvible pasa; una unidad más se rechaza con el disponible", () => {
    expect(registrar_devolucion(base({ items: [{ sku: sku("YERBA"), cantidad: 2 }], devolviblesPorSku: devolvibles })).ok).toBe(true);
    expect(registrar_devolucion(base({ items: [{ sku: sku("YERBA"), cantidad: 3 }], devolviblesPorSku: devolvibles }))).toMatchObject({
      ok: false,
      codigo: "CANTIDAD_EXCEDIDA",
      status: 422,
      sku: "YERBA",
      disponible: 2,
    });
  });

  it("suma los ítems repetidos del mismo SKU antes de comparar", () => {
    const items = [
      { sku: sku("YERBA"), cantidad: 1 },
      { sku: sku("YERBA"), cantidad: 2 },
    ];
    expect(registrar_devolucion(base({ items, devolviblesPorSku: devolvibles }))).toMatchObject({ codigo: "CANTIDAD_EXCEDIDA" });
  });

  it("un SKU que no estaba en la venta tiene 0 devolvibles", () => {
    expect(registrar_devolucion(base({ items: [{ sku: sku("AZUCAR"), cantidad: 1 }], devolviblesPorSku: devolvibles }))).toMatchObject({
      codigo: "CANTIDAD_EXCEDIDA",
      sku: "AZUCAR",
      disponible: 0,
    });
  });

  it("sin mapa (venta sin líneas conocidas) solo rige el tope en plata", () => {
    expect(registrar_devolucion(base({ items: [{ sku: sku("YERBA"), cantidad: 50 }], devolviblesPorSku: null })).ok).toBe(true);
  });
});

describe.skipIf(!PG)("AUD-VTA-03 devoluciones contra Postgres local (shared)", () => {
  let snap: Record<string, string | undefined> = {};
  const tA = randomUUID();

  beforeAll(async () => {
    const previo = guardarEnv();
    process.env.TENANT_MODE = "shared";
    process.env.TENANT_DATABASE_URL = PG;
    await sembrarContadorDevolucion(tA);
    restaurarEnv(previo);
  });

  beforeEach(() => {
    snap = guardarEnv();
    resetStore();
    process.env.TENANT_MODE = "shared";
    process.env.TENANT_DATABASE_URL = PG;
    delete process.env.CONTROL_DATABASE_URL;
  });
  afterEach(() => {
    restaurarEnv(snap);
    resetStore();
  });

  async function sembrar(s: string, stock: number) {
    await conTenant(tA, () =>
      getTenantDb().insert(products).values({ sku: s, nombre: `AUD ${s}`, precioCentavos: 1000n, stockActual: stock, tenantId: tA }),
    );
  }
  async function stockDe(s: string): Promise<number | undefined> {
    const f = await conTenant(tA, () =>
      getTenantDb()
        .select({ s: products.stockActual })
        .from(products)
        .where(and(eq(products.tenantId, tA), eq(products.sku, s))),
    );
    return f[0]?.s;
  }
  async function vender(lineas: LineaVentaInput[]): Promise<string> {
    const r = await conTenant(tA, () =>
      registrar_venta({
        key: `aud-vta-03-${randomUUID()}`,
        lineas,
        medio: "Efectivo",
        deviceCode: "caja-aud-03",
        seqLocal: 1,
        offline: false,
        clientOccurredAt: new Date().toISOString(),
      }),
    );
    if (!r.ok) throw new Error(`venta rechazada: ${r.codigo}`);
    return r.venta.saleId;
  }
  const devolver = (saleId: string, items: Array<{ sku: string; cantidad: number }>, monto: bigint) =>
    conTenant(tA, () =>
      registrarDevolucion({
        key: `aud-vta-03-dev-${randomUUID()}`,
        saleId,
        montoCentavos: monto,
        items,
        medio: "Efectivo",
        motivo: "prueba",
        actor: "duena",
        clientOccurredAt: new Date().toISOString(),
      }),
    );

  it("vender 1 y devolver 50 se rechaza y el stock no se infla", async () => {
    const s = nuevoSku("AUX");
    await sembrar(s, 10);
    const saleId = await vender([{ product_id: s, qty: 1, precio_centavos: 1000 }]);
    const d = await devolver(saleId, [{ sku: s, cantidad: 50 }], 1000n);
    expect(d).toMatchObject({ ok: false, status: 422, error: "devolución supera lo vendido", sku: s, disponible: 1 });
    expect(await stockDe(s)).toBe(9);
  });

  it("devolver un producto que no estaba en la venta se rechaza y no le suma stock", async () => {
    const [s, otro] = [nuevoSku("AUJ"), nuevoSku("AUK")];
    await sembrar(s, 10);
    await sembrar(otro, 10);
    const saleId = await vender([{ product_id: s, qty: 1, precio_centavos: 1000 }]);
    const d = await devolver(saleId, [{ sku: otro, cantidad: 5 }], 500n);
    expect(d).toMatchObject({ ok: false, status: 422, sku: otro, disponible: 0 });
    expect(await stockDe(otro)).toBe(10);
  });

  it("devoluciones parciales sucesivas descuentan lo ya devuelto", async () => {
    const s = nuevoSku("AUM");
    await sembrar(s, 10);
    const saleId = await vender([{ product_id: s, qty: 3, precio_centavos: 1000 }]);
    expect((await devolver(saleId, [{ sku: s, cantidad: 2 }], 2000n)).ok).toBe(true);
    expect(await devolver(saleId, [{ sku: s, cantidad: 2 }], 1000n)).toMatchObject({ ok: false, disponible: 1 });
    expect((await devolver(saleId, [{ sku: s, cantidad: 1 }], 1000n)).ok).toBe(true);
    expect(await stockDe(s)).toBe(10);
  });

  it("venta de varias líneas: cada SKU respeta su propia cantidad", async () => {
    const [x, y] = [nuevoSku("AUA"), nuevoSku("AUB")];
    await sembrar(x, 10);
    await sembrar(y, 10);
    const saleId = await vender([
      { product_id: x, qty: 2, precio_centavos: 1000 },
      { product_id: y, qty: 1, precio_centavos: 1000 },
    ]);
    expect(await devolver(saleId, [{ sku: x, cantidad: 1 }, { sku: y, cantidad: 2 }], 1000n)).toMatchObject({ ok: false, sku: y });
    expect((await devolver(saleId, [{ sku: x, cantidad: 2 }, { sku: y, cantidad: 1 }], 3000n)).ok).toBe(true);
    expect([await stockDe(x), await stockDe(y)]).toEqual([10, 10]);
  });

  it("POST /api/returns responde 422 con el SKU y lo disponible", async () => {
    const s = nuevoSku("AUR");
    await sembrar(s, 10);
    const saleId = await vender([{ product_id: s, qty: 1, precio_centavos: 1000 }]);
    const { POST } = await import("../src/pages/api/returns.js");
    const r = (await conTenant(tA, () =>
      POST(
        ctx("http://x/api/returns", {
          headers: { "Idempotency-Key": `aud-vta-03-http-${randomUUID()}` },
          body: {
            sale_id: saleId,
            monto_centavos: 1000,
            items: [{ product_id: s, qty: 2 }],
            medio: "Efectivo",
            motivo: "prueba",
            actor: "duena",
            client_occurred_at: new Date().toISOString(),
          },
        }),
      ),
    )) as Response;
    expect(r.status).toBe(422);
    expect(await r.json()).toEqual({ error: "devolución supera lo vendido", sku: s, disponible: 1 });
    expect(await stockDe(s)).toBe(9);
  });
});

describe("AUD-VTA-03 single sin base (memoria)", () => {
  let snap: Record<string, string | undefined> = {};
  beforeEach(() => {
    snap = guardarEnv();
    for (const k of ENV) delete process.env[k];
    resetStore();
  });
  afterEach(() => {
    restaurarEnv(snap);
    resetStore();
  });

  it("la venta en memoria también limita las unidades devueltas", async () => {
    store.stock.set("MEM-A", 5);
    const v = await registrar_venta({
      key: "aud-vta-03-mem",
      lineas: [{ product_id: "MEM-A", qty: 2, precio_centavos: 1000 }],
      medio: "Efectivo",
      deviceCode: "caja-aud-03",
      seqLocal: 1,
      offline: false,
      clientOccurredAt: new Date().toISOString(),
    });
    if (!v.ok) throw new Error("venta");
    const devolver = (key: string, cantidad: number) =>
      registrarDevolucion({
        key,
        saleId: v.venta.saleId,
        montoCentavos: 1000n,
        items: [{ sku: "MEM-A", cantidad }],
        medio: "Efectivo",
        motivo: "prueba",
        actor: "duena",
        clientOccurredAt: new Date().toISOString(),
      });
    expect(await devolver("aud-vta-03-mem-d1", 3)).toMatchObject({ ok: false, disponible: 2 });
    expect((await devolver("aud-vta-03-mem-d2", 1)).ok).toBe(true);
    expect(await devolver("aud-vta-03-mem-d3", 2)).toMatchObject({ ok: false, disponible: 1 });
    expect(store.stock.get("MEM-A")).toBe(4);
  });
});
