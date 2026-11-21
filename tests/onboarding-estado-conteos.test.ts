import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ctx } from "./helpers/ctx.js";
import { control, resetStore } from "../src/lib/store.js";
import { conTenant } from "../src/lib/tenant-mode.js";
import { crearSesion } from "../src/modules/auth/sesiones.js";
import { crearInvitacion } from "../src/modules/tenants/invitaciones.js";
import { altaProducto } from "../src/lib/repos/catalogo.js";
import { altaProveedor } from "../src/lib/repos/proveedores.js";
import { crearAlmacenProductos, crearAlmacenSuppliers } from "../src/lib/repos/_almacen.js";
import type { FichaCatalogo } from "../src/lib/repos/_almacen.js";
import type { Supplier } from "../src/modules/purchases/proveedores.js";
import { GET } from "../src/pages/api/onboarding/estado.js";

function sesionEnStore(sub: string, tenantId: string | null = null) {
  const ahoraReal = new Date();
  const c = crearSesion({ googleSub: sub, tenantId, ahora: ahoraReal });
  control.sessions.set(c.registro.idHash, {
    idHash: c.registro.idHash,
    googleSub: sub,
    tenantId,
    expiraAt: c.registro.expiraAt,
    expiraAbsoluta: c.registro.expiraAbsoluta,
    lastSeenAt: ahoraReal.toISOString(),
    reauthAt: ahoraReal.toISOString(),
  });
  return c.idPlano;
}

function comercio(id: string, sub: string) {
  control.tenants.set(id, {
    id,
    nombreComercio: id,
    slug: id,
    estado: "activo",
    plan: "demo",
    moneda: "ARS",
    ownerGoogleSub: sub,
    esDemo: false,
  });
  control.memberships.set(`${id}:${sub}`, {
    id: `${id}:${sub}`,
    tenantId: id,
    googleSub: sub,
    rol: "dueno",
    permisos: [],
    estado: "activo",
  });
}

function ficha(sku: string): FichaCatalogo {
  return {
    sku,
    nombre: sku,
    precioCentavos: 100,
    sector: "general",
    locationId: null,
    archivado: false,
    controlaVencimiento: false,
    estado: "activo",
    minStock: null,
    reorderQty: null,
  };
}

function proveedor(cuit: string, nombre: string): Supplier {
  return {
    id: `sup-${cuit}`,
    cuit,
    nombre,
    email: null,
    telefono: null,
    activo: true,
    creadoEn: "2026-10-30T00:00:00.000Z",
    actualizadoEn: "2026-10-30T00:00:00.000Z",
  };
}

async function estado(plano: string | null, tenantId: string, headers: Record<string, string> = {}) {
  const cabeceras: Record<string, string> = { ...headers };
  if (plano) cabeceras.cookie = `__Host-sesion=${plano}`;
  return GET(ctx(`http://x/api/onboarding/estado?tenant_id=${encodeURIComponent(tenantId)}`, { method: "GET", headers: cabeceras }));
}

interface Paso {
  id: string;
  contador: string | null;
  listo: boolean;
}

async function pasosDe(r: Response): Promise<Paso[]> {
  const j = (await r.json()) as { checklist: { pasos: Paso[] } };
  return j.checklist.pasos;
}

function paso(pasos: Paso[], id: string): Paso {
  const p = pasos.find((x) => x.id === id);
  if (!p) throw new Error(`falta el paso ${id}`);
  return p;
}

beforeEach(() => {
  resetStore();
});

afterEach(() => {
  delete process.env.TENANT_MODE;
});

describe("GET /api/onboarding/estado cuenta el comercio", () => {
  it("sin sesión responde 403", async () => {
    const r = await estado(null, "comercio-vacio");
    expect(r.status).toBe(403);
  });

  it("comercio vacío informa ceros", async () => {
    const sub = "dueno-vacio";
    const id = "comercio-vacio";
    comercio(id, sub);
    const plano = sesionEnStore(sub, id);
    const r = await estado(plano, id);
    expect(r.status).toBe(200);
    const pasos = await pasosDe(r);
    expect(paso(pasos, "productos")).toMatchObject({ contador: "0 de 10", listo: false });
    expect(paso(pasos, "proveedor").listo).toBe(false);
    expect(paso(pasos, "empleado").listo).toBe(false);
  });

  it("3 productos, 1 proveedor y 0 invitaciones no repiten el cero fijo", async () => {
    const sub = "dueno-datos";
    const id = "comercio-datos";
    comercio(id, sub);
    const plano = sesionEnStore(sub, id);
    await conTenant(id, async () => {
      for (const sku of ["ONB-1", "ONB-2", "ONB-3"]) {
        const alta = await altaProducto({
          sku,
          nombre: sku,
          precioCentavos: 100,
          sector: "general",
          controlaVencimiento: false,
        });
        expect(alta.ok).toBe(true);
      }
      const prov = await altaProveedor({
        cuit: "20-93333172-6",
        nombre: "Distribuidora Sur",
        ahoraIso: "2026-10-30T00:00:00.000Z",
      });
      expect(prov.ok).toBe(true);
    });
    const r = await estado(plano, id);
    expect(r.status).toBe(200);
    const pasos = await pasosDe(r);
    expect(paso(pasos, "productos")).toMatchObject({ contador: "3 de 10", listo: false });
    expect(paso(pasos, "proveedor").listo).toBe(true);
    expect(paso(pasos, "empleado").listo).toBe(false);
  });

  it("otro comercio no aporta productos, proveedor ni invitación", async () => {
    process.env.TENANT_MODE = "multi";
    resetStore();
    const sub = "dueno-dos";
    const a = "comercio-a";
    const b = "comercio-b";
    comercio(a, sub);
    comercio(b, sub);
    const plano = sesionEnStore(sub, a);
    conTenant(a, () => {
      for (const sku of ["A-1", "A-2", "A-3"]) crearAlmacenProductos().guardar(sku, ficha(sku));
      crearAlmacenSuppliers().guardar("20933331726", proveedor("20933331726", "Sur A"));
    });
    conTenant(b, () => {
      for (const sku of ["B-1", "B-2", "B-3", "B-4", "B-5", "B-6", "B-7"]) {
        crearAlmacenProductos().guardar(sku, ficha(sku));
      }
      crearAlmacenSuppliers().guardar("20111111112", proveedor("20111111112", "Sur B"));
    });
    const inv = crearInvitacion({ tenantId: b, email: "empleado@ejemplo.com", rol: "empleado", creadaPor: sub });
    control.invitations.set(inv.registro.tokenHash, inv.registro);

    const ra = await estado(plano, a);
    expect(ra.status).toBe(200);
    const pasosA = await pasosDe(ra);
    expect(paso(pasosA, "productos")).toMatchObject({ contador: "3 de 10", listo: false });
    expect(paso(pasosA, "proveedor").listo).toBe(true);
    expect(paso(pasosA, "empleado").listo).toBe(false);

    // TB-165 [tenant]: el cambio de comercio va por X-Tenant-Id (ADR-0050),
    // no por el query con la sesión todavía fijada en A.
    const rb = await estado(plano, b, { "X-Tenant-Id": b });
    expect(rb.status).toBe(200);
    const pasosB = await pasosDe(rb);
    expect(paso(pasosB, "productos")).toMatchObject({ contador: "7 de 10", listo: false });
    expect(paso(pasosB, "proveedor").listo).toBe(true);
    expect(paso(pasosB, "empleado").listo).toBe(true);
  });
});
