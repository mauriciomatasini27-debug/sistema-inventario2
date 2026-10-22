import { afterAll, beforeAll, describe, expect, it, beforeEach } from "vitest";
import { createHash } from "node:crypto";
import { sql, eq } from "drizzle-orm";
import { ctx } from "./helpers/ctx.js";
import { control, resetStore } from "../src/lib/store.js";
import { resetAdmin } from "../src/lib/admin-store.js";
import { crearSesion } from "../src/modules/auth/sesiones.js";
import { GET as GETTenants } from "../src/pages/api/admin/tenants.js";
import { GET as GETRollouts, POST as POSTRollout } from "../src/pages/api/admin/rollouts.js";
import { platformAdmins, migrationRollouts } from "../src/db/schema-admin.js";
import { getControlDb } from "../src/lib/db.js";
import { asegurarBasePrivada } from "./helpers/pg-privada.js";

const URL_A = process.env.PG_TEST_URL_A;

function adminSesion(sub: string): string {
  const ahora = new Date();
  const c = crearSesion({ googleSub: sub, tenantId: null, ahora });
  control.sessions.set(c.registro.idHash, { idHash: c.registro.idHash, googleSub: sub, tenantId: null, expiraAt: c.registro.expiraAt, expiraAbsoluta: c.registro.expiraAbsoluta, lastSeenAt: ahora.toISOString(), reauthAt: ahora.toISOString() });
  return c.idPlano;
}

function req(url: string, plano: string, body?: unknown) {
  return ctx(url, {
    method: body ? "POST" : "GET",
    ...(body !== undefined ? { body: body as Record<string, unknown> } : {}),
    headers: { cookie: `__Host-sesion=${plano}` },
  });
}

describe.skipIf(!URL_A)("P10-17 cutover admin: plataforma + rollouts", () => {
  const SUB = `p10-17-admin-${Date.now().toString(36)}`;

  beforeEach(() => { resetStore(); resetAdmin(); process.env.ADMIN_ALLOWLIST_SUBS = SUB; });

  beforeAll(async () => {
    process.env.ADMIN_ALLOWLIST_SUBS = SUB;
    process.env.CONTROL_DATABASE_URL = await asegurarBasePrivada("p10_17_admin_cutover", URL_A ?? "");
  });

  afterAll(async () => {
    delete process.env.CONTROL_DATABASE_URL;
  });

  it("exigirAdmin persiste el sub en platform_admins sin duplicar", async () => {
    const plano = adminSesion(SUB);
    control.tenants.set("t1", { id: "t1", nombreComercio: "K", slug: "k", estado: "activo", plan: "base", moneda: "ARS", ownerGoogleSub: "d1", esDemo: false });
    const g = (await GETTenants(req("http://x/api/admin/tenants", plano))) as Response;
    expect(g.status).toBe(200);
    // El insert es best-effort async: espera el microtask hasta ver la fila.
    const db = getControlDb();
    await expect
      .poll(async () => (await db.select().from(platformAdmins).where(eq(platformAdmins.googleSub, SUB))).length, { timeout: 5000 })
      .toBe(1);
    await GETTenants(req("http://x/api/admin/tenants", plano));
    await new Promise((r) => setTimeout(r, 50));
    expect((await db.select().from(platformAdmins).where(eq(platformAdmins.googleSub, SUB))).length).toBe(1);
  });

  it("rollouts POST mantiene 202 memoria; tenant no uuid no fila", async () => {
    const plano = adminSesion(SUB);
    const r = (await POSTRollout(req("http://x/api/admin/rollouts/reintentar", plano, { rollout_id: `p10-17-r-${Date.now().toString(36)}` }))) as Response;
    expect(r.status).toBe(202);
    const j = (await r.json()) as { rollout_id: string; estado: string; intentos: number };
    expect(j.estado).toBe("reintentando");
    expect(j.intentos).toBe(1);
    const db = getControlDb();
    await db.delete(migrationRollouts);
    await new Promise((r2) => setTimeout(r2, 100));
    const filas = await db.select().from(migrationRollouts);
    expect(filas).toHaveLength(0);
  });

  it("rollouts GET une la memoria con los intentos durables", async () => {
    const plano = adminSesion(SUB);
    const rolloutVivo = `p10-17-mem-${Date.now().toString(36)}`;
    await POSTRollout(req("http://x/api/admin/rollouts/reintentar", plano, { rollout_id: rolloutVivo }));
    const db = getControlDb();
    await db.insert(migrationRollouts).values({ tenantId: crypto.randomUUID(), estado: "reintentando", intentos: 3 });
    const g = (await GETRollouts(req("http://x/api/admin/rollouts", plano))) as Response;
    expect(g.status).toBe(200);
    const lista = ((await g.json()) as { rollouts: Array<{ id: string; tenantId: string; estado: string; intentos: number }> }).rollouts;
    const memoria = lista.find((x) => x.id === rolloutVivo);
    const durable = lista.find((x) => x.intentos === 3);
    expect(memoria).toBeTruthy();
    expect(durable).toBeTruthy();
    const hashDe = (v: unknown) => createHash("sha256").update(JSON.stringify(v ?? null)).digest("hex").slice(0, 8);
    expect(hashDe(memoria)).not.toBe(hashDe(durable));
  });

  it("sin CONTROL_DATABASE_URL la persistencia es silenciosa", async () => {
    const urlAntes = process.env.CONTROL_DATABASE_URL;
    delete process.env.CONTROL_DATABASE_URL;
    const plano = adminSesion(SUB);
    const r = (await POSTRollout(req("http://x/api/admin/rollouts/reintentar", plano, { rollout_id: `p10-17-sindb-${Date.now().toString(36)}` }))) as Response;
    expect(r.status).toBe(202);
    process.env.CONTROL_DATABASE_URL = urlAntes;
  });

  it("limpia al terminar", async () => {
    const db = getControlDb();
    await db.execute(sql`delete from platform_admins where google_sub like 'p10-17-%'`);
  });
});
