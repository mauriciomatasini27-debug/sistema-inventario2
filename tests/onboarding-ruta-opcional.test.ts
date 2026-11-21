import { describe, expect, it } from "vitest";
import { destinoLogin } from "../src/modules/auth/destino-login.js";
import {
  orientacionParaPanel,
  urlCuestionario,
} from "../src/modules/onboarding/orientacion-panel.js";
import {
  esCompleto,
  retomar,
  transicionConSalida,
} from "../src/modules/onboarding/wizard.js";

describe("TB-165: cuestionario como ruta opcional desde el panel", () => {
  it("el panel ofrece el enlace sólo al Dueño con el comercio resuelto", () => {
    const dueno = orientacionParaPanel("dueno", [], true);
    expect(dueno.mostrarBienvenida).toBe(true);
    expect(urlCuestionario(dueno.mostrarBienvenida, "t-1")).toBe(
      "/onboarding?tenant_id=t-1",
    );

    const empleado = orientacionParaPanel("empleado", [], false);
    expect(empleado.mostrarBienvenida).toBe(false);
    expect(urlCuestionario(empleado.mostrarBienvenida, "t-1")).toBeNull();
  });

  it("el login nunca redirige al cuestionario", () => {
    const casos = [
      { next: null, esAdmin: false, tenantId: null, rol: null },
      { next: null, esAdmin: false, tenantId: "t-1", rol: "dueno" as const },
      { next: null, esAdmin: true, tenantId: "t-1", rol: "empleado" as const },
      { next: "/panel", esAdmin: true, tenantId: "t-1", rol: "dueno" as const },
    ];
    for (const caso of casos) {
      expect(destinoLogin(caso).url).not.toBe("/onboarding");
    }
  });

  it("el cuestionario se completa sin salir a otra página", () => {
    let state = retomar(0, {}, [], [], { rubro: "kiosco", whatsapp: "5491112345678" });
    for (const respuesta of ["No, trabajo solo", "Más tarde", "Empezar en 0"]) {
      const t = transicionConSalida(state, respuesta);
      expect(t.salida).toBeNull();
      state = t.state;
    }
    expect(esCompleto(state)).toBe(true);
  });
});
