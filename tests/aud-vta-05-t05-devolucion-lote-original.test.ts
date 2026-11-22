import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { and, asc, eq, inArray } from "drizzle-orm";
import { products, sales, stockLots, stockMovements, ticketCounters, ticketLines } from "../src/db/schema.js";
import { saleReturns } from "../src/db/schema-tickets.js";
import { getTenantDb } from "../src/lib/db.js";
import { crearAlmacenLotes, crearAlmacenStock, crearListaMovimientosStock } from "../src/lib/repos/_almacen.js";
import { crearLote, invarianteStockLotesMovs } from "../src/lib/repos/lotes.js";
import { idLoteGenerico } from "../src/modules/inventario/lote-generico.js";
import { control, resetStore, store } from "../src/lib/store.js";
import { conTenant } from "../src/lib/tenant-mode.js";
import { registrarDevolucion } from "../src/lib/repos/ventas.js";
import { registrar_venta } from "../src/modules/sales/registro_venta.js";
import type { DevolucionInput, ItemDevolucion } from "../src/modules/sales/devoluciones.js";
import { POST as postReturns } from "../src/pages/api/returns.js";
import { crearSesion } from "../src/modules/auth/sesiones.js";
import { ctx } from "./helpers/ctx.js";
import { asegurarBasePrivada } from "./helpers/pg-privada.js";
import { filaPg } from "./helpers/pg-tenant-fixture.js";

// AUD-VTA-05 T05: la derivación del Lote vive en el adaptador; el núcleo puro
// y el formulario siguen sin conocer Lotes.

