import { beforeEach, describe, expect, it } from "vitest";
import { ctx } from "./helpers/ctx.js";
import { control, resetStore } from "../src/lib/store.js";
import { sesionEnStore } from "./helpers/sesion.js";
import { POST as postChecklist } from "../src/pages/api/onboarding/checklist.js";
import { GET as getEstado } from "../src/pages/api/onboarding/estado.js";

const SUB = "dueno-sin-empleados";
const TENANT = "t-no-aplica";

beforeEach(() => resetStore());

function preparar(): string {
  control.tenants.set(TENANT, {
    id: TENANT, nombreComercio: "K", slug: "k", estado: "activo",
    plan: "base", moneda: "ARS", ownerGoogleSub: SUB, esDemo: false,
  });
  control.memberships.set("m-1", {
    id: "m-1", tenantId: TENANT, googleSub: SUB, rol: "dueno", permisos: [], estado: "activo",
  });
  return sesionEnStore(SUB, TENANT);
}

describe("TB-165: «No tengo empleados» es no aplica y no invita", () => {
  it("saltar el paso no crea invitaciones y la checklist lo reporta no aplica", async () => {
    const plano = preparar();
    const r = await postChecklist(
      ctx("http://x/api/onboarding/checklist", {
        method: "POST",
        headers: { "Content-Type": "application/json", cookie: `__Host-sesion=${plano}` },
        body: { tenant_id: TENANT, paso: "empleado", accion: "saltar" },
      }),
    );
    expect(r.status).toBe(200);
    expect(control.invitations.size).toBe(0);

    const estado = await getEstado(
      ctx(`http://x/api/onboarding/estado?tenant_id=${TENANT}`, {
        method: "GET",
        headers: { cookie: `__Host-sesion=${plano}` },
      }),
    );
    expect(estado.status).toBe(200);
    const json = (await estado.json()) as { checklist: { pasos: Array<{ id: string; noAplica?: boolean }> } };
    expect(json.checklist.pasos.find((p) => p.id === "empleado")?.noAplica).toBe(true);
  });

  it("sin sesión el checklist sigue respondiendo 403", async () => {
    preparar();
    const r = await postChecklist(
      ctx("http://x/api/onboarding/checklist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: { tenant_id: TENANT, paso: "empleado", accion: "saltar" },
      }),
    );
    expect(r.status).toBe(403);
  });
});
