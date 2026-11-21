import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deliveryStatus, emailOutbox } from "../src/db/schema-email.js";
import { getTenantDb } from "../src/lib/db.js";
import { control, resetStore } from "../src/lib/store.js";
import { gateJob } from "../src/lib/tenant-context.js";
import { conTenant } from "../src/lib/tenant-mode.js";
import { ejecutarEnvioEmails } from "../src/jobs/enviar-emails.js";
import { duenoAviso, ejecutarAvisosWhatsapp, type DepsAvisosWa, type DuenoAviso } from "../src/jobs/enviar-avisos-whatsapp.js";
import { aviso_wa } from "../src/modules/whatsapp/avisos-cuenta.js";
import { enviar_whatsapp, type FetchEnvio, type ResultadoEnvio } from "../src/modules/whatsapp/cliente-cloud.js";
import type { PayloadPlantilla } from "../src/modules/whatsapp/envio.js";
import type { EmailEnvio, EmailProvider, EnvioResultado } from "../src/modules/email/proveedor.js";
import { ctx } from "./helpers/ctx.js";
import { POST } from "../src/pages/api/jobs/enviar-avisos-whatsapp.js";

// Avisos de cuenta por WhatsApp: plantillas de Meta con el reclamo de P10-92.

const hayPG = Boolean(process.env.PG_TEST_URL_A);
const ENV_KEYS = ["TENANT_MODE", "TENANT_DATABASE_URL", "CONTROL_DATABASE_URL", "JOBS_SECRET"] as const;
const CIERRE = "2026-11-21T07:00:00.000Z";

describe("avisos de cuenta: plantilla de Meta", () => {
  it("retención: type template es_AR con comercio, cierre y borrado (cierre + 90 días)", () => {
    const a = aviso_wa(
      { plantilla: "retencion_aviso_v1", idempotencyKey: `retencion-aviso:t1:${CIERRE}`, texto: "texto armado" },
      "Almacén\nDon Pepe",
    );
    expect(a?.plantilla).toBe("aviso_borrado_datos");
    expect(a?.payload).toEqual({
      type: "template",
      template: {
        name: "aviso_borrado_datos",
        language: { code: "es_AR" },
        components: [
          {
            type: "body",
            parameters: [
              { type: "text", text: "Almacén Don Pepe" },
              { type: "text", text: "21/11/2026" },
              { type: "text", text: "19/02/2027" },
            ],
          },
        ],
      },
    });
  });

  it("cierre: toma las vars que #379 guarda como JSON; sin fechas no arma nada", () => {
    const texto = JSON.stringify({ comercio: "Kiosco Sol", cerrada_el: "21/11/2026", borrado_desde: "19/02/2027" });
    const a = aviso_wa({ plantilla: "cuenta_cerrada_v1", idempotencyKey: "cuenta-cerrada:t1:x", texto }, "otro");
    expect(a?.plantilla).toBe("aviso_cuenta_cerrada");
    expect(a?.payload.template.components[0]?.parameters.map((p) => p.text)).toEqual(["Kiosco Sol", "21/11/2026", "19/02/2027"]);
    // WA-AVISOS-1: #379 guarda fechaAR (AAAA-MM-DD); la plantilla muestra DD/MM/AAAA.
    const iso = JSON.stringify({ cerrada_el: "2026-11-21", borrado_desde: "2027-02-19" });
    const b = aviso_wa({ plantilla: "cuenta_cerrada_v1", idempotencyKey: "k", texto: iso }, "Kiosco Sol");
    expect(b?.payload.template.components[0]?.parameters.map((p) => p.text)).toEqual(["Kiosco Sol", "21/11/2026", "19/02/2027"]);
    expect(aviso_wa({ plantilla: "cuenta_cerrada_v1", idempotencyKey: "k", texto: "cuenta_cerrada_v1" }, "x")).toBeNull();
    expect(aviso_wa({ plantilla: "retencion_aviso_v1", idempotencyKey: "retencion-aviso:t1:", texto: "" }, "x")).toBeNull();
    expect(aviso_wa({ plantilla: "resumen_cierre_v1", idempotencyKey: "k", texto: "" }, "x")).toBeNull();
  });

  it("cliente Cloud API manda el body con type template al número", async () => {
    const llamadas: string[] = [];
    const fetchFn: FetchEnvio = async (_url, init) => {
      llamadas.push(init.body);
      return { ok: true, status: 200, json: async () => ({ messages: [{ id: "wamid.X" }] }) };
    };
    const a = aviso_wa({ plantilla: "retencion_aviso_v1", idempotencyKey: `retencion-aviso:t1:${CIERRE}`, texto: "" }, "K")!;
    const r = await enviar_whatsapp({ phoneNumberId: "1", token: "t", toE164: "+5491155551234", payload: a.payload, fetchFn });
    expect(r).toEqual({ ok: true, wamid: "wamid.X" });
    expect(JSON.parse(llamadas[0]!)).toMatchObject({ messaging_product: "whatsapp", to: "+5491155551234", type: "template", template: { name: "aviso_borrado_datos" } });
    expect(JSON.parse(llamadas[0]!)).not.toHaveProperty("text");
  });
});

