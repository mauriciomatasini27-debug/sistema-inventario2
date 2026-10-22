import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { ctx } from "./helpers/ctx.js";
import { resetStore } from "../src/lib/store.js";
import { conTenant } from "../src/lib/tenant-mode.js";
import { getTenantDb } from "../src/lib/db.js";
import { GET as GETSnap, POST as POSTSnap } from "../src/pages/api/analytics/snapshots.js";
import { POST as POSTPromo, restablecerVistasPromo } from "../src/pages/api/analytics/promos.js";
import { rotationSnapshots, promoIntents } from "../src/db/schema-analytics.js";
import { asegurarBasePrivada } from "./helpers/pg-privada.js";

const URL_A = process.env.PG_TEST_URL_A;
const URL_B = process.env.PG_TEST_URL_B;

const VENTANA = { desde: "2026-10-01", hasta: "2026-10-07", origen: "manual" as const };
const CLAVE = `rotacion:${VENTANA.desde}:${VENTANA.hasta}:${VENTANA.origen}`;

function pedirSnapshot() {
  return ctx("http://x/api/analytics/snapshots", { body: VENTANA });
}

function leerSnapshot() {
  return ctx(`http://x/api/analytics/snapshots?desde=${VENTANA.desde}&hasta=${VENTANA.hasta}&origen=${VENTANA.origen}`);
}

function pedirPromo(key: string) {
  return ctx("http://x/api/analytics/promos", {
    headers: { "Idempotency-Key": key },
    body: { pct: 10, skus: ["demo-sku-1"], confirmado: true, idempotency_key: key },
  });
}

describe.skipIf(!URL_A)("P10-19 analytics single: snapshots y promos durables", () => {
  let base = "";
  let db: ReturnType<typeof getTenantDb>;

  beforeAll(async () => {
    base = await asegurarBasePrivada("p10_19_analytics_single", URL_A ?? "");
    process.env.TENANT_DATABASE_URL = base;
    delete process.env.TENANT_MODE;
    db = getTenantDb();
    await db.delete(rotationSnapshots);
    await db.delete(promoIntents);
  });

  afterAll(() => {
    delete process.env.TENANT_DATABASE_URL;
  });

  beforeEach(() => {
    resetStore();
    restablecerVistasPromo();
  });

  it("POST guarda el snapshot en rotation_snapshots con bigints como string", async () => {
    const r = (await POSTSnap(pedirSnapshot())) as Response;
    expect(r.status).toBe(201);
    const fila = (await db.select().from(rotationSnapshots).where(eq(rotationSnapshots.dedupeKey, CLAVE)))[0];
    expect(fila).toBeTruthy();
    const payload = fila!.payload as { filas: Array<Record<string, unknown>>; creadoEn: string };
    expect(payload.filas.length).toBeGreaterThan(0);
    expect(typeof payload.filas[0]!.costoCentavos).toBe("string");
    expect(fila!.payloadHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("GET lee la fila durable aunque la memoria diga otra cosa", async () => {
    const original = (await db.select().from(rotationSnapshots).where(eq(rotationSnapshots.dedupeKey, CLAVE)))[0]!;
    const payload = original.payload as { filas: unknown[]; creadoEn: string; origen: string };
    await db
      .update(rotationSnapshots)
      .set({ payload: { ...payload, creadoEn: "2020-01-01T00:00:00.000Z" } })
      .where(eq(rotationSnapshots.dedupeKey, CLAVE));
    const g = (await GETSnap(leerSnapshot())) as Response;
    expect(g.status).toBe(200);
    const j = (await g.json()) as { creado_en: string; filas: number };
    expect(j.creado_en).toBe("2020-01-01T00:00:00.000Z");
    expect(j.filas).toBe(payload.filas.length);
  });

  it("el mismo snapshot repetido responde 409", async () => {
    const r = (await POSTSnap(pedirSnapshot())) as Response;
    expect(r.status).toBe(409);
  });
});

describe.skipIf(!(URL_A && URL_B))("P10-19 analytics multi: aislamiento por tenant", () => {
  let dbA: ReturnType<typeof getTenantDb>;
  let dbB: ReturnType<typeof getTenantDb>;

  beforeAll(async () => {
    const urlA = await asegurarBasePrivada("p10_19_analytics_a", URL_A ?? "");
    const urlB = await asegurarBasePrivada("p10_19_analytics_b", URL_B ?? URL_A ?? "");
    process.env.TENANT_MODE = "multi";
    process.env["TENANT_DATABASE_URL_tenant-a"] = urlA;
    process.env["TENANT_DATABASE_URL_tenant-b"] = urlB;
    dbA = getTenantDb("tenant-a");
    dbB = getTenantDb("tenant-b");
    // Las bases privadas sobreviven entre corridas: arrancan limpias.
    await dbA.delete(rotationSnapshots);
    await dbA.delete(promoIntents);
    await dbB.delete(rotationSnapshots);
    await dbB.delete(promoIntents);
  });

  afterAll(() => {
    delete process.env.TENANT_MODE;
    delete process.env["TENANT_DATABASE_URL_tenant-a"];
    delete process.env["TENANT_DATABASE_URL_tenant-b"];
  });

  beforeEach(() => {
    resetStore();
    restablecerVistasPromo();
  });

  it("snapshot de A no se lee ni deduplica en B", async () => {
    const a = (await conTenant("tenant-a", () => POSTSnap(pedirSnapshot()))) as Response;
    expect(a.status).toBe(201);
    expect(await dbA.select().from(rotationSnapshots).where(eq(rotationSnapshots.dedupeKey, CLAVE))).toHaveLength(1);
    expect(await dbB.select().from(rotationSnapshots)).toHaveLength(0);
    const gb = (await conTenant("tenant-b", () => GETSnap(leerSnapshot()))) as Response;
    expect(gb.status).toBe(404);
    const ga = (await conTenant("tenant-a", () => GETSnap(leerSnapshot()))) as Response;
    expect(ga.status).toBe(200);
    const b = (await conTenant("tenant-b", () => POSTSnap(pedirSnapshot()))) as Response;
    expect(b.status).toBe(201);
  });

  it("sin base propia la lectura responde 503", async () => {
    const g = (await conTenant("tenant-c", () => GETSnap(leerSnapshot()))) as Response;
    expect(g.status).toBe(503);
    expect(((await g.json()) as { error: string }).error).toBe("base_no_disponible");
  });

  it("la idempotencia de promos vive en la base del tenant", async () => {
    const a = (await conTenant("tenant-a", () => POSTPromo(pedirPromo("p10-19-promo-a")))) as Response;
    expect(a.status).toBe(201);
    const filasA = await dbA.select().from(promoIntents).where(eq(promoIntents.idempotencyKey, "p10-19-promo-a"));
    expect(filasA).toHaveLength(1);
    expect(filasA[0]!.estado).toBe("confirmada");
    const otra = (await conTenant("tenant-a", () => POSTPromo(pedirPromo("p10-19-promo-a")))) as Response;
    expect(otra.status).toBe(409);
    const b = (await conTenant("tenant-b", () => POSTPromo(pedirPromo("p10-19-promo-a")))) as Response;
    expect(b.status).toBe(201);
    expect(await dbB.select().from(promoIntents)).toHaveLength(1);
  });

  it("promos sin base responde 503", async () => {
    const r = (await conTenant("tenant-c", () => POSTPromo(pedirPromo("p10-19-promo-c")))) as Response;
    expect(r.status).toBe(503);
  });
});
