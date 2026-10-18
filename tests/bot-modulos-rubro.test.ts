import { describe, expect, it, beforeEach, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
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
import {
  aplicarDefaultsModulosBot,
  cambiarModuloBot,
  guardarModulosBot,
  leerModulosBot,
} from "../src/lib/repos/bot-modulos.js";
import { conTenant } from "../src/lib/tenant-mode.js";
import { getTenantDb } from "../src/lib/db.js";
import { crearProveedorCobro, olvidarPlanesEnMemoria } from "../src/lib/repos/planes.js";
import { tenants } from "../src/db/schema.js";
import { tenantBotModules } from "../src/db/schema-planes.js";
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
  olvidarPlanesEnMemoria();
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
    expect(await leerModulosBot(j.tenant_id)).toEqual(["rotacion", "vencimientos"]);
  });
});

describe("BOT-S1 tenant previo sin registro", () => {
  it("conserva todos los módulos prendidos como antes de BOT-S1", async () => {
    expect(await leerModulosBot("t-legado")).toEqual([
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
    await aplicarDefaultsModulosBot("t-1", "kiosco");
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
    expect(await leerModulosBot("t-1")).toEqual(["rotacion", "vencimientos"]);

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
    expect(await leerModulosBot("t-1")).toEqual(["vencimientos"]);
  });
});

describe("PLAN-S2 bot_rubro gateado por plan", () => {
  it("Básico no puede encender un módulo de rubro", async () => {
    tenantConMiembros("t-plan", "dueno-1");
    await guardarModulosBot("t-plan", []);
    await crearProveedorCobro().crearSuscripcion({ tenantId: "t-plan", planId: "basico" });
    const dueno = sesionEnStore("dueno-1", "t-plan");

    const r = await patchBotModulos(
      ctx("http://x/api/bot-modulos", {
        method: "PATCH",
        headers: { cookie: `__Host-sesion=${dueno}` },
        body: { modulo: "flujo_caja", activo: true },
      }),
    );
    expect(r.status).toBe(403);
    expect(((await r.json()) as { codigo?: string }).codigo).toBe("fuera_de_plan");
    expect(await leerModulosBot("t-plan")).not.toContain("flujo_caja");
  });

  it("Plus sí puede", async () => {
    tenantConMiembros("t-plan", "dueno-1");
    await guardarModulosBot("t-plan", []);
    await crearProveedorCobro().crearSuscripcion({ tenantId: "t-plan", planId: "plus" });
    const dueno = sesionEnStore("dueno-1", "t-plan");

    const r = await patchBotModulos(
      ctx("http://x/api/bot-modulos", {
        method: "PATCH",
        headers: { cookie: `__Host-sesion=${dueno}` },
        body: { modulo: "flujo_caja", activo: true },
      }),
    );
    expect(r.status).toBe(200);
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

const hayPG = Boolean(process.env.PG_TEST_URL_A && process.env.PG_TEST_URL_B);
const sufijoPG = `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6)}`;
const uuidA = randomUUID();
const uuidB = randomUUID();
const tenantsPG = [uuidA, uuidB] as const;

function fijarMulti() {
  process.env.TENANT_MODE = "multi";
  process.env[`TENANT_DATABASE_URL_${uuidA}`] = process.env.PG_TEST_URL_A ?? "";
  process.env[`TENANT_DATABASE_URL_${uuidB}`] = process.env.PG_TEST_URL_B ?? "";
}

async function asegurarTenantDb(id: string, marca: string) {
  await conTenant(id, async () => {
    await getTenantDb()
      .insert(tenants)
      .values({ id, nombreComercio: `Bot ${sufijoPG}`, slug: `bot-${sufijoPG}-${marca}` })
      .onConflictDoNothing();
  });
}

async function borrarRastroPG() {
  for (const id of tenantsPG) {
    await conTenant(id, async () => {
      const db = getTenantDb();
      await db.delete(tenantBotModules).where(eq(tenantBotModules.tenantId, id));
      await db.delete(tenants).where(eq(tenants.id, id));
    });
  }
}

describe.skipIf(!hayPG)("BOT-S1/S2 PG: tenant_bot_modules persiste los interruptores aislados A/B", () => {
  beforeAll(async () => {
    fijarMulti();
    await asegurarTenantDb(uuidA, "a");
    await asegurarTenantDb(uuidB, "b");
  });

  beforeEach(async () => {
    fijarMulti();
    for (const id of tenantsPG) {
      await conTenant(id, async () => {
        await getTenantDb().delete(tenantBotModules).where(eq(tenantBotModules.tenantId, id));
      });
    }
  });

  afterAll(async () => {
    fijarMulti();
    await borrarRastroPG();
    delete process.env.TENANT_MODE;
    delete process.env[`TENANT_DATABASE_URL_${uuidA}`];
    delete process.env[`TENANT_DATABASE_URL_${uuidB}`];
  });

  it("un tenant sin filas conserva todos los módulos prendidos", async () => {
    fijarMulti();
    expect(await conTenant(uuidA, () => leerModulosBot(uuidA))).toEqual([...MODULOS_BOT]);
  });

  it("guardar escribe las 6 filas con su interruptor y leer las devuelve en orden", async () => {
    fijarMulti();
    await guardarModulosBot(uuidA, ["vencimientos", "rotacion"]);
    const filas = await conTenant(uuidA, () =>
      getTenantDb().select().from(tenantBotModules).where(eq(tenantBotModules.tenantId, uuidA)),
    );
    expect(filas).toHaveLength(6);
    expect(new Set(filas.filter((f) => f.activo).map((f) => f.modulo))).toEqual(new Set(["rotacion", "vencimientos"]));
    expect(await leerModulosBot(uuidA)).toEqual(["rotacion", "vencimientos"]);
  });

  it("todo apagado persiste como 6 filas con activo=false y lee []", async () => {
    fijarMulti();
    await guardarModulosBot(uuidB, []);
    const filas = await conTenant(uuidB, () =>
      getTenantDb().select().from(tenantBotModules).where(eq(tenantBotModules.tenantId, uuidB)),
    );
    expect(filas).toHaveLength(6);
    expect(filas.every((f) => f.activo === false)).toBe(true);
    expect(await leerModulosBot(uuidB)).toEqual([]);
  });

  it("los defaults por rubro son idempotentes y no pisan un módulo apagado", async () => {
    fijarMulti();
    expect(await aplicarDefaultsModulosBot(uuidA, "kiosco")).toEqual(["rotacion", "vencimientos"]);
    await cambiarModuloBot(uuidA, "rotacion", false);
    expect(await aplicarDefaultsModulosBot(uuidA, "kiosco")).toEqual(["vencimientos"]);
    const filas = await conTenant(uuidA, () =>
      getTenantDb().select().from(tenantBotModules).where(eq(tenantBotModules.tenantId, uuidA)),
    );
    expect(filas).toHaveLength(6);
  });

  it("aísla tenants: lo guardado en A no lo ve B", async () => {
    fijarMulti();
    await guardarModulosBot(uuidA, ["cobranza"]);
    expect(await leerModulosBot(uuidA)).toEqual(["cobranza"]);
    expect(await leerModulosBot(uuidB)).toEqual([...MODULOS_BOT]);
  });
});
