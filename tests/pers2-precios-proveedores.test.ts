import { readFileSync } from "node:fs";
import { describe, expect, it, beforeEach, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { control, resetStore } from "../src/lib/store.js";
import { conTenant } from "../src/lib/tenant-mode.js";
import { getTenantDb } from "../src/lib/db.js";
import { crearSesion } from "../src/modules/auth/sesiones.js";
import { normalizarCuit, validarCuit } from "../src/modules/purchases/proveedores.js";
import { priceAdjustments, pricingAuditLog } from "../src/db/schema-precios.js";
import { suppliers } from "../src/db/schema-proveedores.js";
import { POST as postAdjust } from "../src/pages/api/prices/adjustments.js";
import { POST as postSupplier } from "../src/pages/api/suppliers.js";

const RUTAS_SIN_STORE = ["src/pages/api/prices/adjustments.ts", "src/pages/api/suppliers.ts"];

function importaStoreBinding(ruta: string): boolean {
  const texto = readFileSync(ruta, "utf8");
  return texto.split("\n").some((linea) => {
    if (!/lib\/store/.test(linea)) return false;
    if (/^\s*import\s*\{\s*control\s*\}\s*from/.test(linea)) return false;
    return true;
  });
}

describe("PERS2-S6/S7 AT7b: prices/adjustments y suppliers sin store (ADR-0053)", () => {
  it("ninguna de las 2 rutas importa el binding store (adjustments puede importar control)", () => {
    const mal = RUTAS_SIN_STORE.filter(importaStoreBinding);
    expect(mal).toEqual([]);
  });
});

const AHORA = new Date("2026-10-10T12:00:00.000Z");

function modoSingleSinDb() {
  delete process.env.TENANT_MODE;
  delete process.env.TENANT_DATABASE_URL;
  delete process.env["TENANT_DATABASE_URL_tenant-a"];
  delete process.env["TENANT_DATABASE_URL_tenant-b"];
}

function sesion(sub: string): string {
  const c = crearSesion({ googleSub: sub, tenantId: null, ahora: AHORA });
  control.sessions.set(c.registro.idHash, {
    idHash: c.registro.idHash,
    googleSub: sub,
    tenantId: null,
    expiraAt: c.registro.expiraAt,
    expiraAbsoluta: c.registro.expiraAbsoluta,
    lastSeenAt: AHORA.toISOString(),
  });
  return c.idPlano;
}

function duenoDe(tenantId: string, sub: string) {
  control.tenants.set(tenantId, {
    id: tenantId,
    nombreComercio: "Kiosco",
    slug: "kiosco",
    estado: "activo",
    plan: "base",
    moneda: "ARS",
    ownerGoogleSub: sub,
    esDemo: false,
  });
  control.memberships.set(`m-${sub}`, { id: `m-${sub}`, tenantId, googleSub: sub, rol: "dueno", permisos: [], estado: "activo" });
}

function reqJson(url: string, body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(url, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });
}

const AJUSTE = {
  direccion: "suba",
  porcentaje: 10,
  vigencia_tipo: "ahora",
  aplica_en: null,
  confirmado: true,
  creado_por: "dueno-1",
  items: [{ sku: "demo-sku-1", vigente_centavos: 15000 }],
};

const CUIT = "20-93333172-6";

describe("PERS2-S6/S7 single sin DB: idempotencia como hoy", () => {
  beforeEach(() => {
    modoSingleSinDb();
    resetStore();
  });

  it("el mismo ajuste dos veces: 201 con ajuste_id y luego 409", async () => {
    duenoDe("t1", "dueno-1");
    const due = sesion("dueno-1");
    const key = `pers2-aj-${Date.now()}`;
    const headers = { "Idempotency-Key": key, cookie: `__Host-sesion=${due}` };
    const r1 = (await postAdjust({ request: reqJson("http://x/api/prices/adjustments", { ...AJUSTE, tenant_id: "t1" }, headers) } as never)) as Response;
    expect(r1.status).toBe(201);
    expect(((await r1.json()) as { ajuste_id: string }).ajuste_id).toMatch(/^aj-/);
    const r2 = (await postAdjust({ request: reqJson("http://x/api/prices/adjustments", { ...AJUSTE, tenant_id: "t1" }, headers) } as never)) as Response;
    expect(r2.status).toBe(409);
    expect(((await r2.json()) as { error: string }).error).toMatch(/idempotency-key repetida/);
  });

  it("el mismo CUIT dos veces: 201 y luego 409", async () => {
    const r1 = (await postSupplier({ request: reqJson("http://x/api/suppliers", { cuit: CUIT, nombre: "Distribuidora Sur" }) } as never)) as Response;
    expect(r1.status).toBe(201);
    const r2 = (await postSupplier({ request: reqJson("http://x/api/suppliers", { cuit: CUIT, nombre: "Distribuidora Sur" }) } as never)) as Response;
    expect(r2.status).toBe(409);
    expect(((await r2.json()) as { error: string }).error).toMatch(/proveedor ya existe/);
  });
});

const hayPG = Boolean(process.env.PG_TEST_URL_A && process.env.PG_TEST_URL_B);
const sufijoPG = `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6)}`;

function fijarMulti() {
  process.env.TENANT_MODE = "multi";
  process.env["TENANT_DATABASE_URL_tenant-a"] = process.env.PG_TEST_URL_A ?? "";
  process.env["TENANT_DATABASE_URL_tenant-b"] = process.env.PG_TEST_URL_B ?? "";
}

