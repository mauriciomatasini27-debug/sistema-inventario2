import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ctx } from "./helpers/ctx.js";
import { control, resetStore } from "../src/lib/store.js";
import { crearSesion } from "../src/modules/auth/sesiones.js";
import { crearProveedorCobro, olvidarPlanesEnMemoria } from "../src/lib/repos/planes.js";
import { indicePanel, featuresDelIndice, MODULOS_INDICE } from "../src/lib/panel-modulos.js";
import type { Feature } from "../src/modules/planes/catalogo.js";
import { GET as getIndice } from "../src/pages/api/panel/indice.js";

const AHORA = new Date("2026-10-19T12:00:00.000Z");

const TODO: Record<Feature, boolean> = {
  nucleo: true,
  alertas_email: true,
  bot_consulta: true,
  alertas_whatsapp: true,
  bot_rubro: true,
  asistente_ia: true,
};

const CORE = [
  "dashboard",
  "ventas",
  "caja",
  "stock",
  "precios",
  "proveedores",
  "consumos",
  "fiado",
  "reportes",
];

function ids(features: Partial<Record<Feature, boolean>>): string[] {
  return indicePanel(features).map((m) => m.id);
}

function singleSinDb() {
  delete process.env.TENANT_MODE;
  delete process.env.TENANT_DATABASE_URL;
}

function sesion(sub: string, tenantId: string | null): string {
  const c = crearSesion({ googleSub: sub, tenantId, ahora: AHORA });
  control.sessions.set(c.registro.idHash, {
    idHash: c.registro.idHash,
    googleSub: sub,
    tenantId,
    expiraAt: c.registro.expiraAt,
    expiraAbsoluta: c.registro.expiraAbsoluta,
    lastSeenAt: AHORA.toISOString(),
  });
  return c.idPlano;
}

function comercio() {
  control.tenants.set("t-1", {
    id: "t-1",
    nombreComercio: "Kiosco",
    slug: "kiosco",
    estado: "activo",
    plan: "base",
    moneda: "ARS",
    ownerGoogleSub: "g-1",
    esDemo: false,
  });
  control.memberships.set("m-1", {
    id: "m-1",
    tenantId: "t-1",
    googleSub: "g-1",
    rol: "dueno",
    permisos: [],
    estado: "activo",
  });
}

function pedir(plano?: string) {
  return getIndice(
    ctx("http://x/api/panel/indice", plano ? { headers: { cookie: `__Host-sesion=${plano}` } } : {}),
  );
}

type Modulo = { id: string; label: string; href: string };

async function modulos(plano: string): Promise<Modulo[]> {
  const body = (await (await pedir(plano)).json()) as { modulos: Modulo[] };
  return body.modulos;
}

beforeEach(() => {
  singleSinDb();
  resetStore();
  olvidarPlanesEnMemoria();
});

afterEach(() => {
  singleSinDb();
});

