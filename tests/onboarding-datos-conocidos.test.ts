import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { ctx } from "./helpers/ctx.js";
import { control, resetStore } from "../src/lib/store.js";
import { sesionEnStore } from "./helpers/sesion.js";
import { GET as getEstado } from "../src/pages/api/onboarding/estado.js";

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

  it("la página muestra los datos conocidos como sólo lectura y envía todas las respuestas", () => {
    const pagina = readFileSync("src/pages/onboarding.astro", "utf8");
    expect(pagina).toContain("datos-conocidos");
    expect(pagina).toContain("respuestas: state.respuestas");
    expect(pagina).not.toMatch(/key:\s*["']negocio["']/);
    expect(pagina).not.toMatch(/key:\s*["']dueno["']/);
  });
});
