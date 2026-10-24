import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { ctx } from "./helpers/ctx.js";
import { asegurarBasePrivada } from "./helpers/pg-privada.js";
import { control, resetStore, store } from "../src/lib/store.js";
import { POST as postAlertas } from "../src/pages/api/jobs/alertas-stock.js";
import { canalesEfectivos, resolver_destinatarios } from "../src/modules/alertas/stock-bajo.js";
import { limpiar_claves_alertas } from "../src/jobs/alertas-stock.js";
import { PLANTILLA_ALERTA_STOCK_BAJO } from "../src/modules/whatsapp/envio.js";
import { notificationPreferences } from "../src/db/schema-whatsapp.js";
import { getTenantDb } from "../src/lib/db.js";
import { cargarPersonasAlerta } from "../src/lib/repos/alerta-prefs.js";

const SECRETO = "secreto-alr-s3";

describe("ALR-S3 canal del encargado", () => {
  const waTos: string[] = [];

  beforeEach(() => {
    delete process.env.TENANT_MODE;
    delete process.env.DEFAULT_TENANT_ID;
    process.env.JOBS_SECRET = SECRETO;
    process.env.WHATSAPP_PHONE_NUMBER_ID = "phone-alr-s3";
    process.env.WHATSAPP_TOKEN = "token-alr-s3";
    process.env.WHATSAPP_PLANTILLAS_APROBADAS = JSON.stringify({ [PLANTILLA_ALERTA_STOCK_BAJO]: "tpl-alr-s3" });
    resetStore();
    limpiar_claves_alertas();
    waTos.length = 0;
    vi.stubGlobal("fetch", async (_url: string, init: { body?: string }) => {
      const body = JSON.parse(init.body ?? "{}") as { to?: string };
      if (body.to) waTos.push(body.to);
      return { ok: true, status: 200, json: async () => ({ messages: [{ id: "wamid-alr-s3" }] }) };
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.JOBS_SECRET;
    delete process.env.WHATSAPP_PHONE_NUMBER_ID;
    delete process.env.WHATSAPP_TOKEN;
    delete process.env.WHATSAPP_PLANTILLAS_APROBADAS;
    resetStore();
    limpiar_claves_alertas();
  });

  function persona(args: {
    tenantId: string;
    sub: string;
    rol: "dueno" | "empleado";
    email: string;
    numero: string | null;
    optIn: boolean;
    canal: "whatsapp" | "email" | "ambos";
    pausaHastaMs: number | null;
  }): void {
    control.users.set(args.sub, { googleSub: args.sub, email: args.email, emailVerificado: true });
    control.memberships.set(`m-${args.tenantId}-${args.sub}`, {
      id: `m-${args.tenantId}-${args.sub}`,
      tenantId: args.tenantId,
      googleSub: args.sub,
      rol: args.rol,
      permisos: [],
      estado: "activo",
    });
    control.waPrefs.set(`${args.tenantId}:${args.sub}`, {
      optIn: args.optIn,
      avisoHora: "08:00",
      pausadoHastaMs: args.pausaHastaMs,
      canal: args.canal,
    });
    if (args.numero) {
      control.botLinks.set(args.numero, { tenantId: args.tenantId, googleSub: args.sub, estado: "verificado" });
    }
  }

  function comercio(tenantId: string, subDueno: string): void {
    control.tenants.set(tenantId, {
      id: tenantId,
      nombreComercio: "Kiosco",
      slug: tenantId,
      estado: "activo",
      plan: "basico",
      moneda: "ARS",
      ownerGoogleSub: subDueno,
      esDemo: false,
    });
    store.stock.set("demo-sku-1", 0);
  }

  async function correr(): Promise<void> {
    const r = (await postAlertas(
      ctx("http://x/api/jobs/alertas-stock?fecha=2026-10-24&hora=08:00", {
        headers: { "X-Job-Secret": SECRETO },
      }),
    )) as Response;
    expect(r.status).toBe(200);
  }

  function emails(): string[] {
    return [...store.emailOutbox.values()].map((e) => e.destinatario);
  }

  it("sin opt-in de WhatsApp el canal elegido whatsapp igual sale solo por email", () => {
    const enc = {
      rol: "encargado" as const,
      googleSub: "enc",
      optInWa: false,
      email: "enc@kiosco.test",
      canal: "whatsapp" as const,
      avisoHora: "08:00",
      pausaHastaMs: null,
    };
    expect(canalesEfectivos(enc)).toEqual(["email"]);
    const r = resolver_destinatarios({
      duenos: [
        {
          rol: "dueno",
          googleSub: "due",
          optInWa: false,
          email: "due@kiosco.test",
          avisoHora: "08:00",
          pausaHastaMs: null,
        },
      ],
      encargados: [enc],
      ahoraMs: 1_000,
      modo: "matutino",
      horaTick: "08:00",
    });
    expect(r.find((d) => d.googleSub === "due")?.canales).toEqual(["email"]);
    expect(r.find((d) => d.googleSub === "enc")?.canales).toEqual(["email"]);
  });

  it("el job manda el email del encargado y el WhatsApp del dueño, no el número del comercio ajeno", async () => {
    const tenant = "t-alr-s3-a";
    persona({
      tenantId: tenant,
      sub: "enc-a",
      rol: "empleado",
      email: "enc-a@kiosco.test",
      numero: "+5491100000002",
      optIn: false,
      canal: "whatsapp",
      pausaHastaMs: null,
    });
    persona({
      tenantId: tenant,
      sub: "due-a",
      rol: "dueno",
      email: "due-a@kiosco.test",
      numero: "+5491100000001",
      optIn: true,
      canal: "ambos",
      pausaHastaMs: null,
    });
    comercio(tenant, "due-a");
    await correr();
    expect(emails()).toContain("enc-a@kiosco.test");
    expect(emails()).toContain("due-a@kiosco.test");
    expect(waTos).toEqual(["+5491100000001"]);
  });

  it("canal pausado no recibe y el dueño activo sigue en la lista", async () => {
    const tenant = "t-alr-s3-pausa";
    const pausa = Date.now() + 60_000;
    persona({
      tenantId: tenant,
      sub: "enc-p",
      rol: "empleado",
      email: "enc-p@kiosco.test",
      numero: "+5491100000012",
      optIn: true,
      canal: "ambos",
      pausaHastaMs: pausa,
    });
    persona({
      tenantId: tenant,
      sub: "due-p",
      rol: "dueno",
      email: "due-p@kiosco.test",
      numero: "+5491100000011",
      optIn: true,
      canal: "ambos",
      pausaHastaMs: null,
    });
    comercio(tenant, "due-p");
    await correr();
    expect(emails()).toContain("due-p@kiosco.test");
    expect(emails()).not.toContain("enc-p@kiosco.test");
    expect(waTos).toContain("+5491100000011");
    expect(waTos).not.toContain("+5491100000012");
  });

  it("el número y el mail de otro tenant no entran en el aviso", async () => {
    const a = "t-alr-s3-a2";
    const b = "t-alr-s3-b2";
    persona({
      tenantId: a,
      sub: "due-a2",
      rol: "dueno",
      email: "due-a2@kiosco.test",
      numero: "+5491100000021",
      optIn: true,
      canal: "email",
      pausaHastaMs: null,
    });
    persona({
      tenantId: a,
      sub: "enc-compartido",
      rol: "empleado",
      email: "enc-a2@kiosco.test",
      numero: null,
      optIn: true,
      canal: "whatsapp",
      pausaHastaMs: null,
    });
    persona({
      tenantId: b,
      sub: "enc-compartido",
      rol: "empleado",
      email: "enc-b2@otro.test",
      numero: "+5491100000099",
      optIn: true,
      canal: "whatsapp",
      pausaHastaMs: null,
    });
    persona({
      tenantId: b,
      sub: "due-b2",
      rol: "dueno",
      email: "due-b2@otro.test",
      numero: "+5491100000088",
      optIn: true,
      canal: "ambos",
      pausaHastaMs: null,
    });
    control.tenants.set(b, {
      id: b,
      nombreComercio: "Otro",
      slug: b,
      estado: "activo",
      plan: "basico",
      moneda: "ARS",
      ownerGoogleSub: "due-b2",
      esDemo: false,
    });
    comercio(a, "due-a2");
    await correr();
    expect(emails()).toContain("due-a2@kiosco.test");
    expect(emails()).not.toContain("due-b2@otro.test");
    expect(emails()).not.toContain("enc-b2@otro.test");
    expect(waTos).toEqual(["+5491100000021"]);
  });
});

const hayPG = Boolean(process.env.PG_TEST_URL_A);

describe.skipIf(!hayPG)("ALR-S3 notification_preferences manda el canal", () => {
  let url = "";
  const tenantA = randomUUID();
  const tenantB = randomUUID();
  const pausa = "enc-pausa-db";
  const mail = "enc-mail-db";
  const dueno = "due-db";

  beforeAll(async () => {
    url = await asegurarBasePrivada("alr_s3_canal", process.env.PG_TEST_URL_A ?? "");
  }, 180_000);

  beforeEach(() => {
    resetStore();
    delete process.env.TENANT_MODE;
    process.env.TENANT_DATABASE_URL = url;
  });

  afterAll(async () => {
    if (!url) return;
    process.env.TENANT_DATABASE_URL = url;
    delete process.env.TENANT_MODE;
    const db = getTenantDb(tenantA);
    await db.delete(notificationPreferences).where(eq(notificationPreferences.tenantId, tenantA));
    await db.delete(notificationPreferences).where(eq(notificationPreferences.tenantId, tenantB));
    delete process.env.TENANT_DATABASE_URL;
  });

  it("la pausa y el opt-in salen de la fila del comercio, no de la memoria ni del otro tenant", async () => {
    const db = getTenantDb(tenantA);
    await db.delete(notificationPreferences).where(eq(notificationPreferences.tenantId, tenantA));
    await db.delete(notificationPreferences).where(eq(notificationPreferences.tenantId, tenantB));
    await db.insert(notificationPreferences).values([
      {
        tenantId: tenantA,
        googleSub: pausa,
        canal: "ambos",
        optIn: true,
        avisoHora: "08:00",
        pausadoHasta: new Date(Date.now() + 3_600_000),
      },
      {
        tenantId: tenantA,
        googleSub: mail,
        canal: "whatsapp",
        optIn: false,
        avisoHora: "08:00",
        pausadoHasta: null,
      },
      {
        tenantId: tenantB,
        googleSub: mail,
        canal: "ambos",
        optIn: true,
        avisoHora: "08:00",
        pausadoHasta: null,
      },
    ]);
    control.waPrefs.set(`${tenantA}:${pausa}`, { optIn: true, avisoHora: "08:00", pausadoHastaMs: null, canal: "ambos" });
    control.waPrefs.set(`${tenantA}:${mail}`, { optIn: true, avisoHora: "08:00", pausadoHastaMs: null, canal: "whatsapp" });
    control.users.set(mail, { googleSub: mail, email: "mail-db@kiosco.test", emailVerificado: true });
    control.users.set(dueno, { googleSub: dueno, email: "due-db@kiosco.test", emailVerificado: true });
    for (const [sub, rol] of [
      [dueno, "dueno"],
      [pausa, "empleado"],
      [mail, "empleado"],
    ] as const) {
      control.memberships.set(`m-${sub}`, {
        id: `m-${sub}`,
        tenantId: tenantA,
        googleSub: sub,
        rol,
        permisos: [],
        estado: "activo",
      });
    }
    const personas = await cargarPersonasAlerta(tenantA);
    const r = resolver_destinatarios({
      duenos: personas.duenos,
      encargados: personas.encargados,
      ahoraMs: Date.now(),
      modo: "matutino",
      horaTick: "08:00",
    });
    expect(r.some((d) => d.googleSub === pausa)).toBe(false);
    expect(r.find((d) => d.googleSub === mail)?.canales).toEqual(["email"]);
    expect(r.find((d) => d.googleSub === dueno)?.canales).toEqual(["email"]);
  });
});