describe("DASH-S12 modelo del índice", () => {
  it("plan con todo enciende el índice completo en orden estable", () => {
    expect(ids(TODO)).toEqual([...CORE, "bot", "alertas", "asistente"]);
  });

  it("plan sin asistente_ia no muestra el asistente", () => {
    expect(ids({ ...TODO, asistente_ia: false })).toEqual([...CORE, "bot", "alertas"]);
  });

  it("plan sin bot_consulta no muestra el bot", () => {
    expect(ids({ ...TODO, bot_consulta: false })).toEqual([...CORE, "alertas", "asistente"]);
  });

  it("alertas se enciende con email o con whatsapp", () => {
    expect(ids({ ...TODO, alertas_email: false, alertas_whatsapp: true })).toContain("alertas");
    expect(ids({ ...TODO, alertas_email: true, alertas_whatsapp: false })).toContain("alertas");
    expect(ids({ ...TODO, alertas_email: false, alertas_whatsapp: false })).not.toContain("alertas");
  });

  it("los módulos del núcleo quedan visibles sin plan", () => {
    expect(ids({})).toEqual(CORE);
  });

  it("ventas pendientes solo aparece para el Dueño", () => {
    expect(indicePanel({}, "empleado").map((m) => m.id)).not.toContain("ventas-pendientes");
    expect(indicePanel({}, "dueno").map((m) => m.id)).toContain("ventas-pendientes");
  });

  it("devuelve etiqueta y destino reales de bot y alertas", () => {
    expect(indicePanel(TODO)).toContainEqual({ id: "bot", label: "Bot", href: "/panel/bot/config" });
    expect(indicePanel(TODO)).toContainEqual({
      id: "alertas",
      label: "Alertas",
      href: "/panel/alertas/umbrales",
    });
  });

  it("las features consultadas salen del mismo registro", () => {
    expect([...featuresDelIndice()].sort()).toEqual(
      ["alertas_email", "alertas_whatsapp", "asistente_ia", "bot_consulta"],
    );
  });

  it("las tarjetas marcan ids del mismo registro", () => {
    const dir = join(process.cwd(), "src/components/panel");
    const fuentes = [
      readFileSync(join(process.cwd(), "src/pages/panel.astro"), "utf8"),
      ...readdirSync(dir).map((f) => readFileSync(join(dir, f), "utf8")),
    ].join("\n");
    const conocidos = new Set<string>(MODULOS_INDICE.map((m) => m.id));
    const literales = [...fuentes.matchAll(/data-modulo-indice="([^"]+)"/g)]
      .map((m) => m[1])
      .filter((id): id is string => id !== undefined);
    for (const id of literales) expect(conocidos.has(id), id).toBe(true);
    for (const id of ["bot", "alertas", "asistente"] as const) {
      expect(fuentes).toContain(`data-modulo-indice={${id}.id}`);
      expect(fuentes).toContain(`moduloIndice("${id}")`);
    }
  });
});

describe("DASH-S12 GET /api/panel/indice", () => {
  it("sin sesión responde 403", async () => {
    expect((await pedir()).status).toBe(403);
  });

  it("con sesión sin membership responde 403", async () => {
    comercio();
    expect((await pedir(sesion("g-2", null))).status).toBe(403);
  });

  it("sin plan activo devuelve solo el núcleo", async () => {
    comercio();
    expect((await modulos(sesion("g-1", "t-1"))).map((m) => m.id)).toEqual([...CORE, "ventas-pendientes"]);
  });

  it("plan Básico enciende bot y alertas, no el asistente", async () => {
    comercio();
    await crearProveedorCobro().crearSuscripcion({ tenantId: "t-1", planId: "basico" });
    expect((await modulos(sesion("g-1", "t-1"))).map((m) => m.id)).toEqual([...CORE, "ventas-pendientes", "bot", "alertas"]);
  });

  it("plan Plus enciende bot, alertas y asistente", async () => {
    comercio();
    await crearProveedorCobro().crearSuscripcion({ tenantId: "t-1", planId: "plus" });
    const lista = await modulos(sesion("g-1", "t-1"));
    expect(lista).toEqual([
      { id: "dashboard", label: "Dashboard", href: "/panel" },
      { id: "ventas", label: "Ventas", href: "/venta" },
      { id: "caja", label: "Caja", href: "/panel/caja" },
      { id: "stock", label: "Stock", href: "/panel/stock" },
      { id: "precios", label: "Precios", href: "/panel/precios" },
      { id: "proveedores", label: "Proveedores", href: "/panel/proveedores" },
      { id: "consumos", label: "Consumos", href: "/panel/consumos" },
      { id: "fiado", label: "Fiado", href: "/panel/fiado" },
      { id: "reportes", label: "Reportes", href: "/panel/reportes" },
      { id: "ventas-pendientes", label: "Ventas pendientes", href: "/panel/ventas-pendientes" },
      { id: "bot", label: "Bot", href: "/panel/bot/config" },
      { id: "alertas", label: "Alertas", href: "/panel/alertas/umbrales" },
      { id: "asistente", label: "Asistente", href: "#asistente" },
    ]);
  });

  it("en multi sin base responde 503", async () => {
    comercio();
    process.env.TENANT_MODE = "multi";
    const r = await pedir(sesion("g-1", "t-1"));
    expect(r.status).toBe(503);
    expect(await r.json()).toEqual({ error: "base_no_disponible" });
  });
});
