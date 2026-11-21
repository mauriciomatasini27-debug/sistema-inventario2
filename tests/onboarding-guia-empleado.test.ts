import { beforeEach, describe, expect, it } from "vitest";
import { ctx } from "./helpers/ctx.js";
import { control, resetStore } from "../src/lib/store.js";
import { sesionEnStore } from "./helpers/sesion.js";
import {
  orientacionParaPanel,
  pasosGuiaEmpleado,
  urlCuestionario,
} from "../src/modules/onboarding/orientacion-panel.js";
import { PASOS_DUENO } from "../src/modules/onboarding/tour.js";
import { GET } from "../src/pages/api/onboarding/estado.js";

const SUB = "empleado-guia";
const TENANT = "comercio-guia";

beforeEach(() => resetStore());

function sembrarEmpleado(permisos: string[]) {
  control.tenants.set(TENANT, {
    id: TENANT, nombreComercio: "Kiosco guía", slug: "guia", estado: "activo",
    plan: "base", moneda: "ARS", ownerGoogleSub: "dueno-guia", esDemo: false,
  });
  control.memberships.set("m-guia", {
    id: "m-guia", tenantId: TENANT, googleSub: SUB, rol: "empleado",
    permisos, estado: "activo",
  });
  return sesionEnStore(SUB, TENANT);
}

async function pasosDelEstado(plano: string): Promise<string[]> {
  const r = await GET(ctx(`http://x/api/onboarding/estado?tenant_id=${TENANT}`, {
    method: "GET",
    headers: { cookie: `__Host-sesion=${plano}` },
  }));
  if (r.status !== 200) throw new Error(`estado respondió ${r.status}`);
  const j = (await r.json()) as { tour: { pasos: { id: string }[] } };
  return j.tour.pasos.map((p) => p.id);
}

describe("TB-165: guía corta del Empleado en /panel", () => {
  it("el Dueño y quien no tiene sesión no ven la guía del Empleado", () => {
    expect(pasosGuiaEmpleado("dueno", ["ver_saldos_caja"])).toEqual([]);
    expect(pasosGuiaEmpleado(null, ["registrar_devoluciones"])).toEqual([]);
  });

  it("TB-165: el Empleado no ve el diálogo ni el enlace del Dueño", () => {
    const emp = orientacionParaPanel("empleado", ["registrar_devoluciones"], false);
    expect(emp.mostrarBienvenida).toBe(false);
    expect(emp.pasosEmpleado.length).toBeGreaterThan(0);

    const dueno = orientacionParaPanel("dueno", [], true);
    expect(dueno.mostrarBienvenida).toBe(true);
    expect(dueno.pasosEmpleado).toEqual([]);
  });

  it("TB-165: el enlace al cuestionario existe sólo para el Dueño con comercio", () => {
    expect(urlCuestionario(true, "comercio con espacio")).toBe(
      "/onboarding?tenant_id=comercio%20con%20espacio",
    );
    expect(urlCuestionario(false, "t-1")).toBeNull();
    expect(urlCuestionario(true, "")).toBeNull();
  });

  it("el Empleado ve menos pasos que el Dueño y ninguno de Dueño", () => {
    const pasos = pasosGuiaEmpleado("empleado", ["registrar_devoluciones"]);
    expect(pasos.length).toBeLessThan(PASOS_DUENO.length);
    expect(pasos.map((p) => p.id)).not.toContain("proveedores");
    expect(pasos.map((p) => p.id)).not.toContain("whatsapp");
  });

  it("el permiso filtra el paso de devoluciones", () => {
    expect(pasosGuiaEmpleado("empleado", ["registrar_devoluciones"]).map((p) => p.id))
      .toContain("devoluciones");
    expect(pasosGuiaEmpleado("empleado", []).map((p) => p.id))
      .not.toContain("devoluciones");
  });

  it("TB-165: /estado expone la guía filtrada por la membership activa", async () => {
    const plano = sembrarEmpleado(["registrar_devoluciones"]);
    expect(await pasosDelEstado(plano)).toContain("devoluciones");
  });

  it("TB-165: sin el permiso, /estado no expone ese paso", async () => {
    const plano = sembrarEmpleado([]);
    const pasos = await pasosDelEstado(plano);
    expect(pasos).not.toContain("devoluciones");
    expect(pasos).toContain("venta-escanear");
  });
});
