import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import { ctx } from "./helpers/ctx.js";
import {
  crearProveedorCobro,
  MORA_COBRO_DIAS,
  olvidarPlanesEnMemoria,
  planIncluye,
  registrarEstadoCobroMp,
  registrarUso,
  solicitarPreaprobacionPlan,
  vincularPreaprobacionTenant,
} from "../src/lib/repos/planes.js";
import { POST as postMpWebhook } from "../src/pages/api/billing/webhooks/mercadopago.js";

const MS_DIA = 86_400_000;

function singleSinDb() {
  delete process.env.TENANT_MODE;
  delete process.env.TENANT_DATABASE_URL;
}

describe("MORA-14 planIncluye tras pago rechazado", () => {
  beforeEach(() => {
    singleSinDb();
    olvidarPlanesEnMemoria();
  });

  it("a los 14 días apaga módulos de pago y deja núcleo incluido", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-23T12:00:00.000Z"));
    const tenant = "t-mora";
    await crearProveedorCobro().crearSuscripcion({ tenantId: tenant, planId: "plus" });
    await registrarUso({
      tenantId: tenant,
      mes: "2026-10",
      feature: "bot_consulta",
      cantidad: 5,
      costoCentavos: 0n,
    });
    const pre = await solicitarPreaprobacionPlan({ tenantId: tenant, planId: "plus" });
    expect(pre.ok).toBe(true);
    if (!pre.ok) return;
    registrarEstadoCobroMp({
      preapprovalId: pre.preapprovalId,
      estado: "gracia",
      occurredAt: "2026-10-09T12:00:00.000Z",
    });
    vi.setSystemTime(new Date("2026-10-23T12:00:00.000Z"));
    expect(MORA_COBRO_DIAS).toBe(14);
    expect(await planIncluye(tenant, "nucleo")).toMatchObject({ incluida: true, planId: "plus" });
    expect(await planIncluye(tenant, "bot_consulta")).toMatchObject({ incluida: false, planId: "plus" });
    expect(await planIncluye(tenant, "asistente_ia")).toMatchObject({ incluida: false, planId: "plus" });
    expect(await registrarUso({
      tenantId: tenant,
      mes: "2026-10",
      feature: "bot_consulta",
      cantidad: 1,
      costoCentavos: 0n,
    })).toEqual({ usado: 6, costoCentavos: 0n });
    vi.useRealTimers();
  });

  it("webhook gracia + activo mantiene HMAC JSON.stringify(body) y reactiva módulos", async () => {
    const tenant = "t-mp";
    const preId = "pre-mora-test";
    vincularPreaprobacionTenant(preId, tenant);
    await crearProveedorCobro().crearSuscripcion({ tenantId: tenant, planId: "basico" });
    process.env.MP_WEBHOOK_SECRET = "mp-mora-secret";
    const cuerpo = {
      preapproval_id: preId,
      estado: "gracia" as const,
      occurred_at: "2026-10-01T00:00:00.000Z",
    };
    const esperado = createHmac("sha256", "mp-mora-secret").update(JSON.stringify(cuerpo)).digest("hex");
    const req = (body: typeof cuerpo) =>
      postMpWebhook(
        ctx("http://x/api/billing/webhooks/mercadopago", {
          method: "POST",
          headers: { "x-signature": esperado, "content-type": "application/json" },
          body,
        }),
      );
    expect((await req(cuerpo)).status).toBe(201);
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-20T00:00:00.000Z"));
    expect(await planIncluye(tenant, "bot_consulta")).toMatchObject({ incluida: false });
    const activo = { ...cuerpo, estado: "activo" as const, occurred_at: "2026-10-20T00:00:00.000Z" };
    const sigActivo = createHmac("sha256", "mp-mora-secret").update(JSON.stringify(activo)).digest("hex");
    const r2 = await postMpWebhook(
      ctx("http://x/api/billing/webhooks/mercadopago", {
        method: "POST",
        headers: { "x-signature": sigActivo },
        body: activo,
      }),
    );
    expect(r2.status).toBe(201);
    expect(await planIncluye(tenant, "bot_consulta")).toMatchObject({ incluida: true, cupo: 100 });
    vi.useRealTimers();
    delete process.env.MP_WEBHOOK_SECRET;
  });
});