function cuitUnicoPG(): string {
  const base = `20${Date.now().toString().slice(-8)}`;
  for (let d = 0; d <= 9; d++) {
    const candidato = `${base}${d}`;
    if (validarCuit(candidato)) return candidato;
  }
  throw new Error("sin CUIT valido para PG");
}

async function borrarRastroPG(keysAjuste: string[], cuits: string[]) {
  for (const tenant of ["tenant-a", "tenant-b"] as const) {
    await conTenant(tenant, async () => {
      const db = getTenantDb();
      for (const key of keysAjuste) {
        const filas = await db.select({ id: priceAdjustments.id }).from(priceAdjustments).where(eq(priceAdjustments.idempotencyKey, key));
        for (const f of filas) {
          await db.delete(pricingAuditLog).where(eq(pricingAuditLog.ajusteId, f.id));
        }
        await db.delete(priceAdjustments).where(eq(priceAdjustments.idempotencyKey, key));
      }
      for (const cuit of cuits) {
        await db.delete(suppliers).where(eq(suppliers.cuit, cuit));
      }
    });
  }
}

describe.skipIf(!hayPG)("PERS2-S6/S7 multi con PG local: ajuste idempotente y CUIT aislado", () => {
  const ajusteKey = `pers2-pg-aj-${sufijoPG}`;
  const cuitPG = cuitUnicoPG();
  const keys = [ajusteKey];
  const cuits = [normalizarCuit(cuitPG)];

  beforeAll(() => {
    fijarMulti();
    resetStore();
  });

  afterAll(async () => {
    fijarMulti();
    await borrarRastroPG(keys, cuits);
    delete process.env.TENANT_MODE;
    delete process.env["TENANT_DATABASE_URL_tenant-a"];
    delete process.env["TENANT_DATABASE_URL_tenant-b"];
  });

  it("repito el mismo ajuste en A: una sola fila y 409; B no la ve", async () => {
    fijarMulti();
    duenoDe("tenant-a", "dueno-a");
    const due = sesion("dueno-a");
    const headers = { "Idempotency-Key": ajusteKey, cookie: `__Host-sesion=${due}` };
    const cuerpo = { ...AJUSTE, tenant_id: "tenant-a" };
    const r1 = await conTenant("tenant-a", () => postAdjust({ request: reqJson("http://x/api/prices/adjustments", cuerpo, headers) } as never));
    expect((r1 as Response).status).toBe(201);
    expect(((await (r1 as Response).json()) as { fuente: string }).fuente).toBe("db");
    const r2 = await conTenant("tenant-a", () => postAdjust({ request: reqJson("http://x/api/prices/adjustments", cuerpo, headers) } as never));
    expect((r2 as Response).status).toBe(409);

    const filasA = await conTenant("tenant-a", async () => {
      const db = getTenantDb();
      return db.select().from(priceAdjustments).where(eq(priceAdjustments.idempotencyKey, ajusteKey));
    });
    expect(filasA.length).toBe(1);
    const filasB = await conTenant("tenant-b", async () => {
      const db = getTenantDb();
      return db.select().from(priceAdjustments).where(eq(priceAdjustments.idempotencyKey, ajusteKey));
    });
    expect(filasB.length).toBe(0);
  });

  it("el mismo CUIT dos veces en A: 409 y una fila; B no lo ve", async () => {
    fijarMulti();
    const cuerpo = { cuit: cuitPG, nombre: "Proveedor PG" };
    const r1 = await conTenant("tenant-a", () => postSupplier({ request: reqJson("http://x/api/suppliers", cuerpo) } as never));
    expect((r1 as Response).status).toBe(201);
    expect(((await (r1 as Response).json()) as { fuente: string }).fuente).toBe("db");
    const r2 = await conTenant("tenant-a", () => postSupplier({ request: reqJson("http://x/api/suppliers", cuerpo) } as never));
    expect((r2 as Response).status).toBe(409);

    const digitos = normalizarCuit(cuitPG);
    const filasA = await conTenant("tenant-a", async () => {
      const db = getTenantDb();
      return db.select().from(suppliers).where(eq(suppliers.cuit, digitos));
    });
    expect(filasA.length).toBe(1);
    const filasB = await conTenant("tenant-b", async () => {
      const db = getTenantDb();
      return db.select().from(suppliers).where(eq(suppliers.cuit, digitos));
    });
    expect(filasB.length).toBe(0);
  });

  it("B crea el mismo CUIT que A sin colisión (201) y cada base tiene una fila", async () => {
    fijarMulti();
    const cuerpo = { cuit: cuitPG, nombre: "Proveedor PG cruzado" };
    const rA = await conTenant("tenant-a", () => postSupplier({ request: reqJson("http://x/api/suppliers", cuerpo) } as never));
    expect([201, 409]).toContain((rA as Response).status);
    const rB = await conTenant("tenant-b", () => postSupplier({ request: reqJson("http://x/api/suppliers", cuerpo) } as never));
    expect((rB as Response).status).toBe(201);
    const digitos = normalizarCuit(cuitPG);
    for (const t of ["tenant-a", "tenant-b"] as const) {
      const filas = await conTenant(t, async () => getTenantDb().select().from(suppliers).where(eq(suppliers.cuit, digitos)));
      expect(filas.length).toBe(1);
    }
  });
});
