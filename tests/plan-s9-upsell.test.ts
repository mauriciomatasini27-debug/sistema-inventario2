import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ctx } from "./helpers/ctx.js";
import { control, resetStore } from "../src/lib/store.js";
import { crearSesion } from "../src/modules/auth/sesiones.js";
import { crearProveedorCobro, olvidarPlanesEnMemoria } from "../src/lib/repos/planes.js";
import { PLANES_EJEMPLO, planDe, type PlanId } from "../src/modules/planes/catalogo.js";
import {
  accesoSuperficie,
  upsellDeRespuestaAsistente,
  type PantallaUpsell,
} from "../src/lib/panel-upsell.js";
import { GET as getUpsell } from "../src/pages/api/panel/upsell.js";
import { GET as getAsistente } from "../src/pages/api/asistente.js";

const AHORA = Date.parse("2026-10-24T12:00:00.000Z");
const QUE_HACE_ASISTENTE = "Preguntale al negocio por ventas, stock y movimientos en tus palabras.";
const QUE_HACE_WHATSAPP = "Avisos de stock bajo por WhatsApp y el resumen de la mañana.";

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

async function activar(planId: PlanId) {
  await crearProveedorCobro().crearSuscripcion({ tenantId: "t-1", planId });
}

function pedir(plano: string | null, superficie: string) {
  const headers = plano ? { cookie: `__Host-sesion=${plano}` } : {};
  return getUpsell(ctx(`http://x/api/panel/upsell?superficie=${superficie}`, { headers }));
}

beforeEach(() => {
  singleSinDb();
  resetStore();
  olvidarPlanesEnMemoria();
});

afterEach(() => {
  singleSinDb();
});

describe("PLAN-S9 pantalla de upsell", () => {
  it("Básico abre el asistente con qué hace, el plan actual y el plan que lo incluye", () => {
    const acceso = accesoSuperficie({ superficie: "asistente", planId: "basico", rol: "dueno" });
    if (acceso.tipo !== "upsell") throw new Error("se esperaba upsell");
    expect(acceso.pantalla).toMatchObject({
      superficie: "asistente",
      titulo: "Asistente IA en Plus",
      queHace: QUE_HACE_ASISTENTE,
      planActualId: "basico",
      planActualNombre: "Básico",
      planActualTexto: "Tu plan actual es Básico.",
      planDelModuloNombre: "Plus",
      planModuloTexto: "Está en el plan Plus.",
      cta: "ver_planes",
      reemplazaPagina: true,
    });
  });

  it("el empleado ve el mismo texto y el CTA para pedirle al Dueño", () => {
    const acceso = accesoSuperficie({ superficie: "asistente", planId: "basico", rol: "empleado" });
    if (acceso.tipo !== "upsell") throw new Error("se esperaba upsell");
    expect(acceso.pantalla.cta).toBe("pedile_al_dueno");
    expect(acceso.pantalla.planActualTexto).toBe("Tu plan actual es Básico.");
    expect(acceso.pantalla.queHace).toBe(QUE_HACE_ASISTENTE);
  });

  it("Básico incluye el bot y no lo reemplaza", () => {
    expect(accesoSuperficie({ superficie: "bot", planId: "basico", rol: "dueno" })).toEqual({
      tipo: "incluido",
    });
    expect(planDe(PLANES_EJEMPLO, "basico").features.bot_consulta).toBe(true);
  });

  it("WhatsApp de alertas en Básico es upsell y deja la página de mail", () => {
    const acceso = accesoSuperficie({ superficie: "alertas_whatsapp", planId: "basico", rol: "dueno" });
    if (acceso.tipo !== "upsell") throw new Error("se esperaba upsell");
    expect(acceso.pantalla).toMatchObject({
      titulo: "Alertas por WhatsApp en Plus",
      queHace: QUE_HACE_WHATSAPP,
      planActualTexto: "Tu plan actual es Básico.",
      planModuloTexto: "Está en el plan Plus.",
      cta: "ver_planes",
      reemplazaPagina: false,
    });
  });

  it("sin mail y sin WhatsApp la ruta de alertas se reemplaza entera", () => {
    const acceso = accesoSuperficie({ superficie: "alertas_whatsapp", planId: null, rol: "empleado" });
    if (acceso.tipo !== "upsell") throw new Error("se esperaba upsell");
    expect(acceso.pantalla.reemplazaPagina).toBe(true);
    expect(acceso.pantalla.planActualTexto).toBe("No tenés un plan activo.");
    expect(acceso.pantalla.planModuloTexto).toBe("Está en el plan Plus.");
    expect(acceso.pantalla.cta).toBe("pedile_al_dueno");
  });

  it("un plan sin bot ofrece el plan más barato que sí lo tiene", () => {
    const catalogo = PLANES_EJEMPLO.map((p) =>
      p.id === "basico" ? { ...p, features: { ...p.features, bot_consulta: false } } : p,
    );
    const acceso = accesoSuperficie({ superficie: "bot", planId: "basico", rol: "dueno", catalogo });
    if (acceso.tipo !== "upsell") throw new Error("se esperaba upsell");
    expect(acceso.pantalla.titulo).toBe("Bot de WhatsApp en Plus");
    expect(acceso.pantalla.reemplazaPagina).toBe(true);
    expect(acceso.pantalla.queHace).toBe("Consultá stock y movimientos por WhatsApp, sin abrir el panel.");
  });

  it("Plus no muestra upsell en ninguna de las tres superficies", () => {
    for (const superficie of ["bot", "alertas_whatsapp", "asistente"] as const) {
      expect(accesoSuperficie({ superficie, planId: "plus", rol: "dueno" }).tipo).toBe("incluido");
    }
  });

  it("el drawer ignora un upsell si el plan sí incluye el asistente", () => {
    const pantalla = accesoSuperficie({ superficie: "asistente", planId: "basico", rol: "dueno" });
    if (pantalla.tipo !== "upsell") throw new Error("se esperaba upsell");
    expect(upsellDeRespuestaAsistente({ incluido: true, upsell: pantalla.pantalla })).toBeNull();
    expect(upsellDeRespuestaAsistente({ incluido: false, explicacion: "Tu plan no incluye el asistente IA." })).toBeNull();
    expect(upsellDeRespuestaAsistente({ incluido: false, upsell: pantalla.pantalla })).toEqual(pantalla.pantalla);
  });
});

