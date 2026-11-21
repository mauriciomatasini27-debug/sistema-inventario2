import { beforeEach, describe, expect, it } from "vitest";
import { control, resetStore } from "../src/lib/store.js";
import { conModoTenant } from "../src/lib/tenant.js";
import { exigirDuenoDeRequest } from "../src/lib/tenant-context.js";
import { sesionEnStore } from "./helpers/sesion.js";

const MULTI = { multi: true, shared: false, tenantPorDefecto: "slice0" };

function taller(rol: "dueno" | "empleado") {
  control.tenants.set("t-1", {
    id: "t-1", nombreComercio: "K", slug: "k", estado: "activo",
    plan: "base", moneda: "ARS", ownerGoogleSub: "g-1", esDemo: false,
  });
  control.memberships.set("m-1", {
    id: "m-1", tenantId: "t-1", googleSub: "g-1", rol, permisos: [], estado: "activo",
  });
}

function pago(): Request {
  return new Request("http://x/onboarding", {
    headers: { cookie: `__Host-sesion=${sesionEnStore("g-1", "t-1")}` },
  });
}

beforeEach(() => resetStore());

describe("TB-165: acceso al cuestionario de configuración", () => {
  it("el Dueño con sesión y comercio puede abrirlo", () => {
    taller("dueno");
    expect(conModoTenant(MULTI, () => exigirDuenoDeRequest(pago())).ok).toBe(true);
  });

  it("un Empleado no puede abrirlo aunque tenga sesión y comercio", () => {
    taller("empleado");
    expect(conModoTenant(MULTI, () => exigirDuenoDeRequest(pago())).ok).toBe(false);
  });

  it("sin sesión no puede abrirlo", () => {
    taller("dueno");
    const sinSesion = new Request("http://x/onboarding");
    expect(conModoTenant(MULTI, () => exigirDuenoDeRequest(sinSesion)).ok).toBe(false);
  });

  it("sin comercio en la sesión no puede abrirlo", () => {
    taller("dueno");
    const sinComercio = new Request("http://x/onboarding", {
      headers: { cookie: `__Host-sesion=${sesionEnStore("g-1", null)}` },
    });
    expect(conModoTenant(MULTI, () => exigirDuenoDeRequest(sinComercio)).ok).toBe(false);
  });

});
