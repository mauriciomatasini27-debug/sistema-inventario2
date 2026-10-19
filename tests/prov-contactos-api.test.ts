import { beforeEach, describe, expect, it } from "vitest";
import { ctx } from "./helpers/ctx.js";
import { control, resetStore } from "../src/lib/store.js";
import { tenantPorDefecto } from "../src/lib/tenant-mode.js";
import { crearSesion } from "../src/modules/auth/sesiones.js";
import { sha256Hex } from "../src/modules/auth/sesiones.js";
import { GET as getContactos } from "../src/pages/api/suppliers/contactos.js";
import { POST as postDecidir } from "../src/pages/api/suppliers/contactos/decidir.js";
import { POST as postInvitar } from "../src/pages/api/suppliers/invitar.js";

const TENANT = tenantPorDefecto();
const DUENO = "prov-dueno";

function modoSingleSinDb() {
  delete process.env.TENANT_MODE;
  delete process.env.TENANT_DATABASE_URL;
  delete process.env["TENANT_DATABASE_URL_tenant-a"];
  delete process.env["TENANT_DATABASE_URL_tenant-b"];
}

function sembrarTenant(id = TENANT, dueno = DUENO) {
  control.tenants.set(id, {
    id,
    nombreComercio: "Kiosco PROV",
    slug: `kiosco-prov-${id}`,
    estado: "activo",
    plan: "base",
    moneda: "ARS",
    ownerGoogleSub: dueno,
    esDemo: false,
  });
  control.memberships.set(`m-${id}-${dueno}`, {
    id: `m-${id}-${dueno}`,
    tenantId: id,
    googleSub: dueno,
    rol: "dueno",
    permisos: [],
    estado: "activo",
  });
}

function sesion(sub = DUENO, tenantId: string | null = TENANT): string {
  const ahora = new Date();
  const c = crearSesion({ googleSub: sub, tenantId, ahora });
  control.sessions.set(c.registro.idHash, {
    idHash: c.registro.idHash,
    googleSub: sub,
    tenantId,
    expiraAt: c.registro.expiraAt,
    expiraAbsoluta: c.registro.expiraAbsoluta,
    lastSeenAt: ahora.toISOString(),
    reauthAt: ahora.toISOString(),
  });
  return c.idPlano;
}

function contacto(numero: string, tenantId = TENANT, estado: "pendiente" | "verificado" | "revocado" = "pendiente") {
  control.proveedorContactos.set(numero, {
    numeroE164: numero,
    tenantId,
    supplierCuit: null,
    estado,
    creadoEn: new Date().toISOString(),
  });
}

function cookie(plano: string): Record<string, string> {
  return { cookie: `__Host-sesion=${plano}` };
}

beforeEach(() => {
  modoSingleSinDb();
  resetStore();
  sembrarTenant();
});

describe("PROV-S4 GET /api/suppliers/contactos", () => {
  it("sin sesión da 403", async () => {
    const r = (await getContactos(ctx("http://x/api/suppliers/contactos"))) as Response;
    expect(r.status).toBe(403);
  });

  it("lista solo los contactos del comercio del Dueño", async () => {
    contacto("+5491100000010", TENANT);
    contacto("+5491100000011", "otro");
    const r = (await getContactos(ctx("http://x/api/suppliers/contactos", { headers: cookie(sesion()) }))) as Response;
    expect(r.status).toBe(200);
    const j = (await r.json()) as { items: Array<{ numeroE164: string }> };
    expect(j.items.map((c) => c.numeroE164)).toEqual(["+5491100000010"]);
  });
});