describe("avisos de cuenta: comercios cerrados", () => {
  afterEach(() => {
    delete process.env.TENANT_MODE;
    delete process.env.JOBS_SECRET;
    resetStore();
  });

  it("el fan-out de avisos incluye comercios en baja; los otros jobs no", () => {
    process.env.TENANT_MODE = "multi";
    process.env.JOBS_SECRET = "s";
    for (const [id, estado] of [["t-activo", "activo"], ["t-baja", "baja"], ["t-prep", "preparando"]] as const) {
      control.tenants.set(id, { id, nombreComercio: id, slug: id, estado, plan: "base", moneda: "ARS", ownerGoogleSub: "d", esDemo: false });
    }
    const req = (h: Record<string, string> = {}) => new Request("http://test/api/jobs/enviar-avisos-whatsapp", { headers: { "X-Job-Secret": "s", ...h } });
    expect(gateJob(req())).toEqual({ ok: true, tenantIds: ["t-activo"] });
    expect(gateJob(req(), true)).toEqual({ ok: true, tenantIds: ["t-activo", "t-baja"] });
    expect(gateJob(req({ "X-Tenant-Id": "t-baja" }), true)).toEqual({ ok: true, tenantId: "t-baja" });
  });

  it("dueño: número verificado del comercio cerrado; BAJA explícita lo suprime", async () => {
    control.tenants.set("t1", { id: "t1", nombreComercio: "Kiosco", slug: "k", estado: "baja", plan: "base", moneda: "ARS", ownerGoogleSub: "dueno", esDemo: false });
    control.botLinks.set("+5491100000001", { tenantId: "t1", googleSub: "empleado", estado: "verificado" });
    control.botLinks.set("+5491100000002", { tenantId: "t1", googleSub: "dueno", estado: "verificado" });
    expect(await duenoAviso("t1")).toEqual({ comercio: "Kiosco", numero: "+5491100000002", baja: false });
    control.waPrefs.set("t1:dueno", { optIn: false, avisoHora: "08:00", pausadoHastaMs: null, optInAtMs: 1 });
    expect((await duenoAviso("t1")).baja).toBe(true);
  });

  it("ruta: sin X-Job-Secret 403; sin credenciales de WhatsApp no toca la cola", async () => {
    const prev = { t: process.env.WHATSAPP_TOKEN, p: process.env.WHATSAPP_PHONE_NUMBER_ID };
    process.env.JOBS_SECRET = "s";
    delete process.env.WHATSAPP_TOKEN;
    delete process.env.WHATSAPP_PHONE_NUMBER_ID;
    try {
      const llamar = (h: Record<string, string>) => POST(ctx("/api/jobs/enviar-avisos-whatsapp", { method: "POST", headers: h })) as Promise<Response>;
      expect((await llamar({})).status).toBe(403);
      const r = await llamar({ "X-Job-Secret": "s" });
      expect(r.status).toBe(200);
      expect(await r.json()).toEqual({ omitido: "sin_credenciales" });
    } finally {
      if (prev.t !== undefined) process.env.WHATSAPP_TOKEN = prev.t;
      if (prev.p !== undefined) process.env.WHATSAPP_PHONE_NUMBER_ID = prev.p;
    }
  });
});

