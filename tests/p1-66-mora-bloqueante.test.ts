import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { customerMovements, customers } from "../src/db/schema-credito.js";
import { products, sales, stockMovements, ticketLines, tickets } from "../src/db/schema.js";
import { ticketDiscounts } from "../src/db/schema-tickets.js";
import { getTenantDb } from "../src/lib/db.js";
import { resetStore, control } from "../src/lib/store.js";
import { conTenant } from "../src/lib/tenant-mode.js";
import { crearSesion } from "../src/modules/auth/sesiones.js";
import { MS_POR_DIA, UMBRAL_MORA_DIAS, esta_en_mora, situacion_mora, texto_bloqueo_mora } from "../src/modules/credit/saldos.js";
import { GET as getBalance } from "../src/pages/api/credit/balance.js";
import { POST as postCuenta } from "../src/pages/api/credit/sales-on-account.js";
import { ctx } from "./helpers/ctx.js";
import { asegurarBasePrivada } from "./helpers/pg-privada.js";

const HOY = 1_789_000_000_000;

describe("P1-66 situacion de mora", () => {
  it("15 días con saldo positivo es en_mora", () => {
    const s = situacion_mora([{ fecha: HOY - 15 * MS_POR_DIA }], 1n, HOY);
    expect(s).toEqual({ estado: "en_mora", diasMax: 15 });
  });

  it("un milisegundo antes de los 15 días sigue al día", () => {
    const s = situacion_mora([{ fecha: HOY - (15 * MS_POR_DIA - 1) }], 1n, HOY);
    expect(s).toEqual({ estado: "al_dia", diasMax: 14 });
  });

  it("una deuda de 15 días con saldo 0 queda al día", () => {
    const deudas = [{ fecha: HOY - 15 * MS_POR_DIA }];
    expect(esta_en_mora(deudas, HOY).estado).toBe("en_mora");
    expect(situacion_mora(deudas, 0n, HOY)).toEqual({ estado: "al_dia", diasMax: 15 });
  });

  it("saldo a favor con deuda vieja queda al día", () => {
    const s = situacion_mora([{ fecha: HOY - 15 * MS_POR_DIA }], -1n, HOY);
    expect(s).toEqual({ estado: "al_dia", diasMax: 15 });
  });

  it("sin deudas el máximo es 0", () => {
    expect(situacion_mora([], 100n, HOY)).toEqual({ estado: "al_dia", diasMax: 0 });
  });

  it("el 403 nombra los días y pide otro medio o al dueño", () => {
    expect(texto_bloqueo_mora(18)).toBe(
      "Este cliente está en mora: 18 días con saldo. Cobrá con otro medio o pedile al dueño.",
    );
  });
});

