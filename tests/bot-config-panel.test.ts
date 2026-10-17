import { beforeEach, describe, expect, it } from "vitest";
import { ctx } from "./helpers/ctx.js";
import { control, resetStore } from "../src/lib/store.js";
import { crearSesion } from "../src/modules/auth/sesiones.js";
import { armarVinculosPanel, type EntradaVinculosPanel, type PersonaVinculos } from "../src/modules/whatsapp/vinculos-panel.js";
import {
  codigoVencido,
  contarVinculados,
  etiquetaEstado,
  formatearCuentaRegresiva,
  hayVinculados,
  textoOptIn,
} from "../src/lib/bot-config-panel.js";
import { GET as getVinculos } from "../src/pages/api/whatsapp/vinculos.js";
import { POST as postVincularCode } from "../src/pages/api/whatsapp/vincular-code.js";

const AHORA = 1_000_000;

function sesion(sub: string, tenantId: string | null): string {
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

function tenantConMiembros(id: string, dueno: string, empleado = "juan"): void {
  control.tenants.set(id, {
    id,
    nombreComercio: "Kiosco La Esquina",
    slug: "kiosco-la-esquina",
    estado: "activo",
    plan: "base",
    moneda: "ARS",
    ownerGoogleSub: dueno,
    esDemo: false,
  });
  control.memberships.set(`m-${dueno}`, {
    id: `m-${dueno}`,
    tenantId: id,
    googleSub: dueno,
    rol: "dueno",
    permisos: [],
    estado: "activo",
    puedeUsarBot: true,
  });
  control.memberships.set("m-juan", {
    id: "m-juan",
    tenantId: id,
    googleSub: empleado,
    rol: "empleado",
    permisos: [],
    estado: "activo",
    puedeUsarBot: true,
  });
  control.users.set(dueno, { googleSub: dueno, email: "ana@gmail.com", nombre: "Ana", emailVerificado: true });
  control.users.set(empleado, { googleSub: empleado, email: "juan@gmail.com", emailVerificado: true });
}

function conSesion(plano: string): ReturnType<typeof ctx> {
  return ctx("http://x/api/whatsapp/vinculos", { headers: { cookie: `__Host-sesion=${plano}` } });
}

function entrada(sobre: Partial<EntradaVinculosPanel> = {}): EntradaVinculosPanel {
  return {
    tenantId: "t-1",
    googleSub: "dueno-1",
    esDueno: true,
    memberships: [
      { tenantId: "t-1", googleSub: "dueno-1", rol: "dueno", estado: "activo", puedeUsarBot: true },
      { tenantId: "t-1", googleSub: "juan", rol: "empleado", estado: "activo", puedeUsarBot: true },
    ],
    users: new Map([
      ["dueno-1", { googleSub: "dueno-1", email: "ana@x.com", nombre: "Ana" }],
      ["juan", { googleSub: "juan", email: "juan@gmail.com" }],
    ]),
    botLinks: [],
    vincularCodes: [],
    waPrefs: new Map(),
    ahoraMs: AHORA,
    ...sobre,
  };
}

function vinculado(googleSub: string, numero = "+5491155551234") {
  return { numeroE164: numero, tenantId: "t-1", googleSub, estado: "verificado" as const };
}

beforeEach(() => {
  resetStore();
});

describe("DASH-S1 núcleo vinculos-panel", () => {
  it("sin teléfonos: cada persona queda sin teléfonos y la vista es vacía", () => {
    const p = armarVinculosPanel(entrada());
    expect(p.map((x) => x.google_sub)).toEqual(["dueno-1", "juan"]);
    expect(p.every((x) => x.telefonos.length === 0)).toBe(true);
    expect(hayVinculados(p)).toBe(false);
  });

  it("botLink verificado => vinculado con número enmascarado", () => {
    const p = armarVinculosPanel(entrada({ botLinks: [vinculado("dueno-1")] }));
    const ana = p.find((x) => x.google_sub === "dueno-1");
    expect(ana?.telefonos).toEqual([{ numero_enmascarado: "+…1234", estado: "vinculado" }]);
    expect(hayVinculados(p)).toBe(true);
  });

  it("código vigente y sin usar => pendiente con expira_en ISO", () => {
    const expiraEn = AHORA + 600_000;
    const p = armarVinculosPanel(
      entrada({ vincularCodes: [{ numero: "+5491155551234", tenantId: "t-1", googleSub: "juan", expiraEn, usado: false }] }),
    );
    const juan = p.find((x) => x.google_sub === "juan");
    expect(juan?.telefonos).toEqual([
      { numero_enmascarado: "+…1234", estado: "pendiente", expira_en: new Date(expiraEn).toISOString() },
    ]);
  });

  it("pausa vigente => pausado con pausado_hasta ISO y opt_in leído", () => {
    const pausadoHastaMs = AHORA + 3_600_000;
    const p = armarVinculosPanel(
      entrada({
        botLinks: [vinculado("dueno-1")],
        waPrefs: new Map([["t-1:dueno-1", { optIn: true, pausadoHastaMs }]]),
      }),
    );
    const ana = p.find((x) => x.google_sub === "dueno-1");
    expect(ana?.opt_in).toBe(true);
    expect(ana?.telefonos[0]).toEqual({
      numero_enmascarado: "+…1234",
      estado: "pausado",
      pausado_hasta: new Date(pausadoHastaMs).toISOString(),
    });
  });

  it("pausa vencida vuelve a vinculado", () => {
    const p = armarVinculosPanel(
      entrada({
        botLinks: [vinculado("dueno-1")],
        waPrefs: new Map([["t-1:dueno-1", { optIn: true, pausadoHastaMs: AHORA - 1 }]]),
      }),
    );
    expect(p[0]?.telefonos[0]?.estado).toBe("vinculado");
  });

  it("revocado, código vencido y código usado no aparecen", () => {
    const p = armarVinculosPanel(
      entrada({
        botLinks: [{ numeroE164: "+5491155551234", tenantId: "t-1", googleSub: "dueno-1", estado: "revocado" }],
        vincularCodes: [
          { numero: "+5491155559999", tenantId: "t-1", googleSub: "dueno-1", expiraEn: AHORA - 1, usado: false },
          { numero: "+5491155558888", tenantId: "t-1", googleSub: "dueno-1", expiraEn: AHORA + 600_000, usado: true },
        ],
      }),
    );
    const ana = p.find((x) => x.google_sub === "dueno-1");
    expect(ana?.telefonos).toEqual([]);
  });

  it("empleado solo se ve a sí mismo", () => {
    const p = armarVinculosPanel(entrada({ googleSub: "juan", esDueno: false }));
    expect(p.map((x) => x.google_sub)).toEqual(["juan"]);
  });

  it("no incluye personas ni vínculos de otro tenant ni el número completo", () => {
    const p = armarVinculosPanel(
      entrada({
        memberships: [
          { tenantId: "t-1", googleSub: "dueno-1", rol: "dueno", estado: "activo" },
          { tenantId: "t-2", googleSub: "otro", rol: "empleado", estado: "activo" },
        ],
        botLinks: [{ numeroE164: "+5491155559999", tenantId: "t-2", googleSub: "otro", estado: "verificado" }],
        vincularCodes: [{ numero: "+5491155559999", tenantId: "t-2", googleSub: "otro", expiraEn: AHORA + 600_000, usado: false }],
      }),
    );
    expect(p.map((x) => x.google_sub)).toEqual(["dueno-1"]);
    const texto = JSON.stringify(p);
    expect(texto).not.toContain("otro");
    expect(texto).not.toContain("+5491155559999");
  });
});

describe("DASH-S1 helpers de cliente", () => {
  it("cuenta regresiva mm:ss", () => {
    expect(formatearCuentaRegresiva(600_000)).toBe("10:00");
    expect(formatearCuentaRegresiva(599_000)).toBe("09:59");
    expect(formatearCuentaRegresiva(59_000)).toBe("00:59");
    expect(formatearCuentaRegresiva(1_000)).toBe("00:01");
    expect(formatearCuentaRegresiva(0)).toBe("00:00");
    expect(formatearCuentaRegresiva(-5)).toBe("00:00");
  });

  it("código vencido al llegar a 00:00", () => {
    expect(codigoVencido(1_000, 999)).toBe(false);
    expect(codigoVencido(1_000, 1_000)).toBe(true);
    expect(codigoVencido(1_000, 1_001)).toBe(true);
  });

  it("hayVinculados mira cualquier teléfono", () => {
    const vacia: PersonaVinculos = { google_sub: "x", nombre: "X", rol: "dueno", puede_usar_bot: true, opt_in: false, telefonos: [] };
    expect(hayVinculados([])).toBe(false);
    expect(hayVinculados([vacia])).toBe(false);
    expect(hayVinculados([{ ...vacia, telefonos: [{ numero_enmascarado: "+…1234", estado: "vinculado" }] }])).toBe(true);
  });

  it("contarVinculados suma vinculados y pausados, no pendientes", () => {
    const base: PersonaVinculos = { google_sub: "x", nombre: "X", rol: "dueno", puede_usar_bot: true, opt_in: false, telefonos: [] };
    expect(contarVinculados([])).toBe(0);
    expect(
      contarVinculados([
        { ...base, telefonos: [{ numero_enmascarado: "+…1111", estado: "pendiente", expira_en: "2026-10-17T10:00:00.000Z" }] },
        {
          ...base,
          google_sub: "y",
          telefonos: [
            { numero_enmascarado: "+…2222", estado: "vinculado" },
            { numero_enmascarado: "+…3333", estado: "pausado", pausado_hasta: "2026-10-20T12:00:00.000Z" },
          ],
        },
      ]),
    ).toBe(2);
  });

  it("textos de estado en TEXTO", () => {
    expect(etiquetaEstado({ numero_enmascarado: "+…1234", estado: "vinculado" })).toBe("Vinculado");
    expect(etiquetaEstado({ numero_enmascarado: "+…1234", estado: "pendiente" })).toBe("Pendiente de confirmar");
    const pausado = etiquetaEstado({ numero_enmascarado: "+…1234", estado: "pausado", pausado_hasta: "2026-10-20T12:00:00.000Z" });
    expect(pausado).toContain("Pausado hasta");
    expect(pausado).not.toBe("Pausado");
  });

  it("opt-in en texto", () => {
    expect(textoOptIn(true)).toBe("Recibe avisos");
    expect(textoOptIn(false)).toContain("ALTA");
  });
});

describe("DASH-S1 GET /api/whatsapp/vinculos", () => {
  it("sin sesión => 403", async () => {
    const r = await getVinculos(ctx("http://x/api/whatsapp/vinculos"));
    expect(r.status).toBe(403);
  });

  it("sesión sin membership en el tenant => 403", async () => {
    tenantConMiembros("t-1", "dueno-1");
    const plano = sesion("solo", "t-1");
    const r = await getVinculos(conSesion(plano));
    expect(r.status).toBe(403);
  });

  it("Dueño ve a todas las personas con es_dueno y ttl_min", async () => {
    tenantConMiembros("t-1", "dueno-1");
    const plano = sesion("dueno-1", "t-1");
    const r = await getVinculos(conSesion(plano));
    expect(r.status).toBe(200);
    const j = (await r.json()) as { tenant_id: string; es_dueno: boolean; ttl_min: number; personas: PersonaVinculos[] };
    expect(j.tenant_id).toBe("t-1");
    expect(j.es_dueno).toBe(true);
    expect(j.ttl_min).toBe(10);
    expect(j.personas.map((p) => p.google_sub).sort()).toEqual(["dueno-1", "juan"]);
  });

  it("Empleado solo se ve a sí mismo", async () => {
    tenantConMiembros("t-1", "dueno-1");
    const plano = sesion("juan", "t-1");
    const r = await getVinculos(conSesion(plano));
    const j = (await r.json()) as { es_dueno: boolean; personas: PersonaVinculos[] };
    expect(j.es_dueno).toBe(false);
    expect(j.personas.map((p) => p.google_sub)).toEqual(["juan"]);
  });

  it("tras generar el código, el teléfono aparece pendiente", async () => {
    tenantConMiembros("t-1", "dueno-1");
    const planoJuan = sesion("juan", "t-1");
    const rc = await postVincularCode(
      ctx("http://x/api/whatsapp/vincular-code", {
        method: "POST",
        headers: { cookie: `__Host-sesion=${planoJuan}` },
        body: { tenant_id: "t-1", numero: "11 5555-1234" },
      }),
    );
    expect(rc.status).toBe(201);
    const planoDueno = sesion("dueno-1", "t-1");
    const r = await getVinculos(conSesion(planoDueno));
    const j = (await r.json()) as { personas: PersonaVinculos[] };
    const juan = j.personas.find((p) => p.google_sub === "juan");
    expect(juan?.telefonos).toHaveLength(1);
    expect(juan?.telefonos[0]?.estado).toBe("pendiente");
    expect(juan?.telefonos[0]?.numero_enmascarado).toBe("+…1234");
    expect(juan?.telefonos[0]?.expira_en).toEqual(expect.any(String));
  });

  it("un botLink verificado aparece vinculado", async () => {
    tenantConMiembros("t-1", "dueno-1");
    control.botLinks.set("+5491155551234", { tenantId: "t-1", googleSub: "juan", estado: "verificado" });
    const plano = sesion("dueno-1", "t-1");
    const r = await getVinculos(conSesion(plano));
    const j = (await r.json()) as { personas: PersonaVinculos[] };
    const juan = j.personas.find((p) => p.google_sub === "juan");
    expect(juan?.telefonos).toEqual([{ numero_enmascarado: "+…1234", estado: "vinculado" }]);
  });

  it("la respuesta no trae el número completo ni codigoHash", async () => {
    tenantConMiembros("t-1", "dueno-1");
    control.botLinks.set("+5491155551234", { tenantId: "t-1", googleSub: "dueno-1", estado: "verificado" });
    const plano = sesion("dueno-1", "t-1");
    await postVincularCode(
      ctx("http://x/api/whatsapp/vincular-code", {
        method: "POST",
        headers: { cookie: `__Host-sesion=${plano}` },
        body: { tenant_id: "t-1", numero: "11 5555-4321" },
      }),
    );
    const r = await getVinculos(conSesion(plano));
    const texto = JSON.stringify(await r.json());
    expect(texto).toContain("+…1234");
    expect(texto).not.toContain("55551234");
    expect(texto).not.toContain("codigoHash");
  });
});
