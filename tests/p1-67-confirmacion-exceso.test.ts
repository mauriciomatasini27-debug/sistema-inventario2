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
import { MS_POR_DIA, texto_bloqueo_mora } from "../src/modules/credit/saldos.js";
import { POST as postCuenta } from "../src/pages/api/credit/sales-on-account.js";
import { ctx } from "./helpers/ctx.js";
import { asegurarBasePrivada } from "./helpers/pg-privada.js";
import { filaPg } from "./helpers/pg-tenant-fixture.js";

describe("P1-67 el cable de confirmado_exceso", () => {
  it("un string en confirmado_exceso es 422", async () => {
    delete process.env.TENANT_MODE;
    const r = (await postCuenta(
      ctx("http://x/api/credit/sales-on-account", {
        headers: { "Idempotency-Key": "p167-tipo" },
        body: {
          customer_id: randomUUID(),
          lineas: [{ product_id: "P167", qty: 1, precio_centavos: 100 }],
          device_code: "p167-caja",
          seq_local: 1,
          confirmado_exceso: "true",
        },
      }),
    )) as Response;
    expect(r.status).toBe(422);
  });
});

const hayPG = Boolean(process.env.PG_TEST_URL_A);
const sufijo = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6)}`.replace(/[^a-z0-9]/g, "").slice(0, 8);

describe.skipIf(!hayPG)("P1-67 confirmación de exceso en la venta a cuenta", () => {
  let basePriv = "";
  const sku = `P167${sufijo}`.toUpperCase();
  const ids: string[] = [];
  const keys: string[] = [];
  let seq = 1;

  function fijarMulti() {
    process.env.TENANT_MODE = "multi";
    process.env["TENANT_DATABASE_URL_tenant-a"] = basePriv;
  }

  beforeAll(async () => {
    basePriv = await asegurarBasePrivada("p1_67_exceso", process.env.PG_TEST_URL_A ?? "");
    fijarMulti();
    resetStore();
    await conTenant("tenant-a", async () => {
      await getTenantDb().insert(products).values(filaPg({ sku, nombre: "Fiado exceso", precioCentavos: 1500n, stockActual: 80 }));
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

  async function ficha(topeCentavos: bigint): Promise<string> {
    const id = randomUUID();
    ids.push(id);
    await conTenant("tenant-a", async () => {
      await getTenantDb().insert(customers).values(filaPg({ id, nombre: "Ana", topeCentavos }));
    });
    return id;
  }

  async function deuda(customerId: string, debe: bigint, dias: number) {
    const key = `p167-deuda-${randomUUID()}`;
    keys.push(key);
    const cuando = new Date(Date.now() - (dias * MS_POR_DIA + 1000));
    await conTenant("tenant-a", async () => {
      await getTenantDb().insert(customerMovements).values(
        filaPg({
          customerId,
          tipo: "venta",
          debeCentavos: debe,
          haberCentavos: 0n,
          idempotencyKey: key,
          clientOccurredAt: cuando,
        }),
      );
    });
  }

  function cookie(rol: "dueno" | "empleado"): string {
    const ahora = new Date();
    const sub = `${rol}-p167`;
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
      ownerGoogleSub: "dueno-p167",
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

  async function vender(
    rol: "dueno" | "empleado",
    customerId: string,
    key: string,
    linea: { qty: number; precio: number },
    extra: { confirmado_exceso?: boolean } = {},
  ) {
    keys.push(key);
    const n = seq;
    seq += 1;
    return (await conTenant("tenant-a", () =>
      postCuenta(
        ctx("http://x/api/credit/sales-on-account", {
          headers: { cookie: cookie(rol), "Idempotency-Key": key },
          body: {
            customer_id: customerId,
            lineas: [{ product_id: sku, qty: linea.qty, precio_centavos: linea.precio }],
            device_code: "p167-caja",
            seq_local: n,
            ...(extra.confirmado_exceso === undefined ? {} : { confirmado_exceso: extra.confirmado_exceso }),
          },
        }),
      ),
    )) as Response;
  }

  function conClave(movs: Awaited<ReturnType<typeof movimientosDe>>, key: string) {
    return movs.filter((m) => m.idempotencyKey === key);
  }

  it("el empleado que supera el tope sigue en 403 aunque mande el flag", async () => {
    fijarMulti();
    const id = await ficha(10_000n);
    const stock = await stockActual();
    const key = `p167-emp-tope-${sufijo}`;
    const r = await vender("empleado", id, key, { qty: 2, precio: 6000 }, { confirmado_exceso: true });
    expect(r.status).toBe(403);
    const j = (await r.json()) as { codigo: string; error: string; disponible_centavos: string };
    expect(j.codigo).toBe("TOPE_SUPERADO");
    expect(j.disponible_centavos).toBe("10000");
    expect(j.error).toContain("pedile al dueño");
    expect(await stockActual()).toBe(stock);
    expect(conClave(await movimientosDe(id), key)).toHaveLength(0);
  });

  it("el empleado en mora sigue en 403 aunque mande el flag", async () => {
    fijarMulti();
    const id = await ficha(0n);
    await deuda(id, 4000n, 15);
    const stock = await stockActual();
    const key = `p167-emp-mora-${sufijo}`;
    const r = await vender("empleado", id, key, { qty: 1, precio: 1500 }, { confirmado_exceso: true });
    expect(r.status).toBe(403);
    const j = (await r.json()) as { codigo: string; error: string; dias_max: number };
    expect(j.codigo).toBe("MORA");
    expect(j.error).toBe(texto_bloqueo_mora(j.dias_max));
    expect(j.error).toContain("pedile al dueño");
    expect(await stockActual()).toBe(stock);
    expect(conClave(await movimientosDe(id), key)).toHaveLength(0);
  });

  it("con tope y mora el empleado recibe solo TOPE_SUPERADO", async () => {
    fijarMulti();
    const id = await ficha(10_000n);
    await deuda(id, 4000n, 15);
    const key = `p167-emp-ambos-${sufijo}`;
    const r = await vender("empleado", id, key, { qty: 2, precio: 6000 }, { confirmado_exceso: true });
    expect(r.status).toBe(403);
    expect(((await r.json()) as { codigo: string }).codigo).toBe("TOPE_SUPERADO");
    expect(conClave(await movimientosDe(id), key)).toHaveLength(0);
  });

  it("el dueño sin flag no escribe y con la misma clave confirma el tope", async () => {
    fijarMulti();
    const id = await ficha(10_000n);
    const stock = await stockActual();
    const key = `p167-due-tope-${sufijo}`;
    const bloqueado = await vender("dueno", id, key, { qty: 2, precio: 6000 });
    expect(bloqueado.status).toBe(403);
    const j = (await bloqueado.json()) as {
      codigo: string;
      error: string;
      supera_tope: boolean;
      supera_mora: boolean;
      disponible_centavos: string | null;
      dias_max: number | null;
      confirmacion: { titulo: string; mensaje: string; accion: string };
    };
    expect(j.codigo).toBe("CONFIRMACION_EXCESO");
    expect(j.supera_tope).toBe(true);
    expect(j.supera_mora).toBe(false);
    expect(j.disponible_centavos).toBe("10000");
    expect(j.dias_max).toBeNull();
    expect(j.confirmacion).toEqual({
      titulo: "Vender a cuenta igual",
      mensaje: "Esta venta supera el límite. Disponible: $100.00.",
      accion: "Vender igual",
    });
    expect(j.error).toBe(j.confirmacion.mensaje);
    expect(j.error).not.toContain("pedile al dueño");
    expect(await stockActual()).toBe(stock);
    expect(conClave(await movimientosDe(id), key)).toHaveLength(0);

    const vendido = await vender("dueno", id, key, { qty: 2, precio: 6000 }, { confirmado_exceso: true });
    expect(vendido.status).toBe(201);
    const ok = (await vendido.json()) as { supera_tope: boolean; supera_mora: boolean };
    expect(ok.supera_tope).toBe(true);
    expect(ok.supera_mora).toBe(false);
    expect(conClave(await movimientosDe(id), key)).toHaveLength(1);
    expect(await stockActual()).toBe(stock - 2);

    const otra = await vender("dueno", id, key, { qty: 2, precio: 6000 }, { confirmado_exceso: true });
    expect(otra.status).toBe(409);
    expect(conClave(await movimientosDe(id), key)).toHaveLength(1);
    expect(await stockActual()).toBe(stock - 2);
  });

  it("false es lo mismo que omitir el flag", async () => {
    fijarMulti();
    const id = await ficha(10_000n);
    const key = `p167-due-false-${sufijo}`;
    const r = await vender("dueno", id, key, { qty: 2, precio: 6000 }, { confirmado_exceso: false });
    expect(r.status).toBe(403);
    expect(((await r.json()) as { codigo: string }).codigo).toBe("CONFIRMACION_EXCESO");
    expect(conClave(await movimientosDe(id), key)).toHaveLength(0);
  });

  it("el dueño en mora confirma con la misma clave y queda marcado", async () => {
    fijarMulti();
    const id = await ficha(0n);
    await deuda(id, 4000n, 15);
    const stock = await stockActual();
    const key = `p167-due-mora-${sufijo}`;
    const bloqueado = await vender("dueno", id, key, { qty: 1, precio: 1500 });
    expect(bloqueado.status).toBe(403);
    const j = (await bloqueado.json()) as {
      codigo: string;
      error: string;
      supera_tope: boolean;
      supera_mora: boolean;
      dias_max: number;
      confirmacion: { mensaje: string };
    };
    expect(j.codigo).toBe("CONFIRMACION_EXCESO");
    expect(j.supera_tope).toBe(false);
    expect(j.supera_mora).toBe(true);
    expect(j.dias_max).toBeGreaterThanOrEqual(15);
    expect(j.error).toBe(`Este cliente está en mora: ${j.dias_max} días con saldo.`);
    expect(j.confirmacion.mensaje).toBe(j.error);
    expect(j.error).not.toContain("pedile al dueño");
    expect(await stockActual()).toBe(stock);
    expect(conClave(await movimientosDe(id), key)).toHaveLength(0);

    const vendido = await vender("dueno", id, key, { qty: 1, precio: 1500 }, { confirmado_exceso: true });
    expect(vendido.status).toBe(201);
    const ok = (await vendido.json()) as { supera_tope: boolean; supera_mora: boolean };
    expect(ok.supera_mora).toBe(true);
    expect(ok.supera_tope).toBe(false);
    expect(conClave(await movimientosDe(id), key)).toHaveLength(1);
    expect(await stockActual()).toBe(stock - 1);
  });

  it("tope y mora juntos viajan en un solo 403 y en el 201", async () => {
    fijarMulti();
    const id = await ficha(10_000n);
    await deuda(id, 4000n, 15);
    const key = `p167-due-ambos-${sufijo}`;
    const bloqueado = await vender("dueno", id, key, { qty: 2, precio: 6000 });
    expect(bloqueado.status).toBe(403);
    const j = (await bloqueado.json()) as {
      codigo: string;
      error: string;
      supera_tope: boolean;
      supera_mora: boolean;
      dias_max: number;
      disponible_centavos: string;
    };
    expect(j.codigo).toBe("CONFIRMACION_EXCESO");
    expect(j.supera_tope).toBe(true);
    expect(j.supera_mora).toBe(true);
    expect(j.dias_max).toBeGreaterThanOrEqual(15);
    expect(j.disponible_centavos).toBe("6000");
    expect(j.error).toBe(
      `Esta venta supera el límite. Disponible: $60.00. Este cliente está en mora: ${j.dias_max} días con saldo.`,
    );
    expect(conClave(await movimientosDe(id), key)).toHaveLength(0);

    const vendido = await vender("dueno", id, key, { qty: 2, precio: 6000 }, { confirmado_exceso: true });
    expect(vendido.status).toBe(201);
    const ok = (await vendido.json()) as { supera_tope: boolean; supera_mora: boolean };
    expect(ok.supera_tope).toBe(true);
    expect(ok.supera_mora).toBe(true);
    expect(conClave(await movimientosDe(id), key)).toHaveLength(1);
  });

  it("dentro del límite el dueño vende con las dos marcas en false", async () => {
    fijarMulti();
    const id = await ficha(100_000n);
    const sinFlag = `p167-dentro-${sufijo}`;
    const r = await vender("dueno", id, sinFlag, { qty: 1, precio: 1500 });
    expect(r.status).toBe(201);
    const limpio = (await r.json()) as { supera_tope: boolean; supera_mora: boolean };
    expect(limpio.supera_tope).toBe(false);
    expect(limpio.supera_mora).toBe(false);
    const conFlag = `p167-dentro-flag-${sufijo}`;
    const otra = await vender("dueno", id, conFlag, { qty: 1, precio: 1500 }, { confirmado_exceso: true });
    expect(otra.status).toBe(201);
    const marcado = (await otra.json()) as { supera_tope: boolean; supera_mora: boolean };
    expect(marcado.supera_tope).toBe(false);
    expect(marcado.supera_mora).toBe(false);
  });
});
