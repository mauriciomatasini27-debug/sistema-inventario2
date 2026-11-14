import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { and, eq } from "drizzle-orm";
import { getControlDb } from "../src/lib/db.js";
import { asegurarAltaPendiente } from "../src/lib/control-db.js";
import { rehidratarMembresias } from "../src/lib/rehidratar-membresia.js";
import { control, resetStore } from "../src/lib/store.js";
import { memberships, provisionJobs, tenantDatabases, tenants, users } from "../src/db/schema.js";
const hayPG = Boolean(process.env.PG_TEST_URL_A);
const SUB = "dueno-rubro-pg";

async function baseControlMigrada(nombreDb: string, urlReferencia: string): Promise<string> {
  const u = new URL(urlReferencia);
  u.pathname = `/${nombreDb}`;
  const url = u.toString();
  const mantenimiento = new URL(urlReferencia);
  mantenimiento.pathname = "/postgres";
  const admin = postgres(mantenimiento.toString(), { max: 1 });
  try {
    await admin.unsafe(`CREATE DATABASE "${nombreDb}"`);
  } catch (e) {
    if (typeof e !== "object" || e === null || !("code" in e) || e.code !== "42P04") throw e;
  } finally {
    await admin.end();
  }
  execFileSync("node", ["scripts/db-migrate.mjs"], {
    env: { ...process.env, TENANT_DATABASE_URL: url },
    stdio: "pipe",
  });
  return url;
}

describe.skipIf(!hayPG)("P1-79 rubro en control Postgres", () => {
  let urlControl = "";

  beforeAll(async () => {
    urlControl = await baseControlMigrada("tenant_rubro_pg", process.env.PG_TEST_URL_A ?? "");
    process.env.CONTROL_DATABASE_URL = urlControl;
  }, 120_000);

  afterAll(async () => {
    if (!urlControl) return;
    const db = getControlDb();
    const owned = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.ownerGoogleSub, SUB));
    for (const t of owned) {
      await db.delete(provisionJobs).where(eq(provisionJobs.tenantId, t.id));
      await db.delete(tenantDatabases).where(eq(tenantDatabases.tenantId, t.id));
    }
    await db.delete(memberships).where(eq(memberships.googleSub, SUB));
    await db.delete(tenants).where(eq(tenants.ownerGoogleSub, SUB));
    await db.delete(users).where(eq(users.googleSub, SUB));
    delete process.env.CONTROL_DATABASE_URL;
  });

  it("rehidratarMembresias lee tenants.rubro sin loader mockeado", async () => {
    resetStore();
    const db = getControlDb();
    const tenantId = randomUUID();
    const memId = randomUUID();
    await db.delete(memberships).where(eq(memberships.googleSub, SUB));
    await db.delete(tenants).where(eq(tenants.id, tenantId));
    await db
      .insert(users)
      .values({ googleSub: SUB, email: "rubro-pg@test.local", emailVerificado: true })
      .onConflictDoNothing();
    await db.insert(tenants).values({
      id: tenantId,
      nombreComercio: "Kiosco PG",
      slug: `kiosco-pg-${tenantId.slice(0, 8)}`,
      estado: "activo",
      plan: "demo",
      moneda: "ARS",
      ownerGoogleSub: SUB,
      esDemo: true,
      rubro: "kiosco",
    });
    await db.insert(memberships).values({
      id: memId,
      tenantId,
      googleSub: SUB,
      rol: "dueno",
      permisos: [],
      estado: "activo",
    });

    resetStore();
    await rehidratarMembresias(SUB);

    expect(control.tenants.get(tenantId)?.rubro).toBe("kiosco");
  }, 30_000);

  it("asegurarAltaPendiente completa rubro NULL sin pisar uno existente", async () => {
    resetStore();
    const db = getControlDb();
    await db
      .insert(users)
      .values({ googleSub: SUB, email: "rubro-pg@test.local", emailVerificado: true })
      .onConflictDoNothing();
    const tenantId = randomUUID();
    await db.insert(tenants).values({
      id: tenantId,
      nombreComercio: "Sin rubro",
      slug: `sin-rubro-${tenantId.slice(0, 8)}`,
      estado: "pendiente",
      plan: "demo",
      moneda: "ARS",
      ownerGoogleSub: SUB,
      esDemo: true,
      requestKey: "rk-rubro-pg",
    });
    const base = {
      id: tenantId,
      nombreComercio: "Sin rubro",
      slug: `sin-rubro-${tenantId.slice(0, 8)}`,
      plan: "demo" as const,
      moneda: "ARS",
      ownerGoogleSub: SUB,
      esDemo: true,
      requestKey: "rk-rubro-pg",
      database: `db_${tenantId.slice(0, 8)}`,
      jobId: randomUUID(),
    };
    const alta = (rubro: string) =>
      asegurarAltaPendiente({
        ...base,
        rubro,
        jobId: randomUUID(),
      });

    await alta("almacen");
    let fila = await db.select({ rubro: tenants.rubro }).from(tenants).where(eq(tenants.id, tenantId));
    expect(fila[0]?.rubro).toBe("almacen");

    await alta("libreria");
    fila = await db.select({ rubro: tenants.rubro }).from(tenants).where(eq(tenants.id, tenantId));
    expect(fila[0]?.rubro).toBe("almacen");

    await db.update(tenants).set({ rubro: null }).where(and(eq(tenants.id, tenantId)));
    await alta("despensa");
    fila = await db.select({ rubro: tenants.rubro }).from(tenants).where(eq(tenants.id, tenantId));
    expect(fila[0]?.rubro).toBe("despensa");
  }, 30_000);
});