import { readFileSync } from "node:fs";
import { ctx } from "./helpers/ctx.js";
import { describe, expect, it, afterEach, beforeEach, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { gateJob } from "../src/lib/tenant-context.js";
import { control, resetStore, store } from "../src/lib/store.js";
import { conTenant } from "../src/lib/tenant-mode.js";
import { getTenantDb } from "../src/lib/db.js";
import { fechaAR, sumarDiasAR } from "../src/lib/fecha-ar.js";
import { clave_aviso_wa } from "../src/modules/whatsapp/aviso-matutino.js";
import { closingSummaries } from "../src/db/schema-caja.js";
import { serviceAccounts, utilityBills } from "../src/db/schema-servicios.js";
import { paymentOrders, paymentOrderEvents } from "../src/db/schema-pagos.js";
import { POST as postAviso } from "../src/pages/api/jobs/whatsapp-aviso.js";
import { POST as postSemanal } from "../src/pages/api/jobs/whatsapp-semanal.js";
import { POST as postCierreJob } from "../src/pages/api/jobs/cierre-medianoche.js";
import { POST as postVencLotes } from "../src/pages/api/jobs/vencimientos-lotes.js";
import { POST as postVencServ } from "../src/pages/api/jobs/vencimientos-servicios.js";
import { POST as postWaCierre } from "../src/pages/api/jobs/whatsapp-cierre.js";
import { POST as postLots } from "../src/pages/api/lots.js";

const SECRETO = "secreto-pers2-s3";

function peticion(encabezados: Record<string, string>): Request {
  return new Request("http://test/api/jobs/cierre-medianoche", { headers: encabezados });
}

function fijarTenant(id: string, estado: string) {
  control.tenants.set(id, {
    id,
    nombreComercio: id,
    slug: id,
    estado,
    plan: "base",
    moneda: "ARS",
    ownerGoogleSub: "dueño-1",
    esDemo: false,
  });
}

function modoMulti() {
  process.env.TENANT_MODE = "multi";
  process.env.JOBS_SECRET = SECRETO;
}

function modoSingle() {
  delete process.env.TENANT_MODE;
  process.env.JOBS_SECRET = SECRETO;
}

afterEach(() => {
  delete process.env.TENANT_MODE;
  delete process.env.JOBS_SECRET;
  delete process.env.DEFAULT_TENANT_ID;
  resetStore();
  conTenant("tenant-a", () => resetStore());
  conTenant("tenant-b", () => resetStore());
});

describe("PERS2-S3 gateJob", () => {
  it("multi con secreto válido sin X-Tenant-Id responde 403 E5", async () => {
    modoMulti();
    fijarTenant("tenant-a", "activo");
    const r = gateJob(peticion({ "X-Job-Secret": SECRETO }));
    expect(r).not.toBeNull();
    expect(r!.ok).toBe(false);
    if (!r!.ok) {
      expect(r!.respuesta.status).toBe(403);
      expect(await r!.respuesta.json()).toEqual({ error: "No tenés permiso para ver este comercio." });
    }
  });

  it("multi con tenant desconocido responde 403 E5", async () => {
    modoMulti();
    fijarTenant("tenant-a", "activo");
    const r = gateJob(peticion({ "X-Job-Secret": SECRETO, "X-Tenant-Id": "fantasma" }));
    expect(r).not.toBeNull();
    expect(r!.ok).toBe(false);
    if (!r!.ok) {
      expect(r!.respuesta.status).toBe(403);
      expect(await r!.respuesta.json()).toEqual({ error: "No tenés permiso para ver este comercio." });
    }
  });

  it("multi con tenant activo deja pasar con ese tenant", () => {
    modoMulti();
    fijarTenant("tenant-a", "activo");
    const r = gateJob(peticion({ "X-Job-Secret": SECRETO, "X-Tenant-Id": "tenant-a" }));
    expect(r).toEqual({ ok: true, tenantId: "tenant-a" });
  });

  it("multi con tenant suspendido deja pasar con ese tenant", () => {
    modoMulti();
    fijarTenant("tenant-a", "suspendido");
    const r = gateJob(peticion({ "X-Job-Secret": SECRETO, "X-Tenant-Id": "tenant-a" }));
    expect(r).toEqual({ ok: true, tenantId: "tenant-a" });
  });

  it("secreto inválido no pasa por el gate de jobs", () => {
    modoMulti();
    fijarTenant("tenant-a", "activo");
    expect(gateJob(peticion({ "X-Job-Secret": "otro" }))).toBeNull();
    expect(gateJob(peticion({}))).toBeNull();
  });

  it("single con secreto válido corre como tenant por defecto", () => {
    modoSingle();
    const r = gateJob(peticion({ "X-Job-Secret": SECRETO }));
    expect(r).toEqual({ ok: true, tenantId: "slice0" });
  });
});

const RUTAS_JOBS_SIN_STORE = [
  "src/pages/api/jobs/whatsapp-aviso.ts",
  "src/pages/api/jobs/vencimientos-lotes.ts",
  "src/pages/api/jobs/cierre-medianoche.ts",
  "src/pages/api/jobs/whatsapp-semanal.ts",
  "src/pages/api/jobs/vencimientos-servicios.ts",
  "src/pages/api/jobs/whatsapp-cierre.ts",
];

function importaStoreRuntimeJobs(ruta: string): boolean {
  const texto = readFileSync(ruta, "utf8");
  return texto.split("\n").some((linea) => {
    if (!/lib\/store/.test(linea)) return false;
    if (/^\s*import\s+type\b/.test(linea)) return false;
    if (/^\s*import\s*\{\s*control\s*\}\s*from/.test(linea)) return false;
    return true;
  });
}

describe("PERS2-S18/S19 AT13: jobs sin store (ADR-0059)", () => {
  it("ninguno de los 6 jobs importa el binding store en runtime (import type y control se permiten)", () => {
    const mal = RUTAS_JOBS_SIN_STORE.filter(importaStoreRuntimeJobs);
    expect(mal).toEqual([]);
  });
});

function modoSingleJobs() {
  delete process.env.TENANT_MODE;
  delete process.env.TENANT_DATABASE_URL;
  delete process.env["TENANT_DATABASE_URL_tenant-a"];
  delete process.env["TENANT_DATABASE_URL_tenant-b"];
  process.env.JOBS_SECRET = SECRETO;
  delete process.env.WHATSAPP_PHONE_NUMBER_ID;
  delete process.env.WHATSAPP_TOKEN;
}

function reqJob(url: string, body?: unknown): Request {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Job-Secret": SECRETO },
    body: body ? JSON.stringify(body) : null,
  });
}

