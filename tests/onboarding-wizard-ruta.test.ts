import { describe, expect, it, beforeEach } from "vitest";
import { ctx } from "./helpers/ctx.js";
import { control, resetStore } from "../src/lib/store.js";
import { crearSesion } from "../src/modules/auth/sesiones.js";
import { POST } from "../src/pages/api/onboarding/completar.js";

function sesionEnStore(sub: string, tenantId: string | null = null) {
  const ahoraReal = new Date();
  const c = crearSesion({ googleSub: sub, tenantId, ahora: ahoraReal });
  control.sessions.set(c.registro.idHash, {
    idHash: c.registro.idHash,
    googleSub: sub,
    tenantId,
    expiraAt: c.registro.expiraAt,
    expiraAbsoluta: c.registro.expiraAbsoluta,
    lastSeenAt: ahoraReal.toISOString(),
    reauthAt: ahoraReal.toISOString(),
  });
  return c.idPlano;
}

function req(plano: string, body?: unknown) {
  return ctx("http://x/api/onboarding/completar", {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: `__Host-sesion=${plano}` },
    body: (body ?? {}) as Record<string, unknown>,
  });
}

beforeEach(() => resetStore());

describe("onboarding-wizard-ruta completar", () => {
  it("403 sin sesión", async () => {
    const r = await POST(ctx("http://x/api/onboarding/completar", { method: "POST", headers: { "Content-Type": "application/json" }, body: {} }));
    expect(r.status).toBe(403);
  });

  it("403 sin membership", async () => {
    const plano = sesionEnStore("g-1", null);
    const r = await POST(req(plano));
    expect(r.status).toBe(403);
  });

  it("200 marca completado resolviendo tenant desde memberships", async () => {
    control.tenants.set("t-1", { id: "t-1", nombreComercio: "K", slug: "k", estado: "activo", plan: "demo", moneda: "ARS", ownerGoogleSub: "g-1", esDemo: false });
    control.memberships.set("m-1", { id: "m-1", tenantId: "t-1", googleSub: "g-1", rol: "dueno", permisos: [], estado: "activo" });
    const plano = sesionEnStore("g-1", "t-1");
    const r = await POST(req(plano));
    expect(r.status).toBe(200);
    const j = (await r.json()) as { ok: boolean; completado: boolean };
    expect(j).toEqual({ ok: true, completado: true });
    const onb = control.onboardingState.get(`g-1:t-1`);
    expect(onb?.wizardCompletado).toBe(true);
  });
});
