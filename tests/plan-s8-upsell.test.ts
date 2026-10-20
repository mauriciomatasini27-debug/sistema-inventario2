import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ctx } from "./helpers/ctx.js";
import { control, resetStore } from "../src/lib/store.js";
import { crearSesion } from "../src/modules/auth/sesiones.js";
import { crearProveedorCobro, olvidarPlanesEnMemoria } from "../src/lib/repos/planes.js";
import { planDe, PLANES_EJEMPLO, type Feature } from "../src/modules/planes/catalogo.js";
import {
  elegirOferta,
  ofertaUpsell,
  ofertasUpsell,
  VENTANA_DESCARTE_MS,
  type OfertaUpsell,
} from "../src/lib/panel-upsell.js";
import { GET as getIndice } from "../src/pages/api/panel/indice.js";

const AHORA = Date.parse("2026-10-20T12:00:00.000Z");
const BASICO = planDe(PLANES_EJEMPLO, "basico").features;
const PLUS = planDe(PLANES_EJEMPLO, "plus").features;
const PRO = planDe(PLANES_EJEMPLO, "pro").features;

const ASISTENTE_EN_PLUS: OfertaUpsell = {
  modulo: "asistente",
  titulo: "Asistente IA en Plus",
  texto: "Preguntale al negocio por ventas, stock y movimientos en tus palabras.",
  planId: "plus",
  planNombre: "Plus",
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

function singleSinDb() {
  delete process.env.TENANT_MODE;
  delete process.env.TENANT_DATABASE_URL;
}

function sesion(sub: string, tenantId: string | null): string {
  const c = crearSesion({ googleSub: sub, tenantId, ahora: new Date(AHORA) });
  control.sessions.set(c.registro.idHash, {
    idHash: c.registro.idHash,
    googleSub: sub,
    tenantId,
    expiraAt: c.registro.expiraAt,
    expiraAbsoluta: c.registro.expiraAbsoluta,
    lastSeenAt: new Date(AHORA).toISOString(),
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
  control.memberships.set("m-2", {
    id: "m-2",
    tenantId: "t-1",
    googleSub: "g-3",
    rol: "empleado",
    permisos: [],
    estado: "activo",
  });
}

type CuerpoIndice = {
  modulos: Array<{ id: string }>;
  upsell: OfertaUpsell[];
  rol: string;
};

async function indice(plano: string): Promise<CuerpoIndice> {
  const r = await getIndice(
    ctx("http://x/api/panel/indice", { headers: { cookie: `__Host-sesion=${plano}` } }),
  );
  return (await r.json()) as CuerpoIndice;
}

beforeEach(() => {
  singleSinDb();
  resetStore();
  olvidarPlanesEnMemoria();
});

afterEach(() => {
  singleSinDb();
});

describe("PLAN-S8 modelo de upsell", () => {
  it("Básico ofrece el asistente en Plus y nunca los módulos que ya incluye", () => {
    expect(ofertasUpsell(BASICO)).toEqual([ASISTENTE_EN_PLUS]);
    expect(ofertasUpsell(BASICO).map((o) => o.modulo)).not.toContain("bot");
    expect(ofertasUpsell(BASICO).map((o) => o.modulo)).not.toContain("alertas");
  });

  it("un plan con todo no tiene oferta", () => {
    expect(ofertasUpsell(PLUS)).toEqual([]);
    expect(ofertasUpsell(PRO)).toEqual([]);
    expect(ofertaUpsell({ features: PLUS, descartes: {}, ahora: AHORA })).toBeNull();
  });

  it("un módulo descartado hace 29 días no se ofrece y pasa al siguiente", () => {
    const features: Partial<Record<Feature, boolean>> = {
      ...BASICO,
      bot_consulta: false,
      asistente_ia: false,
    };
    const ofertas = ofertasUpsell(features);
    expect(ofertas.map((o) => o.modulo)).toEqual(["bot", "asistente"]);

    const descartes = { bot: AHORA - 29 * 24 * 60 * 60 * 1000 };
    expect(elegirOferta({ ofertas, descartes, ahora: AHORA })).toEqual(ASISTENTE_EN_PLUS);
  });

  it("a los 30 días exactos el módulo descartado vuelve a ofrecerse", () => {
    const features: Partial<Record<Feature, boolean>> = {
      ...BASICO,
      bot_consulta: false,
      asistente_ia: false,
    };
    const descartes = { bot: AHORA - VENTANA_DESCARTE_MS };
    expect(ofertaUpsell({ features, descartes, ahora: AHORA })).toMatchObject({
      modulo: "bot",
      titulo: "Bot de WhatsApp en Básico",
      planId: "basico",
      planNombre: "Básico",
    });
  });

  it("sin plan en el catálogo que incluya la feature no hay oferta", () => {
    const sinAsistente = PLANES_EJEMPLO.map((p) => ({
      ...p,
      features: { ...p.features, asistente_ia: false },
    }));
    expect(
      ofertasUpsell({ alertas_email: true, bot_consulta: true, asistente_ia: false }, sinAsistente),
    ).toEqual([]);
  });

  it("respeta el orden estable del índice y elige el plan más barato", () => {
    expect(ofertasUpsell({})).toEqual([
      {
        modulo: "bot",
        titulo: "Bot de WhatsApp en Básico",
        texto: "Consultá stock y movimientos por WhatsApp, sin abrir el panel.",
        planId: "basico",
        planNombre: "Básico",
      },
      {
        modulo: "alertas",
        titulo: "Alertas en Básico",
        texto: "Avisos cuando un producto baja del stock mínimo, sin revisar todo a mano.",
        planId: "basico",
        planNombre: "Básico",
      },
      ASISTENTE_EN_PLUS,
    ]);
  });
});

describe("PLAN-S8 GET /api/panel/indice suma upsell y rol", () => {
  it("Básico devuelve el índice de DASH-S12 sin cambios y la oferta del asistente", async () => {
    comercio();
    await crearProveedorCobro().crearSuscripcion({ tenantId: "t-1", planId: "basico" });
    const body = await indice(sesion("g-1", "t-1"));
    expect(body.modulos.map((m) => m.id)).toEqual([...CORE, "bot", "alertas"]);
    expect(body.upsell).toEqual([ASISTENTE_EN_PLUS]);
    expect(body.rol).toBe("dueno");
  });

  it("Plus no tiene ofertas y el rol del empleado viaja como empleado", async () => {
    comercio();
    await crearProveedorCobro().crearSuscripcion({ tenantId: "t-1", planId: "plus" });
    const body = await indice(sesion("g-3", "t-1"));
    expect(body.modulos.map((m) => m.id)).toContain("asistente");
    expect(body.upsell).toEqual([]);
    expect(body.rol).toBe("empleado");
  });

  it("sin suscripción activa no ofrece nada: no hay plan contra el cual comparar", async () => {
    comercio();
    const body = await indice(sesion("g-1", "t-1"));
    expect(body.modulos.map((m) => m.id)).toEqual(CORE);
    expect(body.upsell).toEqual([]);
  });
});
