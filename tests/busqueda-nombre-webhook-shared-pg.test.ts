import { createHmac, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { ctx } from "./helpers/ctx.js";
import { control, resetStore } from "../src/lib/store.js";
import { conTenant } from "../src/lib/tenant-mode.js";
import { getTenantDb } from "../src/lib/db.js";
import { products } from "../src/db/schema.js";
import { POST as postWebhook } from "../src/pages/api/whatsapp/webhook.js";
import { filaPg } from "./helpers/pg-tenant-fixture.js";

const hayPG = Boolean(process.env.PG_TEST_URL_A);
const SECRET = "wa-shared-busq-secret";
const NUM_A = "5491100002201";
const NUM_B = "5491100002202";

function firma(raw: string): string {
  return `sha256=${createHmac("sha256", SECRET).update(raw, "utf8").digest("hex")}`;
}

function sembrarComercio(tenantId: string, googleSub: string, numero: string, nombre: string) {
  control.tenants.set(tenantId, {
    id: tenantId,
    nombreComercio: nombre,
    slug: `slug-${tenantId.slice(0, 8)}`,
    estado: "activo",
    plan: "base",
    moneda: "ARS",
    ownerGoogleSub: googleSub,
    esDemo: false,
  });
  control.memberships.set(`m-${tenantId}`, {
    id: `m-${tenantId}`,
    tenantId,
    googleSub,
    rol: "dueno",
    permisos: [],
    estado: "activo",
    puedeUsarBot: true,
  });
  control.botLinks.set(`+${numero}`, { tenantId, googleSub, estado: "verificado" });
}

async function whatsappStock(from: string, texto: string): Promise<Record<string, unknown>> {
  const raw = JSON.stringify({
    entry: [{ changes: [{ value: { messages: [{ id: `wamid-${Date.now()}`, from, timestamp: "1729000000", type: "text", text: { body: texto } }] } }] }],
  });
  const res = (await postWebhook(
    ctx("http://x/api/whatsapp/webhook", { method: "POST", headers: { "X-Hub-Signature-256": firma(raw) }, body: raw }),
  )) as Response;
  return (await res.json()) as Record<string, unknown>;
}

describe.skipIf(!hayPG)("webhook shared PG consulta por nombre", () => {
  const tenantA = randomUUID();
  const tenantB = randomUUID();
  const term = `whshared${Date.now()}`;
  const skuA = `WA-SH-A-${term}`.toUpperCase();
  const skuB = `WA-SH-B-${term}`.toUpperCase();

  beforeAll(async () => {
    process.env.TENANT_MODE = "shared";
    process.env.TENANT_DATABASE_URL = process.env.PG_TEST_URL_A ?? "";
    process.env.WHATSAPP_APP_SECRET = SECRET;
    delete process.env.WHATSAPP_TOKEN;
    resetStore();
    sembrarComercio(tenantA, "g-wa-a", NUM_A, "Comercio A");
    sembrarComercio(tenantB, "g-wa-b", NUM_B, "Comercio B");
    await conTenant(tenantA, async () => {
      const db = getTenantDb();
      await db.insert(products).values(
        filaPg({ sku: skuA, nombre: `Yerba ${term} norte`, precioCentavos: 100n, stockActual: 11 }, tenantA),
      );
    });
    await conTenant(tenantB, async () => {
      const db = getTenantDb();
      await db.insert(products).values(
        filaPg({ sku: skuB, nombre: `Yerba ${term} sur`, precioCentavos: 100n, stockActual: 99 }, tenantB),
      );
    });
  });

  afterAll(async () => {
    await conTenant(tenantA, async () => {
      await getTenantDb().delete(products).where(eq(products.sku, skuA));
    });
    await conTenant(tenantB, async () => {
      await getTenantDb().delete(products).where(eq(products.sku, skuB));
    });
    delete process.env.TENANT_MODE;
    delete process.env.TENANT_DATABASE_URL;
    delete process.env.WHATSAPP_APP_SECRET;
    resetStore();
  });

  it("número de A encuentra stock de A y no el de B", async () => {
    const body = await whatsappStock(NUM_A, `cuantos yerba ${term} norte tengo`);
    expect(body["accion"]).toBe("consulta");
    const resp = String(body["respuesta"] ?? "");
    expect(resp).toContain("11 u.");
    expect(resp).not.toContain("99 u.");
    expect(resp).not.toContain("sur");
  });
});