let comercioN = 0;
function comercioWa(optIn: boolean): { tenantId: string; numero: string; sub: string } {
  comercioN++;
  const tenantId = `t-job-${comercioN}`;
  const sub = `dueno-job-${comercioN}`;
  const numero = `+54911000010${String(comercioN).padStart(2, "0")}`;
  control.tenants.set(tenantId, {
    id: tenantId,
    nombreComercio: `Kiosco ${comercioN}`,
    slug: `kiosco-${comercioN}`,
    estado: "activo",
    plan: "basico",
    moneda: "ARS",
    ownerGoogleSub: sub,
    esDemo: false,
  });
  control.users.set(sub, { googleSub: sub, email: `${sub}@x.com`, emailVerificado: true });
  control.memberships.set(`m-job-${comercioN}`, { id: `m-job-${comercioN}`, tenantId, googleSub: sub, rol: "dueno", permisos: [], estado: "activo" });
  control.botLinks.set(numero, { tenantId, googleSub: sub, estado: "verificado" });
  control.waPrefs.set(`${tenantId}:${sub}`, { optIn, avisoHora: "08:00", pausadoHastaMs: null });
  return { tenantId, numero, sub };
}

describe("PERS2-S18 single sin DB: avisos y cierre como hoy", () => {
  beforeEach(() => {
    modoSingleJobs();
    resetStore();
  });

  it("aviso sin opt-in se omite y con alerta sin credenciales falla sin marcar", async () => {
    const sinOpt = comercioWa(false);
    const r1 = (await postAviso({ request: reqJob("http://x/api/jobs/whatsapp-aviso") } as never)) as Response;
    expect(r1.status).toBe(200);
    const res1 = (await r1.json()) as { resultados: Array<{ tenant_id: string; estado: string }> };
    expect(res1.resultados.find((x) => x.tenant_id === sinOpt.tenantId)?.estado).toBe("omitido_optout");

    const conOpt = comercioWa(true);
    const r2 = (await postAviso({ request: reqJob("http://x/api/jobs/whatsapp-aviso") } as never)) as Response;
    const res2 = (await r2.json()) as { resultados: Array<{ tenant_id: string; estado: string }> };
    expect(res2.resultados.find((x) => x.tenant_id === conOpt.tenantId)?.estado).toBe("fallo");
    expect(store.waEnviados.size).toBe(0);
  });

  it("aviso con clave ya enviada no se repite en el día", async () => {
    const { tenantId } = comercioWa(true);
    store.waEnviados.add(clave_aviso_wa(tenantId, fechaAR(new Date())));
    const r = (await postAviso({ request: reqJob("http://x/api/jobs/whatsapp-aviso") } as never)) as Response;
    const j = (await r.json()) as { resultados: Array<{ tenant_id: string; estado: string }> };
    expect(j.resultados.find((x) => x.tenant_id === tenantId)?.estado).toBe("omitido_ya_enviado");
  });

  it("cierre de medianoche: 201 automática con aviso y segundo disparo 409", async () => {
    const r1 = (await postCierreJob({ request: reqJob("http://x/api/jobs/cierre-medianoche") } as never)) as Response;
    expect(r1.status).toBe(201);
    const j1 = (await r1.json()) as Record<string, unknown>;
    expect(j1["close_type"]).toBe("automatica");
    expect(String(j1["fecha_jornada"])).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect((j1["wa"] as { estado: string }).estado).toBe("enviado");

    const r2 = (await postCierreJob({ request: reqJob("http://x/api/jobs/cierre-medianoche") } as never)) as Response;
    expect(r2.status).toBe(409);
    const j2 = (await r2.json()) as Record<string, unknown>;
    expect((j2["wa"] as { estado: string }).estado).toBe("duplicado");
    expect(j2["fecha_jornada"]).toBe(j1["fecha_jornada"]);
  });

  it("cierre con turno en disputa es 422 sin cerrar ni avisar", async () => {
    store.turnos.set("t1", {
      id: "t1",
      fechaJornada: "2026-10-10",
      turno: "manana",
      entregadoPor: "juan",
      esperadoCentavos: 0n,
      estado: "en_disputa",
    });
    const r = (await postCierreJob({ request: reqJob("http://x/api/jobs/cierre-medianoche") } as never)) as Response;
    expect(r.status).toBe(422);
    expect(store.cierres.size).toBe(0);
    expect(store.waEnviados.size).toBe(0);
  });

  it("semanal sale por WA+email con el mismo cálculo", async () => {
    const { tenantId } = comercioWa(true);
    const r = (await postSemanal({ request: reqJob("http://x/api/jobs/whatsapp-semanal") } as never)) as Response;
    expect(r.status).toBe(200);
    const j = (await r.json()) as { resultados: Array<{ tenant_id: string; canales: Array<{ canal: string; estado: string }> }> };
    const mio = j.resultados.find((x) => x.tenant_id === tenantId);
    expect(mio?.canales.find((c) => c.canal === "wa")?.estado).toBe("omitido_pausa");
    expect(mio?.canales.find((c) => c.canal === "email")?.estado).toBe("enviado");
    expect(store.emailOutbox.size).toBe(1);
  });

  it("whatsapp-cierre valida cuerpo, comercio y cierre, y sin credenciales no marca", async () => {
    const bad = (await postWaCierre({ request: reqJob("http://x/api/jobs/whatsapp-cierre", { tenant_id: "", fecha_jornada: "x" }) } as never)) as Response;
    expect(bad.status).toBe(422);
    const sinTenant = (await postWaCierre({ request: reqJob("http://x/api/jobs/whatsapp-cierre", { tenant_id: "nope", fecha_jornada: "2026-10-11" }) } as never)) as Response;
    expect(sinTenant.status).toBe(404);
    const { tenantId } = comercioWa(true);
    const sinCierre = (await postWaCierre({ request: reqJob("http://x/api/jobs/whatsapp-cierre", { tenant_id: tenantId, fecha_jornada: "2026-10-11" }) } as never)) as Response;
    expect(sinCierre.status).toBe(404);
    store.cierres.set("2026-10-11", {
      cierre: { fechaJornada: "2026-10-11", closeType: "manual", totalCentavos: 10000n, ultimoMovimientoId: null },
    } as never);
    const r = (await postWaCierre({ request: reqJob("http://x/api/jobs/whatsapp-cierre", { tenant_id: tenantId, fecha_jornada: "2026-10-11" }) } as never)) as Response;
    expect(r.status).toBe(502);
    expect(((await r.json()) as { error: string }).error).toBe("sin_credenciales");
  });
});

