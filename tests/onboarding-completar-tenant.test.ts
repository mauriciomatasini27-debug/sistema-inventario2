import { beforeEach, describe, expect, it, vi } from "vitest";
import { ctx } from "./helpers/ctx.js";
import { control, resetStore } from "../src/lib/store.js";
import { sesionEnStore } from "./helpers/sesion.js";
import { leerOnboarding } from "../src/modules/onboarding/onboarding.js";

const espejo = vi.hoisted(() => ({
  persistir: vi.fn(async () => true),
}));
vi.mock("../src/lib/control-db.js", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../src/lib/control-db.js")>();
  return { ...mod, persistirOnboarding: espejo.persistir };
});

import { POST } from "../src/pages/api/onboarding/completar.js";

const SUB = "dueno-dos-comercios";
const A = "comercio-a";
const B = "comercio-b";
const RESPUESTAS_A = { rubro: "Kiosco", empleados: "no" };

beforeEach(() => {
  resetStore();
  espejo.persistir.mockClear();
});

function preparar() {
  // B primero: con el fallback viejo a la primera membresía Dueño, las
  // respuestas de A habrían terminado en B.
  for (const id of [B, A]) {
    control.tenants.set(id, {
      id, nombreComercio: `Nombre de ${id}`, slug: id, estado: "activo",
      plan: "base", moneda: "ARS", ownerGoogleSub: SUB, esDemo: false, rubro: "kiosco",
    });
    control.memberships.set(`${id}:${SUB}`, {
      id: `m-${id}`, tenantId: id, googleSub: SUB, rol: "dueno", permisos: [], estado: "activo",
    });
  }
}

function completar(plano: string, body: Record<string, unknown>, headers: Record<string, string> = {}) {
  return POST(ctx("http://x/api/onboarding/completar", {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: `__Host-sesion=${plano}`, ...headers },
    body,
  }));
}

describe("TB-165: completar guarda las respuestas en el comercio de la sesión", () => {
  it("un dueño con dos comercios completa el de la sesión, no el otro", async () => {
    preparar();
    const plano = sesionEnStore(SUB, A);
    const r = await completar(plano, { respuestas: RESPUESTAS_A });

    expect(r.status).toBe(200);
    expect(espejo.persistir).toHaveBeenCalledTimes(1);
    expect(espejo.persistir.mock.calls[0]?.[0]).toBe(A);
    expect(espejo.persistir.mock.calls[0]?.[3]).toEqual(RESPUESTAS_A);
    expect(leerOnboarding({ userId: SUB, tenantId: A }).wizardRespuestas).toEqual(RESPUESTAS_A);
    expect(leerOnboarding({ userId: SUB, tenantId: A }).wizardCompletado).toBe(true);
    expect(leerOnboarding({ userId: SUB, tenantId: B }).wizardRespuestas).toEqual({});
    expect(leerOnboarding({ userId: SUB, tenantId: B }).wizardCompletado).toBe(false);
  });

  it("con sesión en A, un tenant_id de B no graba en B", async () => {
    preparar();
    const plano = sesionEnStore(SUB, A);
    const r = await completar(plano, { tenant_id: B, respuestas: RESPUESTAS_A });

    expect(r.status).toBe(403);
    expect(espejo.persistir).not.toHaveBeenCalled();
    expect(leerOnboarding({ userId: SUB, tenantId: A }).wizardCompletado).toBe(false);
    expect(leerOnboarding({ userId: SUB, tenantId: B }).wizardCompletado).toBe(false);
  });

  it("con sesión en A, mandar tenant_id de A sigue grabando en A", async () => {
    preparar();
    const plano = sesionEnStore(SUB, A);
    const r = await completar(plano, { tenant_id: A, respuestas: RESPUESTAS_A });

    expect(r.status).toBe(200);
    expect(espejo.persistir.mock.calls[0]?.[0]).toBe(A);
    expect(leerOnboarding({ userId: SUB, tenantId: A }).wizardRespuestas).toEqual(RESPUESTAS_A);
    expect(leerOnboarding({ userId: SUB, tenantId: B }).wizardRespuestas).toEqual({});
  });
});
