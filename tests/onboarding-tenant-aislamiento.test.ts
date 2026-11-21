import { beforeEach, describe, expect, it } from "vitest";
import { ctx } from "./helpers/ctx.js";
import { control, resetStore } from "../src/lib/store.js";
import { sesionEnStore } from "./helpers/sesion.js";
import { tenantDelCuestionario } from "../src/modules/onboarding/acceso-tenant.js";
import { GET } from "../src/pages/api/onboarding/estado.js";

const SUB = "dueno-dos-comercios";
const A = "comercio-a";
const B = "comercio-b";

beforeEach(() => resetStore());

function preparar() {
  for (const id of [A, B]) {
    control.tenants.set(id, {
      id, nombreComercio: `Nombre de ${id}`, slug: id, estado: "activo",
      plan: "base", moneda: "ARS", ownerGoogleSub: SUB, esDemo: false, rubro: "kiosco",
    });
    control.memberships.set(`${id}:${SUB}`, {
      id: `m-${id}`, tenantId: id, googleSub: SUB, rol: "dueno", permisos: [], estado: "activo",
    });
  }
}

function estado(plano: string, tenantId: string, headers: Record<string, string> = {}) {
  return GET(ctx(`http://x/api/onboarding/estado?tenant_id=${encodeURIComponent(tenantId)}`, {
    method: "GET",
    headers: { cookie: `__Host-sesion=${plano}`, ...headers },
  }));
}

describe("TB-165: el cuestionario usa el comercio autorizado por la sesión", () => {
  it("el helper rechaza un tenantDistinto al autorizado", () => {
    expect(tenantDelCuestionario(A, B)).toEqual({ ok: false });
  });

  it("el helper acepta el tenant autorizado y la ausencia de query", () => {
    expect(tenantDelCuestionario(A, A)).toEqual({ ok: true, tenantId: A });
    expect(tenantDelCuestionario(A, null)).toEqual({ ok: true, tenantId: A });
    expect(tenantDelCuestionario("", null)).toEqual({ ok: false });
  });

  it("con sesión en A, pedir ?tenant_id=B no filtra datos de B", async () => {
    preparar();
    const plano = sesionEnStore(SUB, A);
    const r = await estado(plano, B);
    expect(r.status).toBe(403);
  });

  it("con sesión en A y X-Tenant-Id B, pedir ?tenant_id=B sí funciona", async () => {
    preparar();
    const plano = sesionEnStore(SUB, A);
    const r = await estado(plano, B, { "X-Tenant-Id": B });
    expect(r.status).toBe(200);
    const json = (await r.json()) as { comercio: { nombre: string } };
    expect(json.comercio.nombre).toBe(`Nombre de ${B}`);
  });

  it("con sesión en A, pedir ?tenant_id=A sigue funcionando", async () => {
    preparar();
    const plano = sesionEnStore(SUB, A);
    const r = await estado(plano, A);
    expect(r.status).toBe(200);
  });
});
