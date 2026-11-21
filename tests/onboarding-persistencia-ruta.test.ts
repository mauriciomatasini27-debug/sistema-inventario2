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
import { estadoInicialWizard } from "../src/modules/onboarding/wizard.js";
import { hidratarOnboardingDesdeDb } from "../src/modules/onboarding/persistencia.js";
import { leerOnboarding } from "../src/modules/onboarding/onboarding.js";

const RESPUESTAS = { rubro: "Dietética", whatsapp: "5491112345678" };

function sembrar() {
  control.tenants.set("t-1", { id: "t-1", nombreComercio: "K", slug: "k", estado: "activo", plan: "demo", moneda: "ARS", ownerGoogleSub: "g-1", esDemo: false });
  control.memberships.set("m-1", { id: "m-1", tenantId: "t-1", googleSub: "g-1", rol: "dueno", permisos: [], estado: "activo" });
  return sesionEnStore("g-1", "t-1");
}

// TB-165: espera a que la ruta llame al espejo, captura los argumentos y
// habilita la respuesta para poder comprobar ambas cosas por separado.
async function completarYEsperar(plano: string, body: Record<string, unknown>) {
  let respondio = false;
  const respuesta = Promise.resolve(POST(ctx("http://x/api/onboarding/completar", {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: `__Host-sesion=${plano}` },
    body,
  }))).then((r) => {
    respondio = true;
    return r;
  });
  await vi.waitFor(() => expect(espejo.persistir).toHaveBeenCalledTimes(1));
  const args = espejo.persistir.mock.calls[0] as unknown[];
  expect(respondio).toBe(false);
  espejo.resolver();
  const r = await respuesta;
  return { args, r };
}

beforeEach(() => {
  resetStore();
  espejo.persistir.mockClear();
});

describe("ON12: espejo durable del wizard en la ruta completar", () => {
  it("persiste los valores completados antes de responder", async () => {
    const plano = sembrar();
    const { args, r } = await completarYEsperar(plano, { tenant_id: "t-1" });

    expect(args).toEqual(["t-1", true, estadoInicialWizard().pasos.length, {}]);
    expect(r.status).toBe(200);
  });

  it("TB-165: escribe todas las respuestas, no sólo completado y paso", async () => {
    const plano = sembrar();
    const { args, r } = await completarYEsperar(plano, { tenant_id: "t-1", respuestas: RESPUESTAS });

    expect(args).toEqual(["t-1", true, estadoInicialWizard().pasos.length, RESPUESTAS]);
    expect(r.status).toBe(200);
  });

  it("TB-165: tras un resetStore las respuestas se recuperan de la base", async () => {
    const plano = sembrar();
    const { args } = await completarYEsperar(plano, { tenant_id: "t-1", respuestas: RESPUESTAS });
    const escrito = args as [string, boolean, number, Record<string, string>];

    resetStore();
    hidratarOnboardingDesdeDb({
      googleSub: "g-1",
      tenantId: "t-1",
      wizardCompletado: escrito[1]!,
      wizardPaso: escrito[2]!,
      wizardRespuestas: escrito[3]!,
    });

    expect(leerOnboarding("g-1", "t-1").wizardRespuestas).toEqual(RESPUESTAS);
  });
});
