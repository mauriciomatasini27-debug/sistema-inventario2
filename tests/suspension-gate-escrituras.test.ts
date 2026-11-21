import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { control, resetStore, type ControlTenant } from "../src/lib/store.js";
import { gateTenantDatos } from "../src/lib/tenant-context.js";
import { cookieSesion, crearSesion } from "../src/modules/auth/sesiones.js";

// SUSP-GATE-1 (blocker 5 de la auditoría de venta): la suspensión por mora
// solo se miraba en /api/tenants/:id, así que un comercio suspendido seguía
// escribiendo por el plano de datos (ventas, stock, caja, etc.). Estos casos
// fijan el contrato: escritura 403, lectura sigue, pago/suscripción exentos y
// otro tenant intacto.

const TA = "tenant-a";
const TB = "tenant-b";
const SUB_A = "susp-dueno-a";
const SUB_B = "susp-dueno-b";

function tenant(id: string, estado: string, ownerGoogleSub: string): ControlTenant {
  return {
    id,
    nombreComercio: `Kiosco ${id}`,
    slug: `kiosco-${id}`,
    estado,
    plan: "base",
    moneda: "ARS",
    ownerGoogleSub,
    esDemo: false,
  };
}

function sembrar(tenantId: string, estado: string, googleSub: string): string {
  control.tenants.set(tenantId, tenant(tenantId, estado, googleSub));
  control.memberships.set(`m-${tenantId}-${googleSub}`, {
    id: `m-${tenantId}-${googleSub}`,
    tenantId,
    googleSub,
    rol: "dueno",
    permisos: [],
    estado: "activo",
  });
  const ahora = new Date();
  const c = crearSesion({ googleSub, tenantId, ahora });
  control.sessions.set(c.registro.idHash, {
    idHash: c.registro.idHash,
    googleSub,
    tenantId,
    expiraAt: c.registro.expiraAt,
    expiraAbsoluta: c.registro.expiraAbsoluta,
    lastSeenAt: ahora.toISOString(),
    reauthAt: ahora.toISOString(),
  });
  return cookieSesion(c.idPlano, c.registro.expiraAt, ahora);
}

function pedir(cookie: string, path: string, method = "POST"): Request {
  return new Request(`http://x${path}`, { method, headers: { cookie } });
}

describe("Blocker 5: suspensión bloquea escrituras del plano de datos", () => {
  let cookieA = "";
  let cookieB = "";

  beforeEach(() => {
    resetStore();
    process.env.TENANT_MODE = "multi";
    cookieA = sembrar(TA, "suspendido", SUB_A);
    cookieB = sembrar(TB, "activo", SUB_B);
  });

  afterEach(() => {
    delete process.env.TENANT_MODE;
    resetStore();
  });

  it("suspendido + POST a una ruta de datos responde 403 con el motivo", async () => {
    const g = gateTenantDatos(pedir(cookieA, "/api/sales"), "/api/sales");
    expect(g).not.toBeNull();
    if (!g || g.ok) throw new Error("esperaba 403 para un suspendido que escribe");
    expect(g.respuesta.status).toBe(403);
    expect(await g.respuesta.json()).toMatchObject({
      error: "El comercio está suspendido. Regularizá la suscripción para seguir operando.",
    });
  });

  it("suspendido + PUT/PATCH/DELETE también responde 403", () => {
    for (const method of ["PUT", "PATCH", "DELETE"]) {
      const g = gateTenantDatos(pedir(cookieA, "/api/stock/ajuste", method), "/api/stock/ajuste");
      expect(g?.ok, method).toBe(false);
      if (g && !g.ok) expect(g.respuesta.status, method).toBe(403);
    }
  });

  it("suspendido + GET/HEAD sigue leyendo sus datos", () => {
    for (const method of ["GET", "HEAD"]) {
      const g = gateTenantDatos(pedir(cookieA, "/api/sales", method), "/api/sales");
      expect(g?.ok, method).toBe(true);
      if (g?.ok) expect(g.tenantId).toBe(TA);
    }
  });

  it("activo + POST sigue operando", () => {
    const g = gateTenantDatos(pedir(cookieB, "/api/sales"), "/api/sales");
    expect(g?.ok).toBe(true);
    if (g?.ok) expect(g.tenantId).toBe(TB);
  });

  it("suspendido A no bloquea a B activo", () => {
    const g = gateTenantDatos(pedir(cookieB, "/api/cash/movements"), "/api/cash/movements");
    expect(g?.ok).toBe(true);
    if (g?.ok) expect(g.tenantId).toBe(TB);
  });

  it("la suscripción (/api/plan) queda exenta para poder regularizar", () => {
    const g = gateTenantDatos(pedir(cookieA, "/api/plan/cambiar"), "/api/plan/cambiar");
    expect(g?.ok).toBe(true);
    if (g?.ok) expect(g.tenantId).toBe(TA);
  });

  it("el webhook de pago no pasa por el gate de datos", () => {
    const g = gateTenantDatos(
      pedir(cookieA, "/api/billing/webhooks/mercadopago"),
      "/api/billing/webhooks/mercadopago",
    );
    expect(g).toBeNull();
  });
});
