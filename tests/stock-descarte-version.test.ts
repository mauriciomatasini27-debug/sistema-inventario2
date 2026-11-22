import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { control, resetStore } from "../src/lib/store.js";
import { crearSesion } from "../src/modules/auth/sesiones.js";
import { ctx } from "./helpers/ctx.js";
import { leerSiembraProductos, sembrarProductosRubro } from "../src/lib/repos/siembra-productos.js";
import { GET, POST } from "../src/pages/api/stock/plantilla.js";
import { VERSION_PLANTILLAS_PRODUCTOS_RUBRO } from "../src/modules/onboarding/plantillas-productos-rubro.js";

const AHORA = new Date("2026-11-22T12:00:00.000Z");
const TENANT = "t-desc";

function comercio() {
  control.tenants.set(TENANT, {
    id: TENANT,
    nombreComercio: "Kiosco desc",
    slug: "kiosco-desc",
    estado: "activo",
    plan: "base",
    moneda: "ARS",
    ownerGoogleSub: "g-desc",
    esDemo: false,
    rubro: "otro",
  });
  control.memberships.set("m-desc", {
    id: "m-desc",
    tenantId: TENANT,
    googleSub: "g-desc",
    rol: "dueno",
    permisos: [],
    estado: "activo",
  });
}

function sesion(): string {
  const c = crearSesion({ googleSub: "g-desc", tenantId: TENANT, ahora: AHORA });
  control.sessions.set(c.registro.idHash, {
    idHash: c.registro.idHash,
    googleSub: "g-desc",
    tenantId: TENANT,
    expiraAt: c.registro.expiraAt,
    expiraAbsoluta: c.registro.expiraAbsoluta,
    lastSeenAt: AHORA.toISOString(),
  });
  return c.idPlano;
}

describe("STOCK-R6: descarte persistido por versión de plantilla", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: AHORA, toFake: ["Date"] });
    resetStore();
    delete process.env.TENANT_MODE;
    delete process.env.TENANT_DATABASE_URL;
  });
  afterEach(() => vi.useRealTimers());

  it("una versión anterior de la plantilla no cuenta como sembrado", async () => {
    control.semillasProductos.add(TENANT);
    control.semillasProductosVersion.set(TENANT, "v0");
    expect(await leerSiembraProductos(TENANT)).toBe(false);
  });

  it("el descarte guarda la versión vigente y no reaparece", async () => {
    control.semillasProductos.add(TENANT);
    control.semillasProductosVersion.set(TENANT, "v0");
    expect(await sembrarProductosRubro(TENANT, "otro", [])).toEqual({ ok: true, cantidad: 0 });
    expect(await leerSiembraProductos(TENANT)).toBe(true);
    expect(control.semillasProductosVersion.get(TENANT)).toBe(VERSION_PLANTILLAS_PRODUCTOS_RUBRO);
    expect(await sembrarProductosRubro(TENANT, "otro", [])).toEqual({ ok: false, codigo: "YA_SEMBRADO" });
  });

  it("POST /api/stock/plantilla con lista vacía persiste el descarte", async () => {
    comercio();
    const cookie = `__Host-sesion=${sesion()}`;
    const post = (await POST(
      ctx("http://x/api/stock/plantilla", { body: { nombres: [] }, headers: { cookie } }),
    )) as Response;
    expect(post.status).toBe(200);
    expect(await post.json()).toMatchObject({ ok: true, cantidad: 0 });

    const get = (await GET(ctx("http://x/api/stock/plantilla", { headers: { cookie } }))) as Response;
    expect(await get.json()).toMatchObject({ sembrado: true, version: VERSION_PLANTILLAS_PRODUCTOS_RUBRO });
  });

  it("la pantalla ya no usa localStorage ni el viejo texto de descarte", () => {
    const stock = readFileSync("src/pages/panel/stock.astro", "utf8");
    expect(stock).toContain("Omitir sugerencias");
    expect(stock).not.toContain("No, gracias");
    expect(stock).not.toContain("catalogo-aviso.js");
    expect(stock).toContain('JSON.stringify({ nombres: [] })');
  });
});
