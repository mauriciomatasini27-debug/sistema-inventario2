import { beforeEach, describe, expect, it, vi } from "vitest";
import { control, resetStore } from "../src/lib/store.js";
import { ctx } from "./helpers/ctx.js";
import { sesionEnStore } from "./helpers/sesion.js";

// ON12: el espejo durable se mantiene pendiente a propósito para comprobar
// que la ruta espera a la escritura antes de responder.
const espejo = vi.hoisted(() => ({
  resolver: (() => {}) as () => void,
  persistir: vi.fn(),
}));
espejo.persistir.mockImplementation(
  async () => new Promise<void>((resolve) => { espejo.resolver = resolve; }),
);
vi.mock("../src/lib/control-db.js", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../src/lib/control-db.js")>();
  return { ...mod, persistirOnboarding: espejo.persistir };
});

import { POST } from "../src/pages/api/onboarding/completar.js";
import { PASOS_WIZARD } from "../src/modules/onboarding/wizard.js";

beforeEach(() => {
  resetStore();
  espejo.persistir.mockClear();
});

describe("ON12: espejo durable del wizard en la ruta completar", () => {
  it("persiste los valores completados antes de responder", async () => {
    control.tenants.set("t-1", { id: "t-1", nombreComercio: "K", slug: "k", estado: "activo", plan: "demo", moneda: "ARS", ownerGoogleSub: "g-1", esDemo: false });
    control.memberships.set("m-1", { id: "m-1", tenantId: "t-1", googleSub: "g-1", rol: "dueno", permisos: [], estado: "activo" });
    const plano = sesionEnStore("g-1", "t-1");

    let respondio = false;
    const respuesta = Promise.resolve(POST(ctx("http://x/api/onboarding/completar", {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: `__Host-sesion=${plano}` },
      body: { tenant_id: "t-1" },
    }))).then((r) => {
      respondio = true;
      return r;
    });

    await vi.waitFor(() => expect(espejo.persistir).toHaveBeenCalledTimes(1));
    expect(espejo.persistir).toHaveBeenCalledWith("t-1", true, PASOS_WIZARD.length);
    expect(respondio).toBe(false);

    espejo.resolver();
    const r = await respuesta;
    expect(r.status).toBe(200);
  });
});