describe("PLAN-S9 GET /api/panel/upsell", () => {
  it("Básico Dueño recibe 200 con la pantalla, no 404", async () => {
    comercio();
    await activar("basico");
    const r = await pedir(sesion("g-1", "t-1"), "alertas_whatsapp");
    expect(r.status).toBe(200);
    const body = (await r.json()) as { acceso: string; pantalla: PantallaUpsell };
    expect(body.acceso).toBe("upsell");
    expect(body.pantalla.cta).toBe("ver_planes");
    expect(body.pantalla.planActualNombre).toBe("Básico");
    expect(body.pantalla.reemplazaPagina).toBe(false);
  });

  it("el empleado de Básico no entra a Ver planes", async () => {
    comercio();
    await activar("basico");
    const r = await pedir(sesion("g-3", "t-1"), "asistente");
    expect(r.status).toBe(200);
    const body = (await r.json()) as { acceso: string; pantalla: PantallaUpsell };
    expect(body.pantalla.cta).toBe("pedile_al_dueno");
    expect(body.pantalla.queHace).toBe(QUE_HACE_ASISTENTE);
    expect(body.pantalla.planActualTexto).toBe("Tu plan actual es Básico.");
  });

  it("Básico en /panel/bot sigue incluido", async () => {
    comercio();
    await activar("basico");
    const r = await pedir(sesion("g-1", "t-1"), "bot");
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ acceso: "incluido" });
  });

  it("Plus incluye las alertas de WhatsApp", async () => {
    comercio();
    await activar("plus");
    const r = await pedir(sesion("g-1", "t-1"), "alertas_whatsapp");
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ acceso: "incluido" });
  });

  it("sin sesión responde 403 y una superficie rara 400, nunca 404", async () => {
    comercio();
    const sinSesion = await pedir(null, "asistente");
    expect(sinSesion.status).toBe(403);
    const rara = await pedir(sesion("g-1", "t-1"), "caja");
    expect(rara.status).toBe(400);
  });
});

describe("PLAN-S9 GET /api/asistente suma la pantalla", () => {
  it("Básico Dueño manda el upsell y ninguna pregunta", async () => {
    comercio();
    await activar("basico");
    const r = await getAsistente(
      ctx("http://x/api/asistente", { headers: { cookie: `__Host-sesion=${sesion("g-1", "t-1")}` } }),
    );
    expect(r.status).toBe(200);
    const body = (await r.json()) as { incluido: boolean; preguntas: unknown[]; upsell: PantallaUpsell };
    expect(body.incluido).toBe(false);
    expect(body.preguntas).toEqual([]);
    expect(body.upsell.cta).toBe("ver_planes");
    expect(body.upsell.planActualTexto).toBe("Tu plan actual es Básico.");
    expect(body.upsell.queHace).toBe(QUE_HACE_ASISTENTE);
    expect(upsellDeRespuestaAsistente(body)).toEqual(body.upsell);
  });

  it("el empleado recibe el CTA para el Dueño", async () => {
    comercio();
    await activar("basico");
    const r = await getAsistente(
      ctx("http://x/api/asistente", { headers: { cookie: `__Host-sesion=${sesion("g-3", "t-1")}` } }),
    );
    const body = (await r.json()) as { upsell: PantallaUpsell };
    expect(body.upsell.cta).toBe("pedile_al_dueno");
  });

  it("Plus no manda upsell", async () => {
    comercio();
    await activar("plus");
    const r = await getAsistente(
      ctx("http://x/api/asistente", { headers: { cookie: `__Host-sesion=${sesion("g-1", "t-1")}` } }),
    );
    const body = (await r.json()) as { incluido: boolean; upsell?: unknown };
    expect(body.incluido).toBe(true);
    expect(body.upsell).toBeUndefined();
  });
});

describe("PLAN-S9 las rutas montan la pantalla", () => {
  const rutas = [
    "src/pages/panel/bot/config.astro",
    "src/pages/panel/bot/historial.astro",
    "src/pages/panel/alertas/umbrales.astro",
    "src/pages/panel/alertas/destinatarios.astro",
    "src/pages/panel/alertas/historial.astro",
  ];

  it("bot y alertas tienen pantalla de upsell y el cuerpo del módulo", () => {
    for (const ruta of rutas) {
      const src = readFileSync(ruta, "utf8");
      expect(src, ruta).toContain("<UpsellPantalla");
      expect(src, ruta).toContain("</UpsellPantalla>");
    }
    expect(readFileSync("src/components/panel/UpsellPantalla.astro", "utf8")).toContain("data-modulo-cuerpo");
    const drawer = readFileSync("src/components/panel/AsistenteDrawer.astro", "utf8");
    expect(drawer).toContain("upsellDeRespuestaAsistente");
    expect(drawer).toContain(">Ver planes</a>");
    expect(drawer).toContain("Pedile al Dueño que lo active");
    expect(drawer).not.toContain("data-modulo-indice");
  });
});
