import { describe, expect, it, beforeEach } from "vitest";
import type { APIContext } from "astro";
import { control, resetStore } from "../src/lib/store.js";
import { crearSesion } from "../src/modules/auth/sesiones.js";
import { POST as postTenants } from "../src/pages/api/tenants.js";
import { POST as postEmailSend } from "../src/pages/api/email/send.js";

function ctx(request: Request): APIContext {
  return { request } as APIContext;
}

function sesionAdmin(): string {
  const ahora = new Date();
  const c = crearSesion({ googleSub: "admin-sub", tenantId: null, ahora });
  control.sessions.set(c.registro.idHash, {
    idHash: c.registro.idHash,
    googleSub: "admin-sub",
    tenantId: null,
    expiraAt: c.registro.expiraAt,
    expiraAbsoluta: c.registro.expiraAbsoluta,
    lastSeenAt: ahora.toISOString(),
    reauthAt: ahora.toISOString(),
  });
  return c.idPlano;
}

function reqTenants(plano: string, body: unknown): Request {
  return new Request("http://x/api/tenants", {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: `__Host-sesion=${plano}` },
    body: JSON.stringify(body),
  });
}

function reqEmail(body: unknown, key: string): Request {
  return new Request("http://x/api/email/send", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": key },
    body: JSON.stringify(body),
  });
}

const PLAN_MSG = "El plan es inválido. Usá demo, base o plus.";

beforeEach(() => {
  resetStore();
  process.env.SUPERADMIN_SUBS = "admin-sub";
  delete process.env.TENANT_MODE;
  delete process.env.TENANT_DATABASE_URL;
  delete process.env["TENANT_DATABASE_URL_tenant-a"];
  delete process.env["TENANT_DATABASE_URL_tenant-b"];
});

describe("zod4 tenants: plan/moneda inválidos keeps 422 body", () => {
  it("plan enum inválido responde 422 con mensaje de plan", async () => {
    const plano = sesionAdmin();
    const r = (await postTenants(
      ctx(reqTenants(plano, { nombre_comercio: "Kiosco X", plan: "oro", owner_google_sub: "d", moneda: "ARS" })),
    )) as Response;
    expect(r.status).toBe(422);
    expect(await r.json()).toEqual({ error: PLAN_MSG });
  });

  it("moneda literal inválida responde 422 con mismo mensaje", async () => {
    const plano = sesionAdmin();
    const r = (await postTenants(
      ctx(reqTenants(plano, { nombre_comercio: "Kiosco X", plan: "base", owner_google_sub: "d", moneda: "USD" })),
    )) as Response;
    expect(r.status).toBe(422);
    expect(await r.json()).toEqual({ error: PLAN_MSG });
  });
});

describe("zod4 email/send vars record<string,string>", () => {
  it("vars válido de strings se encola (201/202)", async () => {
    const r = (await postEmailSend(
      ctx(reqEmail({ stream: "avisos", to: "a@b.com", plantilla: "cierre", vars: { fecha: "hoy" } }, `zod4-ok-${Date.now()}-1`)),
    )) as Response;
    expect([201, 202]).toContain(r.status);
  });

  it("vars con valor no-string responde 422", async () => {
    const r = (await postEmailSend(
      ctx(reqEmail({ stream: "avisos", to: "a@b.com", plantilla: "cierre", vars: { n: 123 } }, `zod4-bad-${Date.now()}-2`)),
    )) as Response;
    expect(r.status).toBe(422);
  });
});
