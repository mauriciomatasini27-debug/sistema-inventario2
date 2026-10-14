import { describe, expect, it } from "vitest";
import { ctx } from "./helpers/ctx.js";
import { control, resetStore } from "../src/lib/store.js";
import { tenantPorDefecto } from "../src/lib/tenant-context.js";
import { crearSesion } from "../src/modules/auth/sesiones.js";
import { POST as POSTSettings, GET as GETSettings } from "../src/pages/api/fiscal/settings.js";
import { GET as GETCustomers } from "../src/pages/api/fiscal/customers.js";
import { POST as POSTEmail } from "../src/pages/api/email/send.js";
import { POST as POSTEnqueue } from "../src/pages/api/jobs/enqueue.js";
import { POST as POSTMp } from "../src/pages/api/billing/webhooks/mercadopago.js";
import { POST as POSTWatch } from "../src/pages/api/gmail/watch.js";
import { POST as POSTWebhook } from "../src/pages/api/gmail/webhook.js";
import { extraer_items } from "../src/modules/ocr/motor.js";

function req(url: string, body: unknown, headers?: Record<string, string>): Request {
  return new Request(url, { method: "POST", headers: { "Content-Type": "application/json", ...(headers ?? {}) }, body: JSON.stringify(body) });
}

describe("N2-4 fiscal + canales", () => {
  it("settings 201 + CUIT inválido 422 + customers padrón stub", async () => {
    resetStore();
    const tenant = tenantPorDefecto();
    control.tenants.set(tenant, {
      id: tenant,
      nombreComercio: "Kiosco",
      slug: "kiosco",
      estado: "activo",
      plan: "base",
      moneda: "ARS",
      ownerGoogleSub: "dueno-1",
      esDemo: false,
    });
    control.memberships.set("m-dueno-1", {
      id: "m-dueno-1",
      tenantId: tenant,
      googleSub: "dueno-1",
      rol: "dueno",
      permisos: [],
      estado: "activo",
    });
    const ahora = new Date();
    const ses = crearSesion({ googleSub: "dueno-1", tenantId: null, ahora });
    control.sessions.set(ses.registro.idHash, {
      idHash: ses.registro.idHash,
      googleSub: "dueno-1",
      tenantId: null,
      expiraAt: ses.registro.expiraAt,
      expiraAbsoluta: ses.registro.expiraAbsoluta,
      lastSeenAt: ahora.toISOString(),
      reauthAt: ahora.toISOString(),
    });
    const auth = { cookie: `__Host-sesion=${ses.idPlano}` };
    const ok = (await POSTSettings({ request: req("http://x/api/fiscal/settings", { cuit: "20-93333172-6", razon_social: "Kiosco", domicilio: "Calle 1", condicion_iva: "responsable_inscripto", inicio_actividades: "2020-01-01", pto_vta: "3" }, auth) } as never)) as Response;
    expect(ok.status).toBe(201);
    const bad = (await POSTSettings({ request: req("http://x/api/fiscal/settings", { cuit: "123", razon_social: "X", domicilio: "Y", condicion_iva: "monotributo", inicio_actividades: "2020-01-01", pto_vta: "1" }, auth) } as never)) as Response;
    expect(bad.status).toBe(422);
    const c = (await GETCustomers(ctx("http://x/api/fiscal/customers?cuit=20933331726"))) as Response;
    expect((await c.json() as { origen: string }).origen).toBe("padron");
  });
  it("email/send 202 sin key + 409 duplicado + jobs/enqueue + MP webhook", async () => {
    resetStore();
    const e1 = (await POSTEmail({ request: req("http://x/api/email/send", { stream: "avisos", to: "a@b.com", plantilla: "cierre", vars: { fecha: "hoy" } }, { "Idempotency-Key": "m1" }) } as never)) as Response;
    expect([201, 202]).toContain(e1.status);
    const e2 = (await POSTEmail({ request: req("http://x/api/email/send", { stream: "avisos", to: "a@b.com", plantilla: "cierre", vars: {} }, { "Idempotency-Key": "m1" }) } as never)) as Response;
    expect(e2.status).toBe(409);
    const j = (await POSTEnqueue({ request: req("http://x/api/jobs/enqueue", { nombre: "cierre_caja", payload: {} }, { "Idempotency-Key": "j1" }) } as never)) as Response;
    expect(j.status).toBe(201);
    const mp = (await POSTMp({ request: req("http://x/api/billing/webhooks/mercadopago", { preapproval_id: "pre1", estado: "activo" }, { "x-test": "true" }) } as never)) as Response;
    expect(mp.status).toBe(201);
  });
  it("gmail watch + webhook 200 + ocr items", async () => {
    const w = (await POSTWatch({ request: req("http://x/api/gmail/watch", { user_id: "a@b.com", topic: "projects/x/topics/y" }) } as never)) as Response;
    expect(w.status).toBe(201);
    const h = (await POSTWebhook({ request: req("http://x/api/gmail/webhook", { email: "a@b.com", historyId: "123" }) } as never)) as Response;
    expect(h.status).toBe(200);
    expect(extraer_items("2 x Yerba 500g $5.000,00\n1 Azucar $1.200").length).toBe(2);
  });
});