describe("PROV-S4 POST /api/suppliers/contactos/decidir", () => {
  it("sin sesión da 403", async () => {
    const r = (await postDecidir(
      ctx("http://x/api/suppliers/contactos/decidir", {
        method: "POST",
        body: { numero: "+5491100000010", estado: "verificado" },
      }),
    )) as Response;
    expect(r.status).toBe(403);
  });

  it("aprueba un pendiente -> verificado", async () => {
    contacto("+5491100000010");
    const r = (await postDecidir(
      ctx("http://x/api/suppliers/contactos/decidir", {
        method: "POST",
        body: { numero: "+5491100000010", estado: "verificado" },
        headers: cookie(sesion()),
      }),
    )) as Response;
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ numero: "+5491100000010", estado: "verificado" });
    expect(control.proveedorContactos.get("+5491100000010")?.estado).toBe("verificado");
  });

  it("revoca un verificado -> revocado", async () => {
    contacto("+5491100000010", TENANT, "verificado");
    const r = (await postDecidir(
      ctx("http://x/api/suppliers/contactos/decidir", {
        method: "POST",
        body: { numero: "+5491100000010", estado: "revocado" },
        headers: cookie(sesion()),
      }),
    )) as Response;
    expect(r.status).toBe(200);
    expect(control.proveedorContactos.get("+5491100000010")?.estado).toBe("revocado");
  });

  it("un número inexistente da 404", async () => {
    const r = (await postDecidir(
      ctx("http://x/api/suppliers/contactos/decidir", {
        method: "POST",
        body: { numero: "+5490000000000", estado: "verificado" },
        headers: cookie(sesion()),
      }),
    )) as Response;
    expect(r.status).toBe(404);
  });

  it("un contacto de otro comercio da 404", async () => {
    contacto("+5491100000010", "otro");
    const r = (await postDecidir(
      ctx("http://x/api/suppliers/contactos/decidir", {
        method: "POST",
        body: { numero: "+5491100000010", estado: "verificado" },
        headers: cookie(sesion()),
      }),
    )) as Response;
    expect(r.status).toBe(404);
    expect(control.proveedorContactos.get("+5491100000010")?.estado).toBe("pendiente");
  });

  it("un estado inválido da 422", async () => {
    contacto("+5491100000010");
    const r = (await postDecidir(
      ctx("http://x/api/suppliers/contactos/decidir", {
        method: "POST",
        body: { numero: "+5491100000010", estado: "activo" },
        headers: cookie(sesion()),
      }),
    )) as Response;
    expect(r.status).toBe(422);
  });
});

describe("PROV-S1 POST /api/suppliers/invitar", () => {
  it("sin sesión da 403", async () => {
    const r = (await postInvitar(ctx("http://x/api/suppliers/invitar", { method: "POST", body: {} }))) as Response;
    expect(r.status).toBe(403);
  });

  it("genera un código de 6 dígitos con vencimiento y lo guarda en el comercio", async () => {
    const r = (await postInvitar(
      ctx("http://x/api/suppliers/invitar", { method: "POST", body: {}, headers: cookie(sesion()) }),
    )) as Response;
    expect(r.status).toBe(201);
    const j = (await r.json()) as { codigo: string; expiraEn: number; vence_en_min: number };
    expect(j.codigo).toMatch(/^\d{6}$/);
    expect(j.vence_en_min).toBe(30);
    const inv = control.proveedorInvitaciones.get(sha256Hex(j.codigo));
    expect(inv).toMatchObject({ tenantId: TENANT, supplierCuit: null, usado: false });
  });

  it("con CUIT válido lo normaliza; con CUIT inválido da 422", async () => {
    const ok = (await postInvitar(
      ctx("http://x/api/suppliers/invitar", {
        method: "POST",
        body: { cuit: "20-93333172-6" },
        headers: cookie(sesion()),
      }),
    )) as Response;
    expect(ok.status).toBe(201);
    const j = (await ok.json()) as { codigo: string };
    expect(control.proveedorInvitaciones.get(sha256Hex(j.codigo))?.supplierCuit).toBe("20933331726");

    const mal = (await postInvitar(
      ctx("http://x/api/suppliers/invitar", { method: "POST", body: { cuit: "123" }, headers: cookie(sesion()) }),
    )) as Response;
    expect(mal.status).toBe(422);
  });
});
