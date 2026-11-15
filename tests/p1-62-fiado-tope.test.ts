import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { customerMovements, customers } from "../src/db/schema-credito.js";
import { products, sales, stockMovements, ticketLines, tickets } from "../src/db/schema.js";
import { ticketDiscounts } from "../src/db/schema-tickets.js";
import { rolParaFiado } from "../src/lib/control.js";
import { getTenantDb } from "../src/lib/db.js";
import { ventaACuenta } from "../src/lib/repos/fiado.js";
import { confirmacionDesdeCable, sinConfirmarExceso } from "../src/modules/credit/fiado.js";
import { control, resetStore } from "../src/lib/store.js";
import { conTenant } from "../src/lib/tenant-mode.js";
import { crearSesion } from "../src/modules/auth/sesiones.js";
import { POST as postCuenta } from "../src/pages/api/credit/sales-on-account.js";
import { filaPg } from "./helpers/pg-tenant-fixture.js";
import { GET as getBalance } from "../src/pages/api/credit/balance.js";
import { ctx } from "./helpers/ctx.js";
import { asegurarBasePrivada } from "./helpers/pg-privada.js";

describe("rol del fiado", () => {
  it("sin membership no llega a la venta", async () => {
    resetStore();
    delete process.env.TENANT_MODE;
    delete process.env.TENANT_DATABASE_URL;
    const ahora = new Date();
    const c = crearSesion({ googleSub: "nadie-p162", tenantId: "t-162", ahora });
    control.sessions.set(c.registro.idHash, {
      idHash: c.registro.idHash,
      googleSub: "nadie-p162",
      tenantId: "t-162",
      expiraAt: c.registro.expiraAt,
      expiraAbsoluta: c.registro.expiraAbsoluta,
      lastSeenAt: ahora.toISOString(),
      reauthAt: ahora.toISOString(),
    });
    const r = (await postCuenta(
      ctx("http://x/api/credit/sales-on-account", {
        headers: { cookie: `__Host-sesion=${c.idPlano}`, "Idempotency-Key": "p162-permiso" },
        body: { customer_id: randomUUID() },
      }),
    )) as Response;
    expect(r.status).toBe(403);
    expect(await r.json()).toMatchObject({ error: "No tenés permiso en este comercio." });
  });

  it("legado es dueño y la sesión usa el rol de la membership", () => {
    expect(rolParaFiado({ estado: "legado" })).toEqual({ ok: true, rol: "dueno" });
    expect(rolParaFiado({ estado: "sesion", rol: "empleado", permisos: [] })).toEqual({ ok: true, rol: "empleado" });
    expect(rolParaFiado({ estado: "sin_permiso" }).ok).toBe(false);
  });
});

