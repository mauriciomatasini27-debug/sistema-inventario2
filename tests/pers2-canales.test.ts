import { readFileSync } from "node:fs";
import { describe, expect, it, beforeEach, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { ctx } from "./helpers/ctx.js";
import { control, resetStore } from "../src/lib/store.js";
import { conTenant } from "../src/lib/tenant-mode.js";
import { getTenantDb } from "../src/lib/db.js";
import { crearSesion } from "../src/modules/auth/sesiones.js";
import { emailOutbox } from "../src/db/schema-email.js";
import { whatsappSessions } from "../src/db/schema-whatsapp.js";
import { guardarSesion, leerSesion } from "../src/lib/repos/whatsapp.js";
import { GET as GETConsult } from "../src/pages/api/whatsapp/consult.js";
import { POST as POSTWebhook } from "../src/pages/api/whatsapp/webhook.js";
import { POST as POSTSend } from "../src/pages/api/email/send.js";
import { POST as POSTClose } from "../src/pages/api/email/close-summary.js";

const RUTAS_SIN_STORE = [
  "src/pages/api/whatsapp/consult.ts",
  "src/pages/api/whatsapp/webhook.ts",
  "src/pages/api/email/send.ts",
  "src/pages/api/email/close-summary.ts",
];

function importaStoreBinding(ruta: string): boolean {
  const texto = readFileSync(ruta, "utf8");
  return texto.split("\n").some((linea) => {
    if (!/lib\/store/.test(linea)) return false;
    if (/^\s*import\s+type\b/.test(linea)) return false;
    if (/^\s*import\s*\{\s*control\s*\}\s*from/.test(linea)) return false;
    return true;
  });
}

describe("PERS2-S10/S11 AT9: whatsapp/email sin store (ADR-0055)", () => {
  it("las 4 rutas no importan el binding store (import type y control permitidos)", () => {
    const mal = RUTAS_SIN_STORE.filter(importaStoreBinding);
    expect(mal).toEqual([]);
  });
});

const AHORA = new Date("2026-10-12T12:00:00.000Z");

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

function reqJson(url: string, body: unknown, headers: Record<string, string> = {}) {
  return ctx(url, { method: "POST", body: body as Record<string, unknown>, headers });
}

describe("PERS2-S10/S11 single sin DB: canales se comportan como hoy", () => {
  beforeEach(() => {
    modoSingleSinDb();
    resetStore();
  });

  it("consult exige sesión y responde desde memoria con fuente", async () => {
    const anon = (await GETConsult(ctx("http://x/api/whatsapp/consult?term=stock"))) as Response;
    expect(anon.status).toBe(403);
    const plano = sesion("u-1");
    const r = (await GETConsult(
      ctx("http://x/api/whatsapp/consult?term=stock", { headers: { cookie: `__Host-sesion=${plano}` } }),
    )) as Response;
    expect(r.status).toBe(200);
    expect(((await r.json()) as Record<string, unknown>)["fuente"]).toBe("memoria");
  });

  it("email/send 202 sin key + 409 duplicado", async () => {
    const e1 = (await POSTSend(reqJson("http://x/api/email/send", { stream: "avisos", to: "a@b.com", plantilla: "cierre", vars: { fecha: "hoy" } }, { "Idempotency-Key": "pers2-canales-m1" }))) as Response;
    expect([201, 202]).toContain(e1.status);
    const e2 = (await POSTSend(reqJson("http://x/api/email/send", { stream: "avisos", to: "a@b.com", plantilla: "cierre", vars: {} }, { "Idempotency-Key": "pers2-canales-m1" }))) as Response;
    expect(e2.status).toBe(409);
  });

  it("close-summary 201 + replay 409 misma jornada", async () => {
    const body = {
      tenant_id: "t-1",
      cierre_id: "c-1",
      fecha_jornada: "2026-10-12",
      destinatario: "dueno@kiosco.example",
      nombre_comercio: "Kiosco",
      tipo: "manual",
    };
    const r1 = (await POSTClose(reqJson("http://x/api/email/close-summary", body))) as Response;
    expect(r1.status).toBe(201);
    const r2 = (await POSTClose(reqJson("http://x/api/email/close-summary", body))) as Response;
    expect(r2.status).toBe(409);
  });

  it("webhook rechaza firma inválida con 403", async () => {
    const r = (await POSTWebhook(ctx("http://x/api/whatsapp/webhook", { method: "POST", body: {} as Record<string, unknown> }))) as Response;
    expect(r.status).toBe(403);
  });
});

const hayPG = Boolean(process.env.PG_TEST_URL_A && process.env.PG_TEST_URL_B);
const sufijoPG = `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6)}`;

function fijarMulti() {
  process.env.TENANT_MODE = "multi";
  process.env["TENANT_DATABASE_URL_tenant-a"] = process.env.PG_TEST_URL_A ?? "";
  process.env["TENANT_DATABASE_URL_tenant-b"] = process.env.PG_TEST_URL_B ?? "";
}

const emailKey = `pers2-email-pg-${sufijoPG}`;
const numeroWA = `+54911${String(Date.now()).slice(-8)}`;

async function borrarRastroPG() {
  for (const tenant of ["tenant-a", "tenant-b"] as const) {
    await conTenant(tenant, async () => {
      const db = getTenantDb();
      await db.delete(emailOutbox).where(eq(emailOutbox.idempotencyKey, emailKey));
      await db.delete(whatsappSessions).where(eq(whatsappSessions.numeroE164, numeroWA));
    });
  }
}

describe.skipIf(!hayPG)("PERS2-S10/S11 multi con PG local: email y sesión aislados por tenant", () => {
  beforeAll(() => {
    fijarMulti();
    resetStore();
  });

  afterAll(async () => {
    fijarMulti();
    await borrarRastroPG();
    delete process.env.TENANT_MODE;
    delete process.env["TENANT_DATABASE_URL_tenant-a"];
    delete process.env["TENANT_DATABASE_URL_tenant-b"];
  });

  it("un email encolado en A queda en email_outbox de A y B no lo ve", async () => {
    fijarMulti();
    const r = await conTenant("tenant-a", () =>
      POSTSend(reqJson("http://x/api/email/send", { stream: "avisos", to: "a@b.com", plantilla: "cierre", vars: { fecha: "hoy" } }, { "Idempotency-Key": emailKey })),
    ) as Response;
    expect([201, 202]).toContain(r.status);

    const filasA = await conTenant("tenant-a", async () => {
      const db = getTenantDb();
      return db.select().from(emailOutbox).where(eq(emailOutbox.idempotencyKey, emailKey));
    });
    expect(filasA.length).toBe(1);
    const filasB = await conTenant("tenant-b", async () => {
      const db = getTenantDb();
      return db.select().from(emailOutbox).where(eq(emailOutbox.idempotencyKey, emailKey));
    });
    expect(filasB.length).toBe(0);
  });

  it("una sesión de WhatsApp guardada en A no es visible en B", async () => {
    fijarMulti();
    const ahoraMs = Date.now();
    await conTenant("tenant-a", () => guardarSesion(numeroWA, "alertas", { pagina: 1 }, ahoraMs));

    const enA = await conTenant("tenant-a", () => leerSesion(numeroWA, ahoraMs));
    expect(enA?.paso).toBe("alertas");
    const enB = await conTenant("tenant-b", () => leerSesion(numeroWA, ahoraMs));
    expect(enB).toBeNull();

    const filasA = await conTenant("tenant-a", async () => {
      const db = getTenantDb();
      return db.select().from(whatsappSessions).where(eq(whatsappSessions.numeroE164, numeroWA));
    });
    expect(filasA.length).toBe(1);
    const filasB = await conTenant("tenant-b", async () => {
      const db = getTenantDb();
      return db.select().from(whatsappSessions).where(eq(whatsappSessions.numeroE164, numeroWA));
    });
    expect(filasB.length).toBe(0);
  });
});