const sufijo = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6)}`.replace(/[^a-z0-9]/g, "").slice(0, 10);
const hayPG = Boolean(process.env.PG_TEST_URL_A);
const ENV = ["TENANT_MODE", "TENANT_DATABASE_URL", "TENANT_DATABASE_URL_tenant-a", "CONTROL_DATABASE_URL", "DEFAULT_TENANT_ID"] as const;

function guardarEnv(): Record<string, string | undefined> {
  return Object.fromEntries(ENV.map((k) => [k, process.env[k]]));
}
function restaurarEnv(snap: Record<string, string | undefined>): void {
  for (const k of ENV) {
    if (snap[k] === undefined) delete process.env[k];
    else process.env[k] = snap[k];
  }
}

type Comprobante = { readonly loteId: string | null; readonly delta: number; readonly venceEl: Date | null };

function comprobanteMemoria(key: string): Comprobante[] {
  const porId = crearAlmacenLotes().comoMapaSoloLectura();
  return crearListaMovimientosStock()
    .listar()
    .filter((m) => m.idemKey === key && m.tipo === "COMPENSATORIO")
    .map((m) => {
      const vence = m.loteId ? porId.get(m.loteId)?.venceEl : null;
      return { loteId: m.loteId, delta: m.delta, venceEl: vence ? new Date(vence) : null };
    });
}

function ordenarPorVencimiento(comps: readonly Comprobante[]): Comprobante[] {
  const fecha = (c: Comprobante) => (c.venceEl === null ? Number.POSITIVE_INFINITY : c.venceEl.getTime());
  return [...comps].sort((a, b) => fecha(a) - fecha(b));
}

describe("AUD-VTA-05 T05 el contrato del núcleo de devolución no cambia", () => {
  it("DevolucionInput e ItemDevolucion siguen sin campos de Lote", () => {
    type CamposNucleo = "idempotencyKey" | "saleId" | "items" | "montoCentavos" | "medio" | "actor" | "motivo";
    type CamposItem = "sku" | "cantidad";
    const nucleo: CamposNucleo extends keyof DevolucionInput ? true : false = true;
    const item: CamposItem extends keyof ItemDevolucion ? true : false = true;
    const sinLote: Extract<keyof DevolucionInput | keyof ItemDevolucion, "loteId" | "lotes"> | undefined = undefined;
    expect([nucleo, item, sinLote]).toEqual([true, true, undefined]);
  });
});

describe.skipIf(!hayPG)("AUD-VTA-05 T05 devolución al Lote original con Postgres A/B", () => {
  const bases: Array<{ nombre: string; url: string }> = [];
  const skus: string[] = [];
  const keys: string[] = [];
  const saleIds: string[] = [];
  let snap: Record<string, string | undefined> = {};
  let cookie = "";

  function sembrarIdentidad(): void {
    const sub = `t05-${sufijo}`;
    control.tenants.set("tenant-a", {
      id: "tenant-a",
      nombreComercio: "tenant-a",
      slug: "tenant-a",
      estado: "activo",
      plan: "base",
      moneda: "ARS",
      ownerGoogleSub: sub,
      esDemo: false,
    });
    control.memberships.set(`tenant-a:${sub}`, {
      id: `tenant-a:${sub}`,
      tenantId: "tenant-a",
      googleSub: sub,
      rol: "dueno",
      permisos: [],
      estado: "activo",
    });
    const sesion = crearSesion({ googleSub: sub, tenantId: "tenant-a", ahora: new Date() });
    control.sessions.set(sesion.registro.idHash, {
      idHash: sesion.registro.idHash,
      googleSub: sub,
      tenantId: "tenant-a",
      expiraAt: sesion.registro.expiraAt,
      expiraAbsoluta: sesion.registro.expiraAbsoluta,
      lastSeenAt: new Date().toISOString(),
      reauthAt: new Date().toISOString(),
    });
    cookie = `__Host-sesion=${sesion.idPlano}`;
  }

  async function conBase<T>(url: string, fn: () => Promise<T>): Promise<T> {
    process.env.TENANT_MODE = "multi";
    process.env["TENANT_DATABASE_URL_tenant-a"] = url;
    return conTenant("tenant-a", fn);
  }

  async function sembrar(sku: string, stock: number, lotes: ReadonlyArray<{ cantidad: number; vence?: Date }>): Promise<void> {
    const db = getTenantDb();
    await db.insert(products).values(filaPg({ sku, nombre: sku, precioCentavos: 1000n, stockActual: stock }));
    if (lotes.length > 0) {
      await db.insert(stockLots).values(
        lotes.map((l) =>
          filaPg({ sku, cantidad: l.cantidad, cantidadRestante: l.cantidad, venceEl: l.vence ?? null, costoCentavos: 100n }),
        ),
      );
    }
  }

  async function vender(sku: string, cantidad: number, key: string, precioCentavos = 1000): Promise<string> {
    keys.push(key);
    const r = await registrar_venta({
      key,
      lineas: [{ product_id: sku, qty: cantidad, precio_centavos: precioCentavos }],
      medio: "Efectivo",
      deviceCode: `t05-${sufijo}`.slice(0, 32),
      seqLocal: 1,
      offline: false,
      clientOccurredAt: "2026-11-06T15:00:00.000Z",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("venta rechazada");
    saleIds.push(r.venta.saleId);
    return r.venta.saleId;
  }

  function devolver(saleId: string, sku: string, cantidad: number, key: string): Promise<Response> {
    keys.push(key);
    return postReturns(
      ctx("http://x/api/returns", {
        method: "POST",
        headers: { "Idempotency-Key": key, cookie, "X-Tenant-Id": "tenant-a" },
        body: {
          sale_id: saleId,
          monto_centavos: cantidad * 1000,
          items: [{ product_id: sku, qty: cantidad }],
          medio: "Efectivo",
          motivo: "devolución auditada",
          actor: "duena",
          client_occurred_at: "2026-11-07T15:00:00.000Z",
        },
      }),
    ) as Promise<Response>;
  }

  async function movimientosDe(key: string) {
    return getTenantDb()
      .select({
        loteId: stockMovements.loteId,
        delta: stockMovements.delta,
        tipo: stockMovements.tipo,
        venceEl: stockLots.venceEl,
      })
      .from(stockMovements)
      .leftJoin(stockLots, eq(stockMovements.loteId, stockLots.id))
      .where(eq(stockMovements.idemKey, key));
  }

  async function estadoDe(sku: string) {
    const lotes = await getTenantDb().select().from(stockLots).where(eq(stockLots.sku, sku)).orderBy(asc(stockLots.venceEl));
    const prod = await getTenantDb().select({ stockActual: products.stockActual }).from(products).where(eq(products.sku, sku));
    return { lotes, stockActual: prod[0]?.stockActual };
  }

  beforeAll(async () => {
    if (process.env.PG_TEST_URL_A) {
      bases.push({ nombre: "A", url: await asegurarBasePrivada("aud_vta_05_t05_a", process.env.PG_TEST_URL_A) });
    }
    if (process.env.PG_TEST_URL_B) {
      bases.push({ nombre: "B", url: await asegurarBasePrivada("aud_vta_05_t05_b", process.env.PG_TEST_URL_B) });
    }
  });

  afterAll(async () => {
    for (const base of bases) {
      await conBase(base.url, async () => {
        const db = getTenantDb();
        await db.delete(saleReturns).where(inArray(saleReturns.idempotencyKey, keys));
        await db.delete(stockMovements).where(inArray(stockMovements.idemKey, keys));
        if (saleIds.length > 0) {
          await db.delete(ticketLines).where(inArray(ticketLines.saleId, saleIds));
          await db.delete(sales).where(inArray(sales.id, saleIds));
        }
        if (skus.length > 0) {
          await db.delete(stockLots).where(inArray(stockLots.sku, skus));
          await db.delete(products).where(inArray(products.sku, skus));
        }
      });
    }
    restaurarEnv(snap);
    resetStore();
  });

  beforeEach(() => {
    snap = guardarEnv();
    resetStore();
    sembrarIdentidad();
  });

  afterEach(() => {
    restaurarEnv(snap);
    resetStore();
  });

  it("una devolución total reingresa a los Lotes originales en A y en B", async () => {
    expect(bases.length).toBeGreaterThan(0);
    for (const base of bases) {
      const sku = `T05DB${base.nombre}${sufijo}`.toUpperCase();
      skus.push(sku);
      await conBase(base.url, async () => {
        await sembrar(sku, 10, [{ cantidad: 10 }]);
        const keyVenta = `t05-db-venta-${base.nombre}-${sufijo}`;
        const saleId = await vender(sku, 4, keyVenta);
        const estadoAntes = await estadoDe(sku);
        const loteId = estadoAntes.lotes[0]!.id;
        expect(estadoAntes.lotes[0]?.cantidadRestante).toBe(6);

        const key = `t05-db-dev-${base.nombre}-${sufijo}`;
        const r = await devolver(saleId, sku, 4, key);
        expect(r.status).toBe(201);
        expect(await r.json()).toEqual({
          return_id: expect.any(String),
          numero_devolucion: expect.any(String),
          sale_id: saleId,
          monto_centavos: "4000",
          fiscal_estado: "sin_factura",
          nc_tipo: null,
        });

        const comps = await movimientosDe(key);
        expect(comps).toHaveLength(1);
        expect(comps[0]).toMatchObject({ loteId, delta: 4, tipo: "COMPENSATORIO" });
        const estado = await estadoDe(sku);
        expect(estado.lotes[0]?.cantidadRestante).toBe(10);
        expect(estado.stockActual).toBe(10);
        const espejo = store.stockMoves.filter((m) => m.idemKey === key && m.tipo === "COMPENSATORIO");
        expect(espejo.map((m) => m.loteId)).toEqual([loteId]);
      });
    }
  });

  it("una devolución parcial reparte por SKU y el sobrante va al Lote que vence antes", async () => {
    const base = bases[0]!;
    const sku = `T05DBPAR${sufijo}`.toUpperCase();
    skus.push(sku);
    await conBase(base.url, async () => {
      const pronto = new Date("2026-11-20T00:00:00.000Z");
      const tarde = new Date("2026-12-20T00:00:00.000Z");
      await sembrar(sku, 3, [{ cantidad: 1, vence: pronto }, { cantidad: 2, vence: tarde }]);
      const saleId = await vender(sku, 3, `t05-db-par-venta-${sufijo}`);
      const antes = await estadoDe(sku);
      const [idPronto, idTarde] = [antes.lotes[0]!.id, antes.lotes[1]!.id];
      const key = `t05-db-par-dev-${sufijo}`;
      const r = await devolver(saleId, sku, 2, key);
      expect(r.status).toBe(201);

      const comps = await movimientosDe(key);
      const porFecha = [...comps].sort((a, b) => (a.venceEl?.getTime() ?? Infinity) - (b.venceEl?.getTime() ?? Infinity));
      expect(porFecha.map((m) => [m.loteId, m.delta])).toEqual([
        [idPronto, 1],
        [idTarde, 1],
      ]);
      const estado = await estadoDe(sku);
      expect(estado.lotes.map((l) => l.cantidadRestante)).toEqual([1, 1]);
      expect(estado.stockActual).toBe(2);
    });
  });

  it("si falla el reingreso, la devolución no queda registrada (una sola transacción)", async () => {
    const base = bases[0]!;
    const sku = `T05DBTX${sufijo}`.toUpperCase();
    skus.push(sku);
    await conBase(base.url, async () => {
      await sembrar(sku, 2, [{ cantidad: 2 }]);
      const saleId = await vender(sku, 1, `t05-db-tx-venta-${sufijo}`);
      const loteId = (await estadoDe(sku)).lotes[0]!.id;
      await getTenantDb().delete(stockLots).where(eq(stockLots.id, loteId));
      const key = `t05-db-tx-dev-${sufijo}`;
      const r = await devolver(saleId, sku, 1, key);
      expect(r.status).toBe(503);
      const filas = await getTenantDb().select().from(saleReturns).where(eq(saleReturns.idempotencyKey, key));
      expect(filas).toHaveLength(0);
      expect((await movimientosDe(key)).filter((m) => m.tipo === "COMPENSATORIO")).toHaveLength(0);
    });
  });

  it("mercadería sin Lote identificado en el Historial reingresa al Lote genérico", async () => {
    const base = bases[0]!;
    const sku = `T05DBGEN${sufijo}`.toUpperCase();
    skus.push(sku);
    await conBase(base.url, async () => {
      const db = getTenantDb();
      const saleId = crypto.randomUUID();
      const keyVenta = `t05-db-gen-venta-${sufijo}`;
      keys.push(keyVenta);
      saleIds.push(saleId);
      const [producto] = await db
        .insert(products)
        .values(filaPg({ sku, nombre: sku, precioCentavos: 1000n, stockActual: 4 }))
        .returning({ id: products.id });
      await db.insert(sales).values(
        filaPg({ id: saleId, idempotencyKey: keyVenta, medio: "Efectivo", totalCentavos: 1000n, sobreventa: false, offline: false, clientOccurredAt: new Date("2026-11-06T15:00:00.000Z") }),
      );
      await db.insert(ticketLines).values(filaPg({ saleId, productId: producto!.id, qty: 1, precioCentavos: 1000n, costoCentavos: 0n }));
      await db.insert(stockMovements).values(
        filaPg({ idemKey: keyVenta, sku, loteId: null, delta: -1, tipo: "VENTA" }),
      );
      const key = `t05-db-gen-dev-${sufijo}`;
      const r = await devolver(saleId, sku, 1, key);
      expect(r.status).toBe(201);

      const comps = await movimientosDe(key);
      expect(comps).toHaveLength(1);
      expect(comps[0]?.loteId).toBe(idLoteGenerico(sku));
      const estado = await estadoDe(sku);
      expect(estado.lotes).toHaveLength(1);
      expect(estado.lotes[0]?.cantidadRestante).toBe(1);
      expect(estado.stockActual).toBe(5);
    });
  });

  it("el tope de unidades suma todos los Lotes de una devolución anterior", async () => {
    const base = bases[0]!;
    const sku = `T05DBTOPE${sufijo}`.toUpperCase();
    skus.push(sku);
    await conBase(base.url, async () => {
      await sembrar(sku, 3, [
        { cantidad: 2, vence: new Date("2026-11-20T00:00:00.000Z") },
        { cantidad: 1, vence: new Date("2026-12-20T00:00:00.000Z") },
      ]);
      const saleId = await vender(sku, 3, `t05-db-tope-venta-${sufijo}`, 2000);

      expect((await devolver(saleId, sku, 1, `t05-db-tope-dev1-${sufijo}`)).status).toBe(201);
      expect((await devolver(saleId, sku, 2, `t05-db-tope-dev2-${sufijo}`)).status).toBe(201);

      const estado = await estadoDe(sku);
      expect(estado.stockActual).toBe(3);

      // La plata alcanza (4000 <= 6000): el rechazo es por unidades.
      const tercera = await devolver(saleId, sku, 1, `t05-db-tope-dev3-${sufijo}`);
      expect(tercera.status).toBe(422);
      expect(await tercera.json()).toMatchObject({ error: "devolución supera lo vendido", sku, disponible: 0 });
    });
  });
});

describe("AUD-VTA-05 T05 devolución al Lote original en memoria", () => {
  beforeEach(() => {
    for (const k of ENV) delete process.env[k];
    resetStore();
  });

  it("una devolución total reingresa al Lote que consumió la venta", async () => {
    const sku = `T05TOT${sufijo}`;
    const alta = await crearLote({
      sku,
      cantidad: 10,
      venceEl: null,
      costoCentavos: 100,
      controlaVencimiento: false,
      idemKey: `t05-tot-alta-${sufijo}`,
    });
    expect(alta.ok).toBe(true);
    if (!alta.ok) throw new Error("alta falló");
    const loteId = alta.lote.id;

    const keyVenta = `t05-tot-venta-${sufijo}`;
    const v = await registrar_venta({
      key: keyVenta,
      lineas: [{ product_id: sku, qty: 4, precio_centavos: 1000 }],
      medio: "Efectivo",
      deviceCode: `t05-tot-${sufijo}`.slice(0, 32),
      seqLocal: 1,
      offline: false,
      clientOccurredAt: "2026-11-06T15:00:00.000Z",
    });
    expect(v.ok).toBe(true);
    if (!v.ok) throw new Error("venta rechazada");
    expect(crearAlmacenLotes().obtener(loteId)?.cantidadRestante).toBe(6);

    const key = `t05-tot-dev-${sufijo}`;
    const d = await registrarDevolucion({
      key,
      saleId: v.venta.saleId,
      montoCentavos: 4000n,
      items: [{ sku, cantidad: 4 }],
      medio: "Efectivo",
      motivo: "devolución total",
      actor: "duena",
      clientOccurredAt: "2026-11-07T15:00:00.000Z",
    });
    expect(d.ok).toBe(true);

    expect(comprobanteMemoria(key)).toEqual([{ loteId, delta: 4, venceEl: null }]);
    expect(crearAlmacenLotes().obtener(loteId)?.cantidadRestante).toBe(10);
    expect(crearAlmacenStock().obtener(sku)).toBe(10);
    const sumaMovs = store.stockMoves.filter((m) => m.sku === sku).reduce((a, m) => a + m.delta, 0);
    expect(invarianteStockLotesMovs({ stockActual: 10, lotesCantidadRestante: 10, movsDeltaSum: sumaMovs })).toBe(true);
  });

  it("una devolución parcial reparte por SKU y da el sobrante al Lote que vence antes", async () => {
    const sku = `T05PAR${sufijo}`;
    const pronto = await crearLote({
      sku,
      cantidad: 1,
      venceEl: "2026-11-20T00:00:00.000Z",
      costoCentavos: 100,
      controlaVencimiento: true,
      idemKey: `t05-par-alta-pronto-${sufijo}`,
    });
    const tarde = await crearLote({
      sku,
      cantidad: 2,
      venceEl: "2026-12-20T00:00:00.000Z",
      costoCentavos: 100,
      controlaVencimiento: true,
      idemKey: `t05-par-alta-tarde-${sufijo}`,
    });
    expect(pronto.ok && tarde.ok).toBe(true);
    if (!pronto.ok || !tarde.ok) throw new Error("altas fallaron");

    const keyVenta = `t05-par-venta-${sufijo}`;
    const v = await registrar_venta({
      key: keyVenta,
      lineas: [{ product_id: sku, qty: 3, precio_centavos: 1000 }],
      medio: "Efectivo",
      deviceCode: `t05-par-${sufijo}`.slice(0, 32),
      seqLocal: 1,
      offline: false,
      clientOccurredAt: "2026-11-06T15:00:00.000Z",
    });
    expect(v.ok).toBe(true);
    if (!v.ok) throw new Error("venta rechazada");
    // FEFO: 1 del lote pronto y 2 del lote tarde.
    expect(store.stockMoves.filter((m) => m.idemKey === keyVenta).map((m) => [m.loteId, m.delta])).toEqual([
      [pronto.lote.id, -1],
      [tarde.lote.id, -2],
    ]);

    const key = `t05-par-dev-${sufijo}`;
    const d = await registrarDevolucion({
      key,
      saleId: v.venta.saleId,
      montoCentavos: 2000n,
      items: [{ sku, cantidad: 2 }],
      medio: "Efectivo",
      motivo: "devolución parcial",
      actor: "duena",
      clientOccurredAt: "2026-11-07T15:00:00.000Z",
    });
    expect(d.ok).toBe(true);

    // 2 * 1/3 = 0.66 → 0; 2 * 2/3 = 1.33 → 1; el sobrante va al que vence antes.
    expect(ordenarPorVencimiento(comprobanteMemoria(key))).toEqual([
      { loteId: pronto.lote.id, delta: 1, venceEl: new Date("2026-11-20T00:00:00.000Z") },
      { loteId: tarde.lote.id, delta: 1, venceEl: new Date("2026-12-20T00:00:00.000Z") },
    ]);
    expect(crearAlmacenLotes().obtener(pronto.lote.id)?.cantidadRestante).toBe(1);
    expect(crearAlmacenLotes().obtener(tarde.lote.id)?.cantidadRestante).toBe(1);
    expect(crearAlmacenStock().obtener(sku)).toBe(2);
  });

  it("el tope de unidades suma todos los Lotes de una devolución anterior", async () => {
    const sku = `T05TOPE${sufijo}`;
    const pronto = await crearLote({
      sku,
      cantidad: 2,
      venceEl: "2026-11-20T00:00:00.000Z",
      costoCentavos: 100,
      controlaVencimiento: true,
      idemKey: `t05-tope-alta-pronto-${sufijo}`,
    });
    const tarde = await crearLote({
      sku,
      cantidad: 1,
      venceEl: "2026-12-20T00:00:00.000Z",
      costoCentavos: 100,
      controlaVencimiento: true,
      idemKey: `t05-tope-alta-tarde-${sufijo}`,
    });
    expect(pronto.ok && tarde.ok).toBe(true);
    if (!pronto.ok || !tarde.ok) throw new Error("altas fallaron");

    const v = await registrar_venta({
      key: `t05-tope-venta-${sufijo}`,
      lineas: [{ product_id: sku, qty: 3, precio_centavos: 2000 }],
      medio: "Efectivo",
      deviceCode: `t05-tope-${sufijo}`.slice(0, 32),
      seqLocal: 1,
      offline: false,
      clientOccurredAt: "2026-11-06T15:00:00.000Z",
    });
    expect(v.ok).toBe(true);
    if (!v.ok) throw new Error("venta rechazada");

    const devolver = (key: string, cantidad: number, monto: bigint) =>
      registrarDevolucion({
        key,
        saleId: v.venta.saleId,
        montoCentavos: monto,
        items: [{ sku, cantidad }],
        medio: "Efectivo",
        motivo: "devolución parcial",
        actor: "duena",
        clientOccurredAt: "2026-11-07T15:00:00.000Z",
      });

    expect((await devolver(`t05-tope-dev1-${sufijo}`, 1, 1000n)).ok).toBe(true);
    expect((await devolver(`t05-tope-dev2-${sufijo}`, 2, 2000n)).ok).toBe(true);
    expect(crearAlmacenStock().obtener(sku)).toBe(3);

    // La plata alcanza (4000 <= 6000): el rechazo es por unidades.
    const tercera = await devolver(`t05-tope-dev3-${sufijo}`, 1, 1000n);
    expect(tercera.ok).toBe(false);
    if (tercera.ok) throw new Error("la tercera devolución debió rechazarse");
    if (tercera.status !== 422) throw new Error("la tercera devolución debió ser 422");
    expect(tercera.error).toBe("devolución supera lo vendido");
    expect(tercera.disponible).toBe(0);
  });
});
