import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { control, resetStore } from "../src/lib/store.js";
import { conTenant } from "../src/lib/tenant-mode.js";
import { mostrarAvisoUbicaciones } from "../src/modules/onboarding/ubicaciones-aviso.js";
import { EVENTO_UBICACIONES_SEMBRADAS } from "../src/modules/onboarding/ubicaciones-rubro.js";
import { GET as getLocations, POST as postLocations } from "../src/pages/api/locations.js";
import { ctx } from "./helpers/ctx.js";

const RAIZ = process.cwd();
const leer = (p: string): string => readFileSync(join(RAIZ, p), "utf8");

function modoSingleSinDb() {
  delete process.env.TENANT_MODE;
  delete process.env.TENANT_DATABASE_URL;
  delete process.env["TENANT_DATABASE_URL_tenant-a"];
  delete process.env["TENANT_DATABASE_URL_tenant-b"];
}

function sembrada(tenantId: string) {
  control.events.push({
    tenantId,
    tipo: EVENTO_UBICACIONES_SEMBRADAS,
    actor: "sistema",
    detalle: { origen: "Sistema (plantilla de rubro)", cantidad: 6 },
  });
}

describe("ON4.5 aviso de ubicaciones: decisión pura", () => {
  it("se muestra solo si las sembró el rubro y no se descartó en el dispositivo", () => {
    expect(mostrarAvisoUbicaciones({ sembradasPorRubro: true, descartado: false })).toBe(true);
    expect(mostrarAvisoUbicaciones({ sembradasPorRubro: true, descartado: true })).toBe(false);
    expect(mostrarAvisoUbicaciones({ sembradasPorRubro: false, descartado: false })).toBe(false);
    expect(mostrarAvisoUbicaciones({ sembradasPorRubro: false, descartado: true })).toBe(false);
  });
});

describe("ON4.5 GET /api/locations agrega sembradas_por_rubro sin romper la lista", () => {
  beforeEach(() => {
    modoSingleSinDb();
    resetStore();
  });

  it("sin evento devuelve false y conserva las ubicaciones existentes", async () => {
    const alta = (await postLocations(ctx("http://x/api/locations", { body: { nombre: "Mostrador" } }))) as Response;
    expect(alta.status).toBe(201);
    const r = (await getLocations(ctx("http://x/api/locations"))) as Response;
    expect(r.status).toBe(200);
    const j = (await r.json()) as { ubicaciones: Array<{ nombre: string }>; sembradas_por_rubro: boolean };
    expect(j.ubicaciones.map((u) => u.nombre)).toEqual(["Mostrador"]);
    expect(j.sembradas_por_rubro).toBe(false);
  });

  it("con el evento del tenant actual devuelve true", async () => {
    sembrada("tenant-a");
    const r = (await conTenant("tenant-a", () => getLocations(ctx("http://x/api/locations")))) as Response;
    expect(((await r.json()) as { sembradas_por_rubro: boolean }).sembradas_por_rubro).toBe(true);
  });

  it("no toma el evento de otro tenant", async () => {
    sembrada("tenant-a");
    const r = (await conTenant("tenant-b", () => getLocations(ctx("http://x/api/locations")))) as Response;
    expect(((await r.json()) as { sembradas_por_rubro: boolean }).sembradas_por_rubro).toBe(false);
  });
});

describe("ON4.5 /panel/stock muestra la sección Ubicaciones y el aviso", () => {
  const stock = leer("src/pages/panel/stock.astro");

  it("lista y crea ubicaciones contra /api/locations", () => {
    expect(stock).toContain('id="ubicaciones"');
    expect(stock).toContain("<h2>Ubicaciones</h2>");
    expect(stock).toContain("Nueva ubicación");
    expect(stock).toContain('fetch("/api/locations")');
    expect(stock).toContain("sembradas_por_rubro");
  });

  it("muestra el aviso exacto del PRD y lo cierra por dispositivo", () => {
    expect(stock).toContain(
      "Estas ubicaciones las armamos según tu rubro. Cambiales el nombre para que coincidan con tu local",
    );
    expect(stock).toContain('id="aviso-ubicaciones"');
    expect(stock).toContain('id="aviso-ubicaciones-cerrar"');
    expect(stock).toContain("localStorage");
    expect(stock).toContain("mostrarAvisoUbicaciones");
  });

  it("muestra el duplicado con Sonner y un error con fix, sin alert()", () => {
    expect(stock).toContain('from "sonner"');
    expect(stock).toContain("r.status === 409");
    expect(stock).toContain("toast.error");
    expect(stock).not.toMatch(/\balert\s*\(/);
  });
});
