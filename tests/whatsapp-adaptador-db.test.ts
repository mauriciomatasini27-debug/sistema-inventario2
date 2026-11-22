import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { tenants, users, whatsappIdentities } from "../src/db/schema.js";
import { notificationPreferences } from "../src/db/schema-whatsapp.js";
import { comercios_con_bot, prefs_wa_de } from "../src/jobs/whatsapp-adaptador.js";
import { getControlDb, getTenantDb } from "../src/lib/db.js";
import { BaseNoDisponible } from "../src/lib/server-db.js";
import { control, resetStore } from "../src/lib/store.js";

// P10-29 (#296): el adaptador compartido de los jobs WA debe leer preferencias
// y vínculos verificados de Drizzle, con memoria solo para single/sin base.

const URL_A = process.env.PG_TEST_URL_A;
const TENANT = randomUUID();
const SUB = `sub-296-${randomUUID().slice(0, 8)}`;
const NUMERO_DB = "+5491100000296";
const NUMERO_MEM = "+5491100000297";
const ENV_KEYS = ["TENANT_MODE", "TENANT_DATABASE_URL", "CONTROL_DATABASE_URL", "DEFAULT_TENANT_ID"] as const;
type EnvKey = (typeof ENV_KEYS)[number];

function snapshotEnv(): Partial<Record<EnvKey, string | undefined>> {
  const snap: Partial<Record<EnvKey, string | undefined>> = {};
  for (const k of ENV_KEYS) snap[k] = process.env[k];
  return snap;
}

function restoreEnv(snap: Partial<Record<EnvKey, string | undefined>>): void {
  for (const k of ENV_KEYS) {
    const v = snap[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

function sembrarMemoria(numero: string, avisoHora: string, optIn: boolean): void {
  control.tenants.set(TENANT, {
    id: TENANT,
    nombreComercio: "Memoria",
    slug: "memoria-296",
    estado: "activo",
    plan: "base",
    moneda: "ARS",
    ownerGoogleSub: SUB,
    esDemo: false,
  });
  control.botLinks.set(numero, { tenantId: TENANT, googleSub: SUB, estado: "verificado" });
  control.waPrefs.set(`${TENANT}:${SUB}`, { optIn, avisoHora, pausadoHastaMs: null });
}

describe.skipIf(!URL_A)("adaptador WA: lecturas desde Drizzle", () => {
  let snap: Partial<Record<EnvKey, string | undefined>>;

  beforeAll(async () => {
    snap = snapshotEnv();
    process.env.TENANT_MODE = "shared";
    process.env.TENANT_DATABASE_URL = URL_A;
    process.env.CONTROL_DATABASE_URL = URL_A;
    delete process.env.DEFAULT_TENANT_ID;
    resetStore();

    const db = getTenantDb(TENANT);
    await db.insert(users).values({ googleSub: SUB, email: "wa296@ejemplo.com" }).onConflictDoNothing();
    await db
      .insert(tenants)
      .values({ id: TENANT, nombreComercio: "Drizzle", slug: `drizzle-296-${TENANT.slice(0, 8)}`, estado: "activo" })
      .onConflictDoNothing();
    await db
      .insert(notificationPreferences)
      .values({ tenantId: TENANT, googleSub: SUB, optIn: true, avisoHora: "09:45" })
      .onConflictDoUpdate({
        target: [notificationPreferences.tenantId, notificationPreferences.googleSub],
        set: { optIn: true, avisoHora: "09:45" },
      });
    await getControlDb()
      .insert(whatsappIdentities)
      .values({ tenantId: TENANT, googleSub: SUB, numero: NUMERO_DB, estado: "verificado" });

    // Memoria con datos distintos: si el adaptador la leyera, el test falla.
    sembrarMemoria(NUMERO_MEM, "07:00", false);
  });

  afterAll(async () => {
    const db = getTenantDb(TENANT);
    await db.delete(notificationPreferences).where(eq(notificationPreferences.tenantId, TENANT));
    await getControlDb().delete(whatsappIdentities).where(eq(whatsappIdentities.tenantId, TENANT));
    await db.delete(tenants).where(eq(tenants.id, TENANT));
    await db.delete(users).where(eq(users.googleSub, SUB));
    resetStore();
    restoreEnv(snap);
  });

  it("preferencias: lee notificationPreferences y no el mapa en memoria", async () => {
    expect(await prefs_wa_de(TENANT, SUB)).toMatchObject({ optIn: true, avisoHora: "09:45" });
  });

  it("links: lee whatsappIdentities/tenants de control y no el mapa en memoria", async () => {
    const comercios = await comercios_con_bot();
    expect(comercios.find((c) => c.tenantId === TENANT)).toMatchObject({
      numero: NUMERO_DB,
      nombreComercio: "Drizzle",
      prefs: { optIn: true, avisoHora: "09:45" },
    });
    expect(comercios.some((c) => c.numero === NUMERO_MEM)).toBe(false);
  });
});

describe("adaptador WA: memoria en single y 503 en multi", () => {
  let snap: Partial<Record<EnvKey, string | undefined>>;

  beforeEach(() => {
    snap = snapshotEnv();
    delete process.env.TENANT_MODE;
    delete process.env.TENANT_DATABASE_URL;
    delete process.env.CONTROL_DATABASE_URL;
    delete process.env.DEFAULT_TENANT_ID;
    resetStore();
  });

  afterEach(() => restoreEnv(snap));

  it("single sin base mantiene el fallback a memoria", async () => {
    sembrarMemoria(NUMERO_MEM, "08:30", true);
    expect(await prefs_wa_de(TENANT, SUB)).toMatchObject({ optIn: true, avisoHora: "08:30" });
    expect((await comercios_con_bot()).find((c) => c.tenantId === TENANT)).toMatchObject({
      numero: NUMERO_MEM,
      nombreComercio: "Memoria",
      prefs: { optIn: true, avisoHora: "08:30" },
    });
  });

  it("multi sin base propaga BaseNoDisponible (503) en vez de usar memoria", async () => {
    sembrarMemoria(NUMERO_MEM, "08:30", true);
    process.env.TENANT_MODE = "multi";
    await expect(prefs_wa_de(TENANT, SUB)).rejects.toBeInstanceOf(BaseNoDisponible);
    await expect(comercios_con_bot()).rejects.toBeInstanceOf(BaseNoDisponible);
  });
});
