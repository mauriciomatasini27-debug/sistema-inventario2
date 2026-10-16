import { describe, expect, it, beforeEach } from "vitest";
import { ctx } from "./helpers/ctx.js";
import { control, resetStore } from "../src/lib/store.js";
import { crearSesion } from "../src/modules/auth/sesiones.js";
import {
  DEFAULTS_POR_RUBRO,
  MODULOS_BOT,
  defaultsDeRubro,
  resolverRubroBot,
  rubrosAvanzadosHabilitados,
} from "../src/modules/bot/modulos-rubro.js";
import { aplicarDefaultsModulosBot, leerModulosBot } from "../src/lib/repos/bot-modulos.js";
import { enrutar, type EntradaRouter } from "../src/modules/whatsapp/router.js";
import { POST as postAlta } from "../src/pages/api/onboarding/alta.js";
import { PATCH as patchBotModulos } from "../src/pages/api/bot-modulos.js";

function sesionEnStore(sub: string, tenantId: string | null = null) {
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

function tenantConMiembros(id: string, dueno: string, empleado = "juan") {
  control.tenants.set(id, {
    id,
    nombreComercio: "Kiosco La Esquina",
    slug: "kiosco-la-esquina",
    estado: "activo",
    plan: "demo",
    moneda: "ARS",
    ownerGoogleSub: dueno,
    esDemo: true,
  });
  control.memberships.set(`m-${dueno}`, { id: `m-${dueno}`, tenantId: id, googleSub: dueno, rol: "dueno", permisos: [], estado: "activo" });
  control.memberships.set("m-juan", { id: "m-juan", tenantId: id, googleSub: empleado, rol: "empleado", permisos: [], estado: "activo" });
}

beforeEach(() => {
  resetStore();
});

describe("BOT-S1 defaults por rubro", () => {
  it("quiosco activa rotacion + vencimientos y pyme flujo_caja + cobranza", () => {
    expect(DEFAULTS_POR_RUBRO.quiosco).toEqual(["rotacion", "vencimientos"]);
    expect(defaultsDeRubro("quiosco", { rubrosAvanzados: false })).toEqual(["rotacion", "vencimientos"]);
    expect(defaultsDeRubro("pyme", { rubrosAvanzados: false })).toEqual(["flujo_caja", "cobranza"]);
  });

  it("fabrica y logistica quedan detrás de un flag apagado por defecto", () => {
    expect(rubrosAvanzadosHabilitados({})).toBe(false);
    expect(rubrosAvanzadosHabilitados({ BOT_RUBROS_AVANZADOS: "1" })).toBe(true);
    expect(defaultsDeRubro("fabrica", { rubrosAvanzados: false })).toEqual([]);
    expect(defaultsDeRubro("logistica", { rubrosAvanzados: false })).toEqual([]);
    expect(defaultsDeRubro("fabrica", { rubrosAvanzados: true })).toEqual(["ordenes_produccion"]);
    expect(defaultsDeRubro("logistica", { rubrosAvanzados: true })).toEqual(["entregas"]);
  });

  it("resuelve el rubro del onboarding al rubro del bot", () => {
    expect(resolverRubroBot("kiosco")).toBe("quiosco");
    expect(resolverRubroBot("almacen")).toBe("pyme");
    expect(resolverRubroBot("pyme")).toBe("pyme");
    expect(resolverRubroBot("fabrica")).toBe("fabrica");
    expect(resolverRubroBot("logistica")).toBe("logistica");
  });
});

describe("BOT-S1 activación al terminar el onboarding", () => {
  it("quiosco que termina el alta queda con rotacion + vencimientos", async () => {
    const plano = sesionEnStore("dueno-1");
    const r = await postAlta(
      ctx("http://x/api/onboarding/alta", {
        method: "POST",
        headers: { "Content-Type": "application/json", cookie: `__Host-sesion=${plano}` },
        body: { nombre_comercio: "Kiosco La Esquina", rubro: "kiosco" },
      }),
    );
    expect(r.status).toBe(201);
    const j = (await r.json()) as { tenant_id: string };
    expect(leerModulosBot(j.tenant_id)).toEqual(["rotacion", "vencimientos"]);
  });
});

describe("BOT-S1 tenant previo sin registro", () => {
  it("conserva todos los módulos prendidos como antes de BOT-S1", () => {
    expect(leerModulosBot("t-legado")).toEqual([
      "rotacion",
      "vencimientos",
      "flujo_caja",
      "cobranza",
      "ordenes_produccion",
      "entregas",
    ]);
  });
});

describe("BOT-S1 toggle solo dueño", () => {
  it("empleado recibe 403 y dueño apaga el módulo", async () => {
    tenantConMiembros("t-1", "dueno-1");
    aplicarDefaultsModulosBot("t-1", "kiosco");
    const empleado = sesionEnStore("juan", "t-1");
    const dueno = sesionEnStore("dueno-1", "t-1");

    const rEmp = await patchBotModulos(
      ctx("http://x/api/bot-modulos", {
        method: "PATCH",
        headers: { cookie: `__Host-sesion=${empleado}` },
        body: { modulo: "rotacion", activo: false },
      }),
    );
    expect(rEmp.status).toBe(403);
    expect(leerModulosBot("t-1")).toEqual(["rotacion", "vencimientos"]);

    const rDueno = await patchBotModulos(
      ctx("http://x/api/bot-modulos", {
        method: "PATCH",
        headers: { cookie: `__Host-sesion=${dueno}` },
        body: { modulo: "rotacion", activo: false },
      }),
    );
    expect(rDueno.status).toBe(200);
    const j = (await rDueno.json()) as { activos: string[] };
    expect(j.activos).toEqual(["vencimientos"]);
    expect(leerModulosBot("t-1")).toEqual(["vencimientos"]);
  });
});

describe("BOT-S2 router filtra intenciones por módulo", () => {
  function base(sobre: Partial<EntradaRouter> = {}): EntradaRouter {
    return {
      texto: "",
      catalogo: [],
      comercio: "Kiosco",
      pedidos: [],
      movs: [],
      friday: new Map(),
      sesion: null,
      ahoraMs: 1_000_000,
      modulos: MODULOS_BOT,
      ...sobre,
    };
  }

  it("módulo apagado no ejecuta y responde no disponible en tu plan/rubro", () => {
    const r = enrutar(base({ texto: "lista del viernes", modulos: [] }));
    expect(r.accion).toBe("modulo_apagado");
    if (r.accion === "modulo_apagado") expect(r.texto).toContain("no disponible en tu plan/rubro");
  });

  it("con rotacion activa arma la lista del viernes", () => {
    expect(enrutar(base({ texto: "lista del viernes", modulos: ["rotacion"] })).accion).toBe("viernes_ver");
  });

  it("los movimientos de caja requieren flujo_caja", () => {
    const movs = [{ idemKey: "k1", sku: "m1", nombre: "Milka", delta: -3, tipo: "VENTA" as const, fechaMs: 999_000 }];
    expect(enrutar(base({ texto: "últimos movimientos de Milka", movs, modulos: ["rotacion"] })).accion).toBe(
      "modulo_apagado",
    );
    expect(enrutar(base({ texto: "últimos movimientos de Milka", movs, modulos: ["flujo_caja"] })).accion).toBe(
      "dia_movimientos",
    );
  });
});