const DIA_MS = 86_400_000;

function semillaVencimientos() {
  resetStore();
  modoSingleJobs();
  control.tenants.set("t1", {
    id: "t1",
    nombreComercio: "Kiosco",
    slug: "kiosco",
    estado: "activo",
    plan: "base",
    moneda: "ARS",
    ownerGoogleSub: "due",
    esDemo: false,
  });
  control.botLinks.set("+5491100000001", { tenantId: "t1", googleSub: "due", estado: "verificado" });
  control.waPrefs.set("t1:due", { optIn: true, avisoHora: "08:00", pausadoHastaMs: null });
  store.serviceAccounts.set("acc-luz", {
    id: "acc-luz",
    servicio: "luz",
    proveedor: "Edenor",
    titular: "Kiosco",
    numeroCuenta: "1",
    alias: null,
    vencimientoTipicoDia: 10,
    emailOrigen: null,
    medioHabitual: null,
    debitoAutomatico: false,
    activa: true,
  });
  const hoyMs = Date.now();
  const hoyBA = fechaAR(new Date(hoyMs));
  const isoDias = (d: number): string => sumarDiasAR(hoyBA, d);
  const base = {
    accountId: "acc-luz",
    periodo: "2026-10",
    estado: "pendiente" as const,
    necesitaRevision: false,
    origen: "pdf_digital" as const,
    confianzaMonto: "alta" as const,
    confianzaVencimiento: "alta" as const,
  };
  store.utilityBills.set("b-prox", { ...base, id: "b-prox", messageId: "m1", vencimiento: isoDias(2), montoCentavos: 100n });
  store.utilityBills.set("b-venc", { ...base, id: "b-venc", messageId: "m2", vencimiento: isoDias(-1), montoCentavos: 100n });
  const orden = (id: string, numero: string, venceMs: number) => ({
    id,
    numero,
    payeeId: "pay-1",
    tipo: "proveedor" as const,
    concepto: `Concepto ${numero}`,
    montoCentavos: 100000n,
    venceElMs: venceMs,
    medioSugerido: "Transferencia" as const,
    instruccion: "transferencia" as const,
    categoria: "pago_proveedores" as const,
    estado: "preparada" as const,
    version: 1,
    idempotencyKey: `k-${id}`,
    eventos: [],
  });
  store.paymentOrders.set("o-prox", orden("o-prox", "OP-1", hoyMs + 2 * DIA_MS));
  store.paymentOrders.set("o-venc", orden("o-venc", "OP-2", hoyMs - DIA_MS));
}