const hayPG = Boolean(process.env.PG_TEST_URL_A);
const sufijo = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6)}`.replace(/[^a-z0-9]/g, "").slice(0, 8);

describe.skipIf(!hayPG)("P1-62 el servidor aplica el tope de la ficha", () => {
  let basePriv = "";
  const sku = `P162${sufijo}`.toUpperCase();
  const ids: string[] = [];
  const keys: string[] = [];

  function fijarMulti() {
    process.env.TENANT_MODE = "multi";
    process.env["TENANT_DATABASE_URL_tenant-a"] = basePriv;
  }

  beforeAll(async () => {
    basePriv = await asegurarBasePrivada("p1_62_fiado_tope", process.env.PG_TEST_URL_A ?? "");
    fijarMulti();
    resetStore();
    await conTenant("tenant-a", async () => {
      await getTenantDb().insert(products).values(filaPg({ sku, nombre: "Fiado tope", precioCentavos: 6000n, stockActual: 80 }));
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

  async function ficha(tope: bigint): Promise<string> {
    const id = randomUUID();
    ids.push(id);
    await conTenant("tenant-a", async () => {
      await getTenantDb().insert(customers).values(filaPg({ id, nombre: "Ana", topeCentavos: tope }));
    });
    return id;
  }

  function cookie(rol: "dueno" | "empleado"): string {
    const ahora = new Date();
    const sub = `${rol}-p162`;
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
      ownerGoogleSub: "dueno-p162",
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

  it("empleado que pasa el techo recibe 403 y no queda movimiento", async () => {
    fijarMulti();
    const id = await ficha(10_000n);
    const key = `p162-emp-${sufijo}`;
    keys.push(key);
    const r = (await conTenant("tenant-a", () =>
      postCuenta(
        ctx("http://x/api/credit/sales-on-account", {
          headers: { cookie: cookie("empleado"), "Idempotency-Key": key },
          body: {
            customer_id: id,
            lineas: [{ product_id: sku, qty: 2, precio_centavos: 6000 }],
            device_code: "p162-caja",
            seq_local: 1,
            tope_centavos: 999_999_999,
            saldo_actual_centavos: 0,
          },
        }),
      ),
    )) as Response;
    expect(r.status).toBe(403);
    const j = (await r.json()) as { error: string; codigo: string; disponible_centavos: string };
    expect(j.codigo).toBe("TOPE_SUPERADO");
    expect(j.disponible_centavos).toBe("10000");
    expect(j.error).toContain("Supera el tope");
    expect(j.error).toContain("pedile al dueño");
    expect(await movimientosDe(id)).toHaveLength(0);
  });

  it("el dueño en el mismo caso vende", async () => {
    fijarMulti();
    const id = await ficha(10_000n);
    const key = `p162-due-${sufijo}`;
    keys.push(key);
    const r = await conTenant("tenant-a", () =>
      ventaACuenta({
        key,
        customerId: id,
        lineas: [{ sku, qty: 2, precioCentavos: 6000 }],
        deviceCode: "p162-caja",
        seqLocal: 2,
        rol: "dueno",
        confirmacion: confirmacionDesdeCable(true),
      }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.fuente).toBe("db");
    expect(await movimientosDe(id)).toHaveLength(1);
  });

  it("tope 0 no bloquea al empleado", async () => {
    fijarMulti();
    const id = await ficha(0n);
    const key = `p162-abierto-${sufijo}`;
    keys.push(key);
    const r = await conTenant("tenant-a", () =>
      ventaACuenta({
        key,
        customerId: id,
        lineas: [{ sku, qty: 2, precioCentavos: 6000 }],
        deviceCode: "p162-caja",
        seqLocal: 3,
        rol: "empleado",
        confirmacion: sinConfirmarExceso(),
      }),
    );
    expect(r.ok).toBe(true);
    const bal = (await conTenant("tenant-a", () =>
      getBalance(ctx(`http://x/api/credit/balance?customer_id=${id}`)),
    )) as Response;
    const j = (await bal.json()) as { sin_tope: boolean; disponible_centavos: string | null; existe: boolean; saldo_centavos: string };
    expect(j.existe).toBe(true);
    expect(j.sin_tope).toBe(true);
    expect(j.disponible_centavos).toBeNull();
    expect(j.saldo_centavos).toBe("12000");
  });

  it("un uuid que no está en customers es 404", async () => {
    fijarMulti();
    const id = randomUUID();
    const key = `p162-ausente-${sufijo}`;
    keys.push(key);
    const r = await conTenant("tenant-a", () =>
      ventaACuenta({
        key,
        customerId: id,
        lineas: [{ sku, qty: 1, precioCentavos: 6000 }],
        deviceCode: "p162-caja",
        seqLocal: 4,
        rol: "empleado",
        confirmacion: sinConfirmarExceso(),
      }),
    );
    expect(r).toMatchObject({ ok: false, codigo: "CLIENTE_DESCONOCIDO", status: 404 });
    expect(await movimientosDe(id)).toHaveLength(0);
  });

  it("dos fiados concurrentes que juntos pasan el techo dejan uno solo", async () => {
    fijarMulti();
    const id = await ficha(10_000n);
    const k1 = `p162-c1-${sufijo}`;
    const k2 = `p162-c2-${sufijo}`;
    keys.push(k1, k2);
    const una = (key: string) =>
      conTenant("tenant-a", () =>
        ventaACuenta({
          key,
          customerId: id,
          lineas: [{ sku, qty: 1, precioCentavos: 6000 }],
          deviceCode: "p162-caja",
          seqLocal: 5,
          rol: "empleado",
          confirmacion: sinConfirmarExceso(),
        }),
      );
    const [a, b] = await Promise.all([una(k1), una(k2)]);
    const oks = [a, b].filter((r) => r.ok);
    const frenos = [a, b].filter((r) => !r.ok && r.codigo === "TOPE_SUPERADO");
    expect(oks).toHaveLength(1);
    expect(frenos).toHaveLength(1);
    expect(await movimientosDe(id)).toHaveLength(1);
  });
});