class WaGuion {
  readonly enviados: Array<{ to: string; payload: PayloadPlantilla }> = [];
  constructor(private readonly guion: ResultadoEnvio[] = []) {}
  enviar = async (to: string, payload: PayloadPlantilla): Promise<ResultadoEnvio> => {
    this.enviados.push({ to, payload });
    return this.guion.shift() ?? { ok: true, wamid: `wamid.${this.enviados.length}` };
  };
}

describe.skipIf(!hayPG)("avisos de cuenta por WhatsApp en Postgres", () => {
  const tenantA = randomUUID();
  const tenantB = randomUUID();
  const ids: string[] = [];
  const usados = new Set<string>([tenantA, tenantB]);
  const snap: Partial<Record<string, string | undefined>> = {};

  beforeEach(() => {
    for (const k of ENV_KEYS) snap[k] = process.env[k];
    process.env.TENANT_MODE = "shared";
    process.env.TENANT_DATABASE_URL = process.env.PG_TEST_URL_A;
    delete process.env.CONTROL_DATABASE_URL;
    resetStore();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    for (const k of ENV_KEYS) {
      const v = snap[k];
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  afterAll(async () => {
    if (!hayPG || ids.length === 0) return;
    process.env.TENANT_MODE = "shared";
    process.env.TENANT_DATABASE_URL = process.env.PG_TEST_URL_A;
    for (const t of usados) {
      await conTenant(t, async () => {
        const db = getTenantDb();
        await db.delete(deliveryStatus).where(inArray(deliveryStatus.outboxId, ids));
        await db.delete(emailOutbox).where(inArray(emailOutbox.id, ids));
      });
    }
    resetStore();
  });

  async function encolar(tenantId: string, plantilla = "retencion_aviso_v1"): Promise<string> {
    const id = randomUUID();
    ids.push(id);
    usados.add(tenantId);
    await conTenant(tenantId, () =>
      getTenantDb()
        .insert(emailOutbox)
        .values({
          id,
          tenantId,
          categoria: "retencion",
          plantilla,
          destinatario: "dueno@ejemplo.com",
          asunto: "Asunto privado",
          html: "<p>hola</p>",
          texto: "hola",
          // WA-AVISOS-1: Clave única por fila (tenant + idempotency_key); la fecha sigue siendo ISO.
          idempotencyKey: `retencion-aviso:${tenantId}:${new Date(Date.parse(CIERRE) + ids.length * 1000).toISOString()}`,
        }),
    );
    return id;
  }

  async function fila(tenantId: string, id: string) {
    const [f] = await conTenant(tenantId, () => getTenantDb().select().from(emailOutbox).where(eq(emailOutbox.id, id)));
    return f!;
  }

  function deps(wa: WaGuion, dueno: Partial<DuenoAviso> = {}, aprobada = true): DepsAvisosWa {
    return {
      dueno: async () => ({ comercio: "Kiosco", numero: "+5491155551234", baja: false, ...dueno }),
      aprobada: () => aprobada,
      enviar: wa.enviar,
    };
  }

  const correr = (t: string, d: DepsAvisosWa, ahora = new Date()) => conTenant(t, () => ejecutarAvisosWhatsapp(getTenantDb(), d, ahora, 500));

  it("manda una sola vez, solo lo del comercio, con wamid; el job de mails no lo toca", async () => {
    const a = await encolar(tenantA);
    const b = await encolar(tenantB);
    const mails: EmailEnvio[] = [];
    const prov: EmailProvider = { send: async (e): Promise<EnvioResultado> => (mails.push(e), { ok: true, providerMessageId: "m" }) };
    await conTenant(tenantA, () => ejecutarEnvioEmails(getTenantDb(), prov, new Date(), 500));
    expect(mails.some((m) => m.plantilla === "retencion_aviso_v1")).toBe(false);
    expect(await fila(tenantA, a)).toMatchObject({ estado: "pendiente", intentos: 0 });

    const log = vi.spyOn(console, "log");
    const wa = new WaGuion();
    const r = await correr(tenantA, deps(wa));
    expect(r.enviados).toBe(1);
    expect(wa.enviados[0]!.payload.type).toBe("template");
    expect(await fila(tenantA, a)).toMatchObject({ estado: "enviado", intentos: 1, providerMessageId: "wamid.1" });
    expect(await fila(tenantB, b)).toMatchObject({ estado: "pendiente", intentos: 0 });
    const wa2 = new WaGuion();
    await Promise.all([correr(tenantA, deps(wa2)), correr(tenantA, deps(wa2))]);
    expect(wa2.enviados).toHaveLength(0);
    expect(JSON.stringify(log.mock.calls)).not.toContain("5491155551234");
  });

  it("dos corridas a la vez mandan el aviso una sola vez", async () => {
    const t = randomUUID();
    const id = await encolar(t);
    const wa = new WaGuion();
    await Promise.all([correr(t, deps(wa)), correr(t, deps(wa))]);
    expect(wa.enviados).toHaveLength(1);
    expect(await fila(t, id)).toMatchObject({ estado: "enviado", intentos: 1 });
  });

  it("red reintenta con backoff; rechazo de Meta queda fallido", async () => {
    const t = randomUUID();
    const id = await encolar(t);
    const ahora = new Date();
    expect((await correr(t, deps(new WaGuion([{ ok: false, codigo: "red" }])), ahora)).reintentar).toBe(1);
    expect(await fila(t, id)).toMatchObject({ estado: "reintentar", intentos: 1 });
    expect((await correr(t, deps(new WaGuion()), new Date(ahora.getTime() + 10_000))).esperando).toBe(1);
    expect((await correr(t, deps(new WaGuion()), new Date(ahora.getTime() + 2 * 60_000))).enviados).toBe(1);
    expect(await fila(t, id)).toMatchObject({ estado: "enviado", intentos: 2 });

    const p = await encolar(t);
    expect((await correr(t, deps(new WaGuion([{ ok: false, codigo: "rechazado" }])))).fallidos).toBe(1);
    expect(await fila(t, p)).toMatchObject({ estado: "fallido", intentos: 1 });
    const ev = await conTenant(t, () => getTenantDb().select({ e: deliveryStatus.evento }).from(deliveryStatus).where(eq(deliveryStatus.outboxId, p)));
    expect(ev.map((e) => e.e).sort()).toEqual(["fallo_rechazado", "intento"]);
  });

  it("sin número queda sin_whatsapp, con BAJA suprimido, sin plantilla aprobada no se toca", async () => {
    const t = randomUUID();
    const sinNumero = await encolar(t);
    const wa = new WaGuion();
    expect((await correr(t, deps(wa, { numero: null }))).sinWhatsapp).toBe(1);
    expect(await fila(t, sinNumero)).toMatchObject({ estado: "sin_whatsapp" });

    const baja = await encolar(t);
    expect((await correr(t, deps(wa, { baja: true }))).suprimidos).toBe(1);
    expect(await fila(t, baja)).toMatchObject({ estado: "suprimido" });

    const espera = await encolar(t);
    expect((await correr(t, deps(wa, {}, false))).sinPlantilla).toBe(1);
    expect(await fila(t, espera)).toMatchObject({ estado: "pendiente", intentos: 0 });
    expect(wa.enviados).toHaveLength(0);
  });

  it("cierre de cuenta sin vars queda fallido sin llamar a Meta", async () => {
    const t = randomUUID();
    const id = await encolar(t, "cuenta_cerrada_v1");
    const wa = new WaGuion();
    expect((await correr(t, deps(wa))).fallidos).toBe(1);
    expect(await fila(t, id)).toMatchObject({ estado: "fallido" });
    expect(wa.enviados).toHaveLength(0);
  });
});