describe("PERS2-S19 single sin DB: vencimientos como hoy", () => {
  beforeEach(semillaVencimientos);

  it("lotes clasifica el vencimiento a 3 días", async () => {
    const alta = (await postLots({
      request: new Request("http://x/api/lots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sku: "VTO", cantidad: 2, vence_el: new Date(Date.now() + 2 * DIA_MS).toISOString() }),
      }),
    } as never)) as Response;
    expect(alta.status).toBe(201);
    const j = (await postVencLotes(ctx("http://x/api/jobs/vencimientos-lotes", { method: "POST" }))) as Response;
    expect(((await j.json()) as { alertas_3d: unknown[] }).alertas_3d.length).toBe(1);
  });

  it("servicios marca vencidas y sin credenciales todo es fallo sin quemar idempotencia", async () => {
    const res = (await postVencServ({ request: reqJob("http://x/api/jobs/vencimientos-servicios") } as never)) as Response;
    expect(res.status).toBe(200);
    const j = (await res.json()) as {
      resultados: Array<{ tenant_id: string; vencidas_marcadas: string[]; recordatorios: Array<{ tipo: string; estado: string }>; sugerencias: unknown[] }>;
    };
    expect(j.resultados).toHaveLength(1);
    const r = j.resultados[0];
    expect(r?.vencidas_marcadas).toEqual(expect.arrayContaining(["o-venc"]));
    const tipos = (r?.recordatorios ?? []).map((x) => x.tipo).sort();
    expect(tipos).toEqual(["orden_proxima", "orden_vencida", "servicio_proximo", "servicio_vencido"]);
    expect(new Set((r?.recordatorios ?? []).map((x) => x.estado))).toEqual(new Set(["fallo"]));
    expect(store.waEnviados.size).toBe(0);
    expect(store.paymentOrders.get("o-venc")?.estado).toBe("vencida");
    expect(store.paymentOrders.get("o-prox")?.estado).toBe("preparada");
  });
});

const hayPGJobs = Boolean(process.env.PG_TEST_URL_A && process.env.PG_TEST_URL_B);
const sufijoJobs = `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6)}`;

