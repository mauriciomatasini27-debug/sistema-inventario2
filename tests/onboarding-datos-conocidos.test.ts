import { beforeEach, describe, expect, it } from "vitest";
import { ctx } from "./helpers/ctx.js";
import { control, resetStore } from "../src/lib/store.js";
import { sesionEnStore } from "./helpers/sesion.js";
import { GET as getEstado } from "../src/pages/api/onboarding/estado.js";
import { pasosParaDatos } from "../src/modules/onboarding/wizard.js";
import { completarWizardConRespuestas } from "../src/modules/onboarding/onboarding.js";
import { crearPersistenciaOnboardingMemoria } from "../src/modules/onboarding/persistencia.js";

const SUB = "dueno-conocido";
const TENANT = "t-conocido";

beforeEach(() => resetStore());

function preparar() {
  control.users.set(SUB, {
    googleSub: SUB, email: "juan@gmail.com", emailVerificado: true, nombre: "Juan",
  });
  control.tenants.set(TENANT, {
    id: TENANT, nombreComercio: "Kiosco La Esquina", slug: "k", estado: "activo",
    plan: "base", moneda: "ARS", ownerGoogleSub: SUB, esDemo: false, rubro: "kiosco",
  });
  control.memberships.set("m-1", {
    id: "m-1", tenantId: TENANT, googleSub: SUB, rol: "dueno", permisos: [], estado: "activo",
  });
  control.vincularCodes.set("5491112345678", {
    codigoHash: "h", expiraEn: Date.now() + 60_000, usado: false,
    numeroRegistrado: "5491112345678", tenantId: TENANT, googleSub: SUB, intentosFallidos: 0,
  });
  return sesionEnStore(SUB, TENANT);
}

describe("TB-165: datos ya capturados", () => {
  it("el estado expone nombre, rubro, WhatsApp y nombre del Dueño", async () => {
    const plano = preparar();
    const r = await getEstado(
      ctx(`http://x/api/onboarding/estado?tenant_id=${TENANT}`, {
        method: "GET", headers: { cookie: `__Host-sesion=${plano}` },
      }),
    );
    expect(r.status).toBe(200);
    const json = (await r.json()) as Record<string, any>;
    expect(json.comercio).toMatchObject({
      nombre: "Kiosco La Esquina", rubro: "kiosco", whatsapp: "5491112345678",
    });
    expect(json.dueno?.nombre).toBe("Juan");
  });

  it("no vuelve a pedir los datos conocidos y guarda todas las respuestas", () => {
    const pasos = pasosParaDatos({ rubro: "kiosco", whatsapp: "5491112345678" });
    const claves = pasos.map((p) => p.key);
    for (const conocido of ["negocio", "dueno", "rubro", "whatsapp"]) {
      expect(claves).not.toContain(conocido);
    }

    const mem = crearPersistenciaOnboardingMemoria();
    const respuestas = {
      empleados: "No, trabajo solo",
      productos: "Más tarde",
      caja: "Empezar en 0",
    };
    const next = completarWizardConRespuestas(
      { userId: SUB, tenantId: TENANT, persistencia: mem.persistencia },
      respuestas,
      [],
    );
    expect(next.wizardRespuestas).toEqual(respuestas);
  });
});
