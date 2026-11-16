import { describe, expect, it, beforeEach, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { ctx } from "./helpers/ctx.js";
import { resetStore } from "../src/lib/store.js";
import { getTenantDb } from "../src/lib/db.js";
import { mpWebhookEvents } from "../src/db/schema.js";
import { olvidarEventosMpEnMemoria, reclamarEventoMp } from "../src/lib/repos/mp-webhooks.js";
import { vincularPreaprobacionTenant } from "../src/lib/repos/planes.js";
import { POST as POSTMp } from "../src/pages/api/billing/webhooks/mercadopago.js";
import { asegurarBasePrivada } from "./helpers/pg-privada.js";
import { activarTenantPgEnSingle } from "./helpers/pg-tenant-fixture.js";

function modoSingleSinDb() {
  delete process.env.TENANT_MODE;
  delete process.env.TENANT_DATABASE_URL;
  delete process.env["TENANT_DATABASE_URL_tenant-a"];
  delete process.env["TENANT_DATABASE_URL_tenant-b"];
}

function mp(url: string, body: Record<string, unknown>) {
  return ctx(url, { method: "POST", body, headers: { "x-test": "true" } });
}

describe("P0-5 webhook MP single sin DB: 201 + 409 duplicado en memoria", () => {
  beforeEach(() => {
    modoSingleSinDb();
    resetStore();
    olvidarEventosMpEnMemoria();
    process.env.MP_WEBHOOK_ALLOW_TEST = "1";
    delete process.env.MP_WEBHOOK_SECRET;
    delete process.env.NODE_ENV;
  });

  it("con preapproval vinculado sin URL no abre getTenantDb y usa memoria", async () => {
    const preId = "p05-pre-vinc";
    vincularPreaprobacionTenant(preId, "tenant-vinc");
    const clave = `${preId}:activo`;
    expect(await reclamarEventoMp(clave, preId, "activo")).toBe(true);
    expect(await reclamarEventoMp(clave, preId, "activo")).toBe(false);
  });

  it("el segundo evento idéntico responde 409 con la misma clave", async () => {
    const cuerpo = { preapproval_id: `p05-mem-${Date.now().toString(36)}`, estado: "activo" };
    const primero = (await POSTMp(mp("http://x/api/billing/webhooks/mercadopago", cuerpo))) as Response;
    expect(primero.status).toBe(201);
    const segundo = (await POSTMp(mp("http://x/api/billing/webhooks/mercadopago", cuerpo))) as Response;
    expect(segundo.status).toBe(409);
    expect(await segundo.json()).toEqual({
      error: "duplicado",
      key: `${cuerpo.preapproval_id}:${cuerpo.estado}`,
    });
  });
});

const hayPG = Boolean(process.env.PG_TEST_URL_A && process.env.PG_TEST_URL_B);
const sufijoPG = `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6)}`;

describe.skipIf(!hayPG)("P0-5 webhook MP con PG: el replay sobrevive al olvido en memoria", () => {
  const claves: string[] = [];

  beforeEach(() => {
    process.env.MP_WEBHOOK_ALLOW_TEST = "1";
    delete process.env.MP_WEBHOOK_SECRET;
    delete process.env.NODE_ENV;
  });

  afterAll(async () => {
    if (!process.env.TENANT_DATABASE_URL) return;
    for (const clave of claves) {
      await getTenantDb().delete(mpWebhookEvents).where(eq(mpWebhookEvents.clave, clave));
    }
    delete process.env.TENANT_DATABASE_URL;
    delete process.env.DEFAULT_TENANT_ID;
  });

  it("tras limpiar la memoria el evento repetido sigue dando 409 por la tabla", async () => {
    const url = await asegurarBasePrivada("p05_mp_webhook", process.env.PG_TEST_URL_A ?? "");
    delete process.env.TENANT_MODE;
    process.env.TENANT_DATABASE_URL = url;
    activarTenantPgEnSingle();
    resetStore();
    olvidarEventosMpEnMemoria();

    const preapprovalId = `p05-pg-${sufijoPG}`;
    const clave = `${preapprovalId}:activo`;
    claves.push(clave);
    const cuerpo = { preapproval_id: preapprovalId, estado: "activo" };
    const primero = (await POSTMp(mp("http://x/api/billing/webhooks/mercadopago", cuerpo))) as Response;
    expect(primero.status).toBe(201);

    olvidarEventosMpEnMemoria();
    const filas = await getTenantDb().select().from(mpWebhookEvents).where(eq(mpWebhookEvents.clave, clave));
    expect(filas.length).toBe(1);

    const replay = (await POSTMp(mp("http://x/api/billing/webhooks/mercadopago", cuerpo))) as Response;
    expect(replay.status).toBe(409);
    expect(await replay.json()).toEqual({ error: "duplicado", key: clave });
  });
});