function fijarMultiJobs() {
  process.env.TENANT_MODE = "multi";
  process.env["TENANT_DATABASE_URL_tenant-a"] = process.env.PG_TEST_URL_A ?? "";
  process.env["TENANT_DATABASE_URL_tenant-b"] = process.env.PG_TEST_URL_B ?? "";
  process.env.JOBS_SECRET = SECRETO;
  delete process.env.WHATSAPP_PHONE_NUMBER_ID;
  delete process.env.WHATSAPP_TOKEN;
}

function fijarTenantJob(id: string) {
  control.tenants.set(id, {
    id,
    nombreComercio: id,
    slug: id,
    estado: "activo",
    plan: "base",
    moneda: "ARS",
    ownerGoogleSub: `due-${id}`,
    esDemo: false,
  });
}

function reqJobTenant(url: string, tenantId: string, body?: unknown): Request {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Job-Secret": SECRETO, "X-Tenant-Id": tenantId },
    body: body ? JSON.stringify(body) : null,
  });
}

describe.skipIf(!hayPGJobs)("PERS2-S18 multi con PG local: cierre de medianoche aislado por tenant", () => {
  beforeAll(() => {
    fijarMultiJobs();
    resetStore();
  });

  afterAll(async () => {
    fijarMultiJobs();
    for (const tenant of ["tenant-a", "tenant-b"] as const) {
      await conTenant(tenant, async () => {
        const db = getTenantDb();
        const filas = await db.select().from(closingSummaries);
        for (const f of filas) {
          if (f.fechaJornada.startsWith("2026-") || f.fechaJornada.startsWith("2025-")) {
            await db.delete(closingSummaries).where(eq(closingSummaries.id, f.id));
          }
        }
      });
    }
    delete process.env.TENANT_MODE;
    delete process.env["TENANT_DATABASE_URL_tenant-a"];
    delete process.env["TENANT_DATABASE_URL_tenant-b"];
  });

  it("el cierre para tenant-a queda solo en la base de A", async () => {
    fijarMultiJobs();
    fijarTenantJob("tenant-a");
    fijarTenantJob("tenant-b");
    const r = await conTenant("tenant-a", () =>
      postCierreJob({ request: reqJobTenant("http://x/api/jobs/cierre-medianoche", "tenant-a") } as never),
    );
    expect((r as Response).status).toBe(201);
    const filasA = await conTenant("tenant-a", async () => getTenantDb().select().from(closingSummaries));
    expect(filasA.length).toBe(1);
    expect(filasA[0]?.closeType).toBe("automatica");
    const filasB = await conTenant("tenant-b", async () => getTenantDb().select().from(closingSummaries));
    expect(filasB.length).toBe(0);
  });
});

