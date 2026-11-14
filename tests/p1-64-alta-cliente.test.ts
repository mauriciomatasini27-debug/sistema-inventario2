import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { customerMovements, customers } from "../src/db/schema-credito.js";
import { products, sales, stockMovements, ticketLines, tickets } from "../src/db/schema.js";
import { ticketDiscounts } from "../src/db/schema-tickets.js";
import { getTenantDb } from "../src/lib/db.js";
import { altaClienteRapida, listarClientes, ventaACuenta } from "../src/lib/repos/fiado.js";
import { sinConfirmarExceso } from "../src/modules/credit/fiado.js";
import { control, resetStore } from "../src/lib/store.js";
import { conTenant } from "../src/lib/tenant-mode.js";
import { crearSesion } from "../src/modules/auth/sesiones.js";
import { GET as getBalance } from "../src/pages/api/credit/balance.js";
import { GET as getCustomers, POST as postCustomers } from "../src/pages/api/credit/customers.js";
import { ctx } from "./helpers/ctx.js";
import { asegurarBasePrivada } from "./helpers/pg-privada.js";
import { filaPg } from "./helpers/pg-tenant-fixture.js";

function limpiarEntorno(): void {
  resetStore();
  delete process.env.TENANT_MODE;
  delete process.env.TENANT_DATABASE_URL;
  delete process.env["TENANT_DATABASE_URL_tenant-a"];
  delete process.env["TENANT_DATABASE_URL_tenant-b"];
}

describe("POST /api/credit/customers sin ficha en la base", () => {
  beforeEach(() => {
    limpiarEntorno();
  });

  it("niega a quien no tiene permiso y no inventa un cliente", async () => {
    const ahora = new Date();
    const c = crearSesion({ googleSub: "nadie-p164", tenantId: "t-164", ahora });
    control.sessions.set(c.registro.idHash, {
      idHash: c.registro.idHash,
      googleSub: "nadie-p164",
      tenantId: "t-164",
      expiraAt: c.registro.expiraAt,
      expiraAbsoluta: c.registro.expiraAbsoluta,
      lastSeenAt: ahora.toISOString(),
      reauthAt: ahora.toISOString(),
    });
    const r = (await postCustomers(
      ctx("http://x/api/credit/customers", {
        headers: { cookie: `__Host-sesion=${c.idPlano}` },
        body: { nombre: "Ana", telefono: "1133334444" },
      }),
    )) as Response;
    expect(r.status).toBe(403);
    expect(await r.json()).toEqual({ error: "No tenés permiso en este comercio." });
  });

  it("sin postgres responde 503 y no manda customer_id", async () => {
    const r = (await postCustomers(
      ctx("http://x/api/credit/customers", {
        body: { nombre: "Ana", telefono: "1133334444" },
      }),
    )) as Response;
    expect(r.status).toBe(503);
    expect(await r.json()).toEqual({ error: "base_no_disponible" });
  });

  it("en multi sin base responde 503 y no manda customer_id", async () => {
    process.env.TENANT_MODE = "multi";
    const r = (await conTenant("tenant-a", () =>
      postCustomers(
        ctx("http://x/api/credit/customers", {
          body: { nombre: "Ana", telefono: "1133334444" },
        }),
      ),
    )) as Response;
    expect(r.status).toBe(503);
    const j = (await r.json()) as Record<string, unknown>;
    expect(j).toEqual({ error: "base_no_disponible" });
    expect(j).not.toHaveProperty("customer_id");
  });

  it("rechaza json que no parsea", async () => {
    const r = (await postCustomers(
      ctx("http://x/api/credit/customers", { body: "{roto" }),
    )) as Response;
    expect(r.status).toBe(422);
    expect(await r.json()).toEqual({ error: "json invalido" });
  });

  it("rechaza un tope en el cuerpo antes de tocar la base", async () => {
    const r = (await postCustomers(
      ctx("http://x/api/credit/customers", {
        body: { nombre: "Ana", telefono: "1133334444", tope_centavos: 1 },
      }),
    )) as Response;
    expect(r.status).toBe(422);
    const j = (await r.json()) as { error: unknown };
    expect(typeof j.error).toBe("object");
  });
});

const hayPG = Boolean(process.env.PG_TEST_URL_A);
const digitos = String(Date.now()).slice(-8);