const hayPG = Boolean(process.env.PG_TEST_URL_A);
const sufijo = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6)}`.replace(/[^a-z0-9]/g, "").slice(0, 8);

describe.skipIf(!hayPG)("P1-66 el empleado no vende a cuenta en mora", () => {
  let basePriv = "";
  const sku = `P166${sufijo}`.toUpperCase();
  const ids: string[] = [];
  const keys: string[] = [];
  let seq = 1;

  function fijarMulti() {
    process.env.TENANT_MODE = "multi";
    process.env["TENANT_DATABASE_URL_tenant-a"] = basePriv;
  }

  beforeAll(async () => {
    basePriv = await asegurarBasePrivada("p1_66_mora", process.env.PG_TEST_URL_A ?? "");
    fijarMulti();
    resetStore();
    await conTenant("tenant-a", async () => {
      await getTenantDb().insert(products).values({ sku, nombre: "Fiado mora", precioCentavos: 1500n, stockActual: 80 });
    });
  });

  afterAll(async () => {
    if (!basePriv) return;
    fijarMulti();
    await conTenant("tenant-a", async () => {
      const db = getTenantDb();
      if (keys.length > 0) {
        const ventas = await db.select({ id: sales.id }).from(sales).where(inArray(sales.idempotencyKey, keys));
        const saleIds = ventas.map((v) => v.id);
        await db.delete(customerMovements).where(inArray(customerMovements.idempotencyKey, keys));
        if (saleIds.length > 0) {
          await db.delete(ticketDiscounts).where(inArray(ticketDiscounts.saleId, saleIds));
          await db.delete(ticketLines).where(inArray(ticketLines.saleId, saleIds));
          await db.delete(tickets).where(inArray(tickets.saleId, saleIds));
          await db.delete(sales).where(inArray(sales.id, saleIds));
        }
        await db.delete(stockMovements).where(inArray(stockMovements.idemKey, keys));
      }
      if (ids.length > 0) {
        await db.delete(customerMovements).where(inArray(customerMovements.customerId, ids));
        await db.delete(customers).where(inArray(customers.id, ids));
      }
      await db.delete(products).where(eq(products.sku, sku));
    });
    delete process.env.TENANT_MODE;
    delete process.env["TENANT_DATABASE_URL_tenant-a"];
  });

  async function ficha(): Promise<string> {
    const id = randomUUID();
    ids.push(id);
    await conTenant("tenant-a", async () => {
      await getTenantDb().insert(customers).values({ id, nombre: "Ana", topeCentavos: 0n });
    });
    return id;
  }

  async function deuda(customerId: string, debe: bigint, haber: bigint, dias: number) {
    const key = `p166-deuda-${randomUUID()}`;
    keys.push(key);
    const cuando = new Date(Date.now() - (dias * MS_POR_DIA + 1000));
    await conTenant("tenant-a", async () => {
      await getTenantDb().insert(customerMovements).values({
        customerId,
        tipo: debe > 0n ? "venta" : "cobro",
        debeCentavos: debe,
        haberCentavos: haber,
        idempotencyKey: key,
        clientOccurredAt: cuando,
      });
    });
  }

  function cookie(rol: "dueno" | "empleado"): string {
    const ahora = new Date();
    const sub = `${rol}-p166`;
    const c = crearSesion({ googleSub: sub, tenantId: "tenant-a", ahora });
    control.sessions.set(c.registro.idHash, {
      idHash: c.registro.idHash,
      googleSub: sub,
      tenantId: "tenant-a",
      expiraAt: c.registro.expiraAt,
      expiraAbsoluta: c.registro.expiraAbsoluta,
      lastSeenAt: ahora.toISOString(),
      reauthAt: ahora.toISOString(),
    });
    control.tenants.set("tenant-a", {
      id: "tenant-a",
      nombreComercio: "Kiosco",
      slug: "kiosco",
      estado: "activo",
      plan: "base",
      moneda: "ARS",
      ownerGoogleSub: "dueno-p166",
      esDemo: false,
    });
    control.memberships.set(`m-${sub}`, {
      id: `m-${sub}`,
      tenantId: "tenant-a",
      googleSub: sub,
      rol,
      permisos: [],
      estado: "activo",
    });
    return `__Host-sesion=${c.idPlano}`;
  }

  async function movimientosDe(customerId: string) {
    return conTenant("tenant-a", async () => {
      return getTenantDb().select().from(customerMovements).where(eq(customerMovements.customerId, customerId));
    });
  }

  async function stockActual(): Promise<number> {
    return conTenant("tenant-a", async () => {
      const filas = await getTenantDb()
        .select({ stock: products.stockActual })
        .from(products)
        .where(eq(products.sku, sku));
      return filas[0]?.stock ?? -1;
    });
  }

  async function vender(rol: "dueno" | "empleado", customerId: string, key: string) {
    keys.push(key);
    const n = seq;
    seq += 1;
    return (await conTenant("tenant-a", () =>
      postCuenta(
        ctx("http://x/api/credit/sales-on-account", {
          headers: { cookie: cookie(rol), "Idempotency-Key": key },
          body: {
            customer_id: customerId,
            lineas: [{ product_id: sku, qty: 1, precio_centavos: 1500 }],
            device_code: "p166-caja",
            seq_local: n,
            en_mora: false,
          },
        }),
      ),
    )) as Response;
  }

  async function leerBalance(customerId: string) {
    const r = (await conTenant("tenant-a", () =>
      getBalance(ctx(`http://x/api/credit/balance?customer_id=${customerId}`)),
    )) as Response;
    return (await r.json()) as {
      en_mora: boolean;
      estado: string;
      dias_max: number;
      saldo_centavos: string;
    };
  }

  it("empleado con saldo y 15 días recibe 403 y la misma clave no queda guardada", async () => {
    fijarMulti();
    const id = await ficha();
    await deuda(id, 4000n, 0n, 15);
    const antes = await leerBalance(id);
    expect(antes.en_mora).toBe(true);
    expect(antes.estado).toBe("en_mora");
    expect(antes.dias_max).toBe(15);
    const stock = await stockActual();
    const key = `p166-emp-${sufijo}`;
    const r = await vender("empleado", id, key);
    expect(r.status).toBe(403);
    const j = (await r.json()) as { error: string; codigo: string; dias_max: number; umbral_mora_dias: number };
    expect(j.codigo).toBe("MORA");
    expect(j.dias_max).toBe(antes.dias_max);
    expect(j.umbral_mora_dias).toBe(UMBRAL_MORA_DIAS);
    expect(j.error).toBe(texto_bloqueo_mora(j.dias_max));
    expect(await stockActual()).toBe(stock);
    expect((await movimientosDe(id)).some((m) => m.idempotencyKey === key)).toBe(false);
    const otra = await vender("empleado", id, key);
    expect(otra.status).toBe(403);
    expect(((await otra.json()) as { codigo: string }).codigo).toBe("MORA");
    expect((await movimientosDe(id)).some((m) => m.idempotencyKey === key)).toBe(false);
  });

  it("el dueño vende el mismo cuadro y la repetición no suma otro movimiento", async () => {
    fijarMulti();
    const id = await ficha();
    await deuda(id, 4000n, 0n, 15);
    const stock = await stockActual();
    const key = `p166-due-${sufijo}`;
    const r = await vender("dueno", id, key);
    expect(r.status).toBe(201);
    const j = (await r.json()) as { supera_mora: boolean; fuente: string };
    expect(j.supera_mora).toBe(true);
    expect(j.fuente).toBe("db");
    expect((await movimientosDe(id)).filter((m) => m.idempotencyKey === key)).toHaveLength(1);
    expect(await stockActual()).toBe(stock - 1);
    const otra = await vender("dueno", id, key);
    expect(otra.status).toBe(409);
    expect((await movimientosDe(id)).filter((m) => m.idempotencyKey === key)).toHaveLength(1);
    expect(await stockActual()).toBe(stock - 1);
  });

  it("a los 14 días el empleado vende y el balance no marca mora", async () => {
    fijarMulti();
    const id = await ficha();
    await deuda(id, 4000n, 0n, 14);
    const key = `p166-14-${sufijo}`;
    const r = await vender("empleado", id, key);
    expect(r.status).toBe(201);
    expect(((await r.json()) as { supera_mora: boolean }).supera_mora).toBe(false);
    const bal = await leerBalance(id);
    expect(bal.en_mora).toBe(false);
  });

  it("saldo neto cero con un debe viejo no bloquea y el balance conserva los días", async () => {
    fijarMulti();
    const id = await ficha();
    await deuda(id, 8000n, 0n, 20);
    await deuda(id, 0n, 8000n, 0);
    const bal = await leerBalance(id);
    expect(bal.saldo_centavos).toBe("0");
    expect(bal.en_mora).toBe(false);
    expect(bal.dias_max).toBeGreaterThanOrEqual(15);
    const key = `p166-cero-${sufijo}`;
    const r = await vender("empleado", id, key);
    expect(r.status).toBe(201);
    expect(((await r.json()) as { supera_mora: boolean }).supera_mora).toBe(false);
  });

  it("un cliente sin movimientos vende con supera_mora en false", async () => {
    fijarMulti();
    const id = await ficha();
    const key = `p166-limpio-${sufijo}`;
    const r = await vender("empleado", id, key);
    expect(r.status).toBe(201);
    expect(((await r.json()) as { supera_mora: boolean }).supera_mora).toBe(false);
  });

  it("la mora de otro cliente no frena la venta", async () => {
    fijarMulti();
    const a = await ficha();
    const b = await ficha();
    await deuda(b, 4000n, 0n, 15);
    const key = `p166-otro-${sufijo}`;
    const r = await vender("empleado", a, key);
    expect(r.status).toBe(201);
    expect(((await r.json()) as { supera_mora: boolean }).supera_mora).toBe(false);
    expect((await leerBalance(b)).en_mora).toBe(true);
  });
});