describe.skipIf(!hayPGJobs)("PERS2-S19 multi con PG local: vencimientos solo del tenant", () => {
  const msgA = `pers2-job-bill-a-${sufijoJobs}@test.local`;
  const msgB = `pers2-job-bill-b-${sufijoJobs}@test.local`;

  beforeAll(() => {
    fijarMultiJobs();
    resetStore();
  });

  afterAll(async () => {
    fijarMultiJobs();
    for (const tenant of ["tenant-a", "tenant-b"] as const) {
      await conTenant(tenant, async () => {
        const db = getTenantDb();
        await db.delete(utilityBills).where(eq(utilityBills.messageId, msgA));
        await db.delete(utilityBills).where(eq(utilityBills.messageId, msgB));
        const ordenes = await db.select().from(paymentOrders);
        for (const o of ordenes) {
          if (o.concepto === `Job PG ${sufijoJobs}`) {
            await db.delete(paymentOrderEvents).where(eq(paymentOrderEvents.paymentOrderId, o.id));
            await db.delete(paymentOrders).where(eq(paymentOrders.id, o.id));
          }
        }
        const cuentas = await db.select().from(serviceAccounts);
        for (const c of cuentas) {
          if (c.titular === `Job PG ${sufijoJobs}`) await db.delete(serviceAccounts).where(eq(serviceAccounts.id, c.id));
        }
      });
    }
    delete process.env.TENANT_MODE;
    delete process.env["TENANT_DATABASE_URL_tenant-a"];
    delete process.env["TENANT_DATABASE_URL_tenant-b"];
  });

  it("vencimientos-servicios para tenant-a solo marca órdenes de A", async () => {
    fijarMultiJobs();
    fijarTenantJob("tenant-a");
    fijarTenantJob("tenant-b");
    const numeroA = "+5491100000231";
    control.botLinks.set(numeroA, { tenantId: "tenant-a", googleSub: "due-tenant-a", estado: "verificado" });
    control.waPrefs.set("tenant-a:due-tenant-a", { optIn: true, avisoHora: "08:00", pausadoHastaMs: null });
    const ayerIso = sumarDiasAR(fechaAR(Date.now()), -1);
    const ayerMs = Date.now() - DIA_MS;

    const idsA = await conTenant("tenant-a", async () => {
      const db = getTenantDb();
      const [cuenta] = await db
        .insert(serviceAccounts)
        .values({ servicio: "luz", proveedor: "Edenor", titular: `Job PG ${sufijoJobs}`, activa: true })
        .returning({ id: serviceAccounts.id });
      const [bill] = await db
        .insert(utilityBills)
        .values({
          accountId: cuenta!.id,
          messageId: msgA,
          periodo: "2026-10",
          vencimiento: ayerIso,
          montoCentavos: 100n,
          estado: "pendiente",
          necesitaRevision: false,
          origen: "pdf_digital",
          confianza: {},
        })
        .returning({ id: utilityBills.id });
      const [orden] = await db
        .insert(paymentOrders)
        .values({
          idempotencyKey: `pers2-job-ord-a-${sufijoJobs}`,
          numero: `OP-PG-A-${sufijoJobs}`.slice(0, 16),
          payeeId: crypto.randomUUID(),
          concepto: `Job PG ${sufijoJobs}`,
          montoCentavos: 100000n,
          venceEl: new Date(ayerMs),
          metodoSugerido: "Transferencia",
          instruccionTipo: "transferencia",
          instruccionSnapshot: { medioSugerido: "Transferencia" },
          creadoPor: "sistema",
        })
        .returning({ id: paymentOrders.id });
      return { billId: bill!.id, ordenId: orden!.id };
    });
    await conTenant("tenant-b", async () => {
      const db = getTenantDb();
      const [cuenta] = await db
        .insert(serviceAccounts)
        .values({ servicio: "luz", proveedor: "Edenor", titular: `Job PG ${sufijoJobs}`, activa: true })
        .returning({ id: serviceAccounts.id });
      await db.insert(utilityBills).values({
        accountId: cuenta!.id,
        messageId: msgB,
        periodo: "2026-10",
        vencimiento: ayerIso,
        montoCentavos: 100n,
        estado: "pendiente",
        necesitaRevision: false,
        origen: "pdf_digital",
        confianza: {},
      });
      await db.insert(paymentOrders).values({
        idempotencyKey: `pers2-job-ord-b-${sufijoJobs}`,
        numero: `OP-PG-B-${sufijoJobs}`.slice(0, 16),
        payeeId: crypto.randomUUID(),
        concepto: `Job PG ${sufijoJobs}`,
        montoCentavos: 100000n,
        venceEl: new Date(ayerMs),
        metodoSugerido: "Transferencia",
        instruccionTipo: "transferencia",
        instruccionSnapshot: { medioSugerido: "Transferencia" },
        creadoPor: "sistema",
      });
    });

    const res = await conTenant("tenant-a", () =>
      postVencServ({ request: reqJobTenant("http://x/api/jobs/vencimientos-servicios", "tenant-a") } as never),
    );
    expect((res as Response).status).toBe(200);
    const j = ((await (res as Response).json()) as {
      resultados: Array<{ tenant_id: string; vencidas_marcadas: string[] }>;
    }).resultados;
    expect(j.map((x) => x.tenant_id)).toEqual(["tenant-a"]);
    expect(j[0]?.vencidas_marcadas).toContain(idsA.ordenId);

    const ordenA = await conTenant("tenant-a", async () => {
      const db = getTenantDb();
      return db.select().from(paymentOrders).where(eq(paymentOrders.id, idsA.ordenId));
    });
    expect(ordenA[0]?.estado).toBe("vencida");
    const ordenesB = await conTenant("tenant-b", async () => {
      const db = getTenantDb();
      return db.select().from(paymentOrders).where(eq(paymentOrders.concepto, `Job PG ${sufijoJobs}`));
    });
    expect(ordenesB.length).toBe(1);
    expect(ordenesB[0]?.estado).toBe("preparada");
    const billsB = await conTenant("tenant-b", async () => {
      const db = getTenantDb();
      return db.select().from(utilityBills).where(eq(utilityBills.messageId, msgB));
    });
    expect(billsB.length).toBe(1);
  });
});