describe.skipIf(!hayPG)("P1-64 alta rápida de cliente", () => {
  let basePriv = "";
  let baseB = "";
  const sku = `P164${digitos}`;
  const ids: string[] = [];
  const keys: string[] = [];

  function fijarMulti() {
    process.env.TENANT_MODE = "multi";
    process.env["TENANT_DATABASE_URL_tenant-a"] = basePriv;
    process.env["TENANT_DATABASE_URL_tenant-b"] = baseB;
  }

  beforeAll(async () => {
    basePriv = await asegurarBasePrivada("p1_64_alta_cliente", process.env.PG_TEST_URL_A ?? "");
    baseB = await asegurarBasePrivada("p1_64_alta_cliente_b", process.env.PG_TEST_URL_A ?? "");
    fijarMulti();
    resetStore();
    await conTenant("tenant-a", async () => {
      await getTenantDb().insert(products).values(filaPg({ sku, nombre: "Alta cliente", precioCentavos: 1000n, stockActual: 40 }));
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
    delete process.env["TENANT_DATABASE_URL_tenant-b"];
  });

  function cookieEmpleado(): string {
    const ahora = new Date();
    const sub = "empleado-p164";
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
      ownerGoogleSub: "dueno-p164",
      esDemo: false,
    });
    control.memberships.set("m-empleado-p164", {
      id: "m-empleado-p164",
      tenantId: "tenant-a",
      googleSub: sub,
      rol: "empleado",
      permisos: [],
      estado: "activo",
    });
    return `__Host-sesion=${c.idPlano}`;
  }

  async function post(body: Record<string, unknown>, cookie?: string) {
    const headers: Record<string, string> = {};
    if (cookie) headers.cookie = cookie;
    return (await conTenant("tenant-a", () =>
      postCustomers(ctx("http://x/api/credit/customers", { headers, body })),
    )) as Response;
  }

  async function filasPorTelefono(telefono: string) {
    return conTenant("tenant-a", () => getTenantDb().select().from(customers).where(eq(customers.telefono, telefono)));
  }

  it("crea la fila, el buscador la muestra y la venta a cuenta la encuentra", async () => {
    fijarMulti();
    const telefono = `11${digitos}`;
    const r = await post({ nombre: `  Ana   Pérez ${digitos} `, telefono: `+54 9 ${telefono}` });
    expect(r.status).toBe(201);
    const j = (await r.json()) as { customer_id: string; nombre: string };
    expect(j.nombre).toBe(`Ana Pérez ${digitos}`);
    expect(Object.keys(j).sort()).toEqual(["customer_id", "nombre"]);
    ids.push(j.customer_id);

    const filas = await filasPorTelefono(`549${telefono}`);
    expect(filas).toHaveLength(1);
    expect(filas[0]?.id).toBe(j.customer_id);
    expect(filas[0]?.topeCentavos).toBe(0n);
    expect(filas[0]?.plazoDias).toBe(30);
    expect(filas[0]?.dni).toBeNull();
    expect(filas[0]?.notas).toBeNull();

    const listaRes = (await conTenant("tenant-a", () =>
      getCustomers(ctx(`http://x/api/credit/customers?q=${encodeURIComponent(j.nombre)}`)),
    )) as Response;
    const lista = (await listaRes.json()) as { items: Array<Record<string, unknown>> };
    const item = lista.items.find((i) => i["customer_id"] === j.customer_id);
    expect(Object.keys(item ?? {}).sort()).toEqual(["customer_id", "nombre"]);

    const saldoRes = (await conTenant("tenant-a", () =>
      getBalance(ctx(`http://x/api/credit/balance?customer_id=${j.customer_id}`)),
    )) as Response;
    const saldo = (await saldoRes.json()) as { existe: boolean; sin_tope: boolean };
    expect(saldo.existe).toBe(true);
    expect(saldo.sin_tope).toBe(true);

    const otro = await conTenant("tenant-b", () => listarClientes());
    expect(otro.fuente).toBe("db");
    expect(otro.clientes.some((c) => c.customerId === j.customer_id)).toBe(false);

    const key = `p164-venta-${digitos}`;
    keys.push(key);
    const venta = await conTenant("tenant-a", () =>
      ventaACuenta({
        key,
        customerId: j.customer_id,
        lineas: [{ sku, qty: 1, precioCentavos: 1000 }],
        deviceCode: "p164-caja",
        seqLocal: 1,
        rol: "empleado",
        confirmacion: sinConfirmarExceso(),
      }),
    );
    expect(venta).toMatchObject({ ok: true });
  });

  it("el empleado sin permisos extra también crea", async () => {
    fijarMulti();
    const telefono = `12${digitos}`;
    const r = await post({ nombre: `Empleado ${digitos}`, telefono }, cookieEmpleado());
    expect(r.status).toBe(201);
    const j = (await r.json()) as { customer_id: string; nombre: string };
    ids.push(j.customer_id);
    expect(j.nombre).toBe(`Empleado ${digitos}`);
    expect(await filasPorTelefono(telefono)).toHaveLength(1);
  });

  it("el mismo teléfono o el mismo nombre responden 409 con la ficha guardada", async () => {
    fijarMulti();
    const telefono = `13${digitos}`;
    const primero = await post({ nombre: `Beto ${digitos}`, telefono: `+54 9 ${telefono}` });
    expect(primero.status).toBe(201);
    const creado = (await primero.json()) as { customer_id: string; nombre: string };
    ids.push(creado.customer_id);

    const porTelefono = await post({ nombre: `Otro ${digitos}`, telefono: `549${telefono}` });
    expect(porTelefono.status).toBe(409);
    const dupTel = (await porTelefono.json()) as {
      codigo: string;
      existente: { customer_id: string; nombre: string };
    };
    expect(dupTel.codigo).toBe("DUPLICADO");
    expect(dupTel.existente).toEqual({ customer_id: creado.customer_id, nombre: creado.nombre });
    expect(await filasPorTelefono(`549${telefono}`)).toHaveLength(1);

    const porNombre = await post({ nombre: `  beto   ${digitos} `, telefono: `14${digitos}` });
    expect(porNombre.status).toBe(409);
    const dupNom = (await porNombre.json()) as { existente: { customer_id: string; nombre: string } };
    expect(dupNom.existente).toEqual({ customer_id: creado.customer_id, nombre: `Beto ${digitos}` });
    expect(await filasPorTelefono(`14${digitos}`)).toHaveLength(0);
  });

  it("dos altas paralelas del mismo teléfono dejan una sola fila", async () => {
    fijarMulti();
    const telefono = `15${digitos}`;
    const nombre = `Paralelo ${digitos}`;
    const [a, b] = await Promise.all([
      conTenant("tenant-a", () => altaClienteRapida({ nombre, telefono })),
      conTenant("tenant-a", () => altaClienteRapida({ nombre, telefono })),
    ]);
    const resultados = [a, b];
    const creado = resultados.find((r) => r.ok);
    const dup = resultados.find((r) => !r.ok);
    expect(creado?.ok).toBe(true);
    expect(dup?.ok).toBe(false);
    if (!creado?.ok || !dup || dup.ok) return;
    if (dup.codigo !== "DUPLICADO") {
      expect(dup.codigo).toBe("DUPLICADO");
      return;
    }
    expect(dup.existente.customerId).toBe(creado.customerId);
    expect(dup.existente.nombre).toBe(nombre);
    ids.push(creado.customerId);
    expect(await filasPorTelefono(telefono)).toHaveLength(1);
  });

  it("nombre vacío o teléfono corto no dejan fila", async () => {
    fijarMulti();
    const vacio = await post({ nombre: "   ", telefono: `16${digitos}` });
    expect(vacio.status).toBe(422);
    expect(await vacio.json()).toMatchObject({ error: "nombre requerido" });
    expect(await filasPorTelefono(`16${digitos}`)).toHaveLength(0);

    const corto = await post({ nombre: `Corto ${digitos}`, telefono: "12345" });
    expect(corto.status).toBe(422);
    expect(await corto.json()).toMatchObject({ error: "telefono debe tener 6 a 20 digitos" });
    expect(await filasPorTelefono("12345")).toHaveLength(0);
  });

  it("un campo de más no deja fila", async () => {
    fijarMulti();
    const telefono = `17${digitos}`;
    const r = await post({ nombre: `Tope ${digitos}`, telefono, tope_centavos: 9 });
    expect(r.status).toBe(422);
    const j = (await r.json()) as { error: unknown };
    expect(typeof j.error).toBe("object");
    expect(await filasPorTelefono(telefono)).toHaveLength(0);
  });
});
