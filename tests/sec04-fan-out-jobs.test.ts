import { describe, expect, it, afterEach, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { ctx } from "./helpers/ctx.js";
import { gateJob } from "../src/lib/tenant-context.js";
import { correrJob } from "../src/lib/jobs-tenant.js";
import { control, resetStore } from "../src/lib/store.js";
import { conTenant, tenantActual } from "../src/lib/tenant-mode.js";
import { getTenantDb } from "../src/lib/db.js";
import { BaseNoDisponible } from "../src/lib/server-db.js";
import { fechaAR, sumarDiasAR } from "../src/lib/fecha-ar.js";
import { serviceAccounts, utilityBills } from "../src/db/schema-servicios.js";
import { deviceSyncState } from "../src/db/schema-sync.js";
import { paymentOrders, paymentOrderEvents } from "../src/db/schema-pagos.js";
import { POST as postCierreJob } from "../src/pages/api/jobs/cierre-medianoche.js";
import { POST as postVencServ } from "../src/pages/api/jobs/vencimientos-servicios.js";
import { POST as postWaCierre } from "../src/pages/api/jobs/whatsapp-cierre.js";
import { POST as postAvisoSync } from "../src/pages/api/jobs/aviso-sync.js";
import { asegurarBasePrivada } from "./helpers/pg-privada.js";

const SECRETO = "secreto-sec04";

function reqJobs(path: string, headers: Record<string, string> = {}): Request {
  return new Request(`http://test${path}`, { headers });
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

afterEach(() => {
  delete process.env.TENANT_MODE;
  delete process.env.JOBS_SECRET;
  delete process.env.DEFAULT_TENANT_ID;
  delete process.env["TENANT_DATABASE_URL_tenant-a"];
  delete process.env["TENANT_DATABASE_URL_tenant-b"];
  resetStore();
});

describe("SEC4-S1 gateJob con fan-out", () => {
  it("multi sin X-Tenant-Id en /api/jobs/* devuelve activos y suspendidos ordenados", () => {
    modoMulti();
    fijarTenant("tenant-b", "activo");
    fijarTenant("tenant-a", "suspendido");
    fijarTenant("tenant-c", "preparando");
    const r = gateJob(reqJobs("/api/jobs/cierre-medianoche", { "X-Job-Secret": SECRETO }));
    expect(r).toEqual({ ok: true, tenantIds: ["tenant-a", "tenant-b"] });
  });

  it("multi sin X-Tenant-Id fuera de /api/jobs responde 403 E5", async () => {
    modoMulti();
    fijarTenant("tenant-a", "activo");
    const r = gateJob(reqJobs("/api/sales", { "X-Job-Secret": SECRETO }));
    expect(r).not.toBeNull();
    expect(r!.ok).toBe(false);
    if (!r!.ok) {
      expect(r!.respuesta.status).toBe(403);
      expect(await r!.respuesta.json()).toEqual({ error: "No tenés permiso para ver este comercio." });
    }
  });

  it("multi con tenant fantasma responde 403 E5", async () => {
    modoMulti();
    fijarTenant("tenant-a", "activo");
    const r = gateJob(
      reqJobs("/api/jobs/cierre-medianoche", { "X-Job-Secret": SECRETO, "X-Tenant-Id": "fantasma" }),
    );
    expect(r).not.toBeNull();
    expect(r!.ok).toBe(false);
    if (!r!.ok) {
      expect(r!.respuesta.status).toBe(403);
      expect(await r!.respuesta.json()).toEqual({ error: "No tenés permiso para ver este comercio." });
    }
  });

  it("secreto inválido o ausente devuelve null", () => {
    modoMulti();
    fijarTenant("tenant-a", "activo");
    expect(gateJob(reqJobs("/api/jobs/cierre-medianoche", { "X-Job-Secret": "otro" }))).toBeNull();
    expect(gateJob(reqJobs("/api/jobs/cierre-medianoche"))).toBeNull();
  });

  it("single con secreto válido corre como tenant por defecto", () => {
    delete process.env.TENANT_MODE;
    process.env.JOBS_SECRET = SECRETO;
    const r = gateJob(reqJobs("/api/jobs/cierre-medianoche", { "X-Job-Secret": SECRETO }));
    expect(r).toEqual({ ok: true, tenantId: "slice0" });
  });
});

describe("SEC4-S2 correrJob", () => {
  it("fan-out corre cada tenant en su contexto", async () => {
    modoMulti();
    fijarTenant("tenant-a", "activo");
    fijarTenant("tenant-b", "activo");
    const vistos: Array<string | undefined> = [];
    const res = await correrJob(reqJobs("/api/jobs/x", { "X-Job-Secret": SECRETO }), async (id) => {
      vistos.push(tenantActual());
      return Response.json({ eco: id });
    });
    expect(res.status).toBe(200);
    expect(vistos).toEqual(["tenant-a", "tenant-b"]);
    expect(await res.json()).toEqual({
      fan_out: true,
      total: 2,
      fallidos: 0,
      resultados: [
        { tenant_id: "tenant-a", status: 200, cuerpo: { eco: "tenant-a" } },
        { tenant_id: "tenant-b", status: 200, cuerpo: { eco: "tenant-b" } },
      ],
    });
  });

  it("un tenant que lanza no corta al siguiente y cuenta fallidos", async () => {
    modoMulti();
    fijarTenant("tenant-a", "activo");
    fijarTenant("tenant-b", "activo");
    const corridos: string[] = [];
    const res = await correrJob(reqJobs("/api/jobs/x", { "X-Job-Secret": SECRETO }), async (id) => {
      corridos.push(id);
      if (id === "tenant-a") throw new Error("secreto roto");
      return Response.json({ ok: true });
    });
    expect(corridos).toEqual(["tenant-a", "tenant-b"]);
    expect(await res.json()).toEqual({
      fan_out: true,
      total: 2,
      fallidos: 1,
      resultados: [
        { tenant_id: "tenant-a", status: 500, cuerpo: { error: "error_interno" } },
        { tenant_id: "tenant-b", status: 200, cuerpo: { ok: true } },
      ],
    });
  });

  it("BaseNoDisponible en un tenant figura con 503 y sigue", async () => {
    modoMulti();
    fijarTenant("tenant-a", "activo");
    fijarTenant("tenant-b", "activo");
    const res = await correrJob(reqJobs("/api/jobs/x", { "X-Job-Secret": SECRETO }), async (id) => {
      if (id === "tenant-a") throw new BaseNoDisponible();
      return Response.json({ ok: true });
    });
    const j = (await res.json()) as { fallidos: number; resultados: Array<{ status: number; cuerpo: unknown }> };
    expect(res.status).toBe(200);
    expect(j.fallidos).toBe(1);
    expect(j.resultados[0]).toEqual({
      tenant_id: "tenant-a",
      status: 503,
      cuerpo: { error: "base_no_disponible" },
    });
    expect(j.resultados[1]?.status).toBe(200);
  });

  it("sin tenants elegibles responde 200 con resultados vacíos", async () => {
    modoMulti();
    fijarTenant("tenant-a", "preparando");
    const res = await correrJob(reqJobs("/api/jobs/x", { "X-Job-Secret": SECRETO }), async () =>
      Response.json({ ok: true }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ fan_out: true, total: 0, fallidos: 0, resultados: [] });
  });

  it("con un tenant devuelve la respuesta tal cual", async () => {
    modoMulti();
    fijarTenant("tenant-a", "activo");
    const res = await correrJob(
      reqJobs("/api/jobs/x", { "X-Job-Secret": SECRETO, "X-Tenant-Id": "tenant-a" }),
      async (id) => Response.json({ eco: id }, { status: 201 }),
    );
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ eco: "tenant-a" });
  });

  it("gate nulo responde 403 no autorizado y gate denegado propaga su respuesta", async () => {
    modoMulti();
    fijarTenant("tenant-a", "activo");
    const sinSecreto = await correrJob(reqJobs("/api/jobs/x"), async () => Response.json({ ok: true }));
    expect(sinSecreto.status).toBe(403);
    expect(await sinSecreto.json()).toEqual({ error: "no autorizado" });
    const fantasma = await correrJob(
      reqJobs("/api/jobs/x", { "X-Job-Secret": SECRETO, "X-Tenant-Id": "fantasma" }),
      async () => Response.json({ ok: true }),
    );
    expect(fantasma.status).toBe(403);
    expect(await fantasma.json()).toEqual({ error: "No tenés permiso para ver este comercio." });
  });

  it("fanOut false con gate fan-out responde 403 E5", async () => {
    modoMulti();
    fijarTenant("tenant-a", "activo");
    const res = await correrJob(
      reqJobs("/api/jobs/x", { "X-Job-Secret": SECRETO }),
      async () => Response.json({ ok: true }),
      { fanOut: false },
    );
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "No tenés permiso para ver este comercio." });
  });
});

describe("SEC4-S2 ruta real en fan-out", () => {
  it("cierre-medianoche en multi sin base devuelve resumen por tenant elegible", async () => {
    modoMulti();
    fijarTenant("tenant-a", "activo");
    fijarTenant("tenant-b", "suspendido");
    fijarTenant("tenant-c", "preparando");
    const res = (await postCierreJob(
      ctx("http://x/api/jobs/cierre-medianoche", {
        method: "POST",
        headers: { "X-Job-Secret": SECRETO },
      }),
    )) as Response;
    expect(res.status).toBe(200);
    const j = (await res.json()) as {
      fan_out: boolean;
      total: number;
      resultados: Array<{ tenant_id: string; status: number; cuerpo: unknown }>;
    };
    expect(j.fan_out).toBe(true);
    expect(j.total).toBe(2);
    expect(j.resultados.map((r) => r.tenant_id)).toEqual(["tenant-a", "tenant-b"]);
  });

  it("aviso-sync en multi sin base responde 503 por tenant (fail-closed DB-first)", async () => {
    modoMulti();
    fijarTenant("tenant-a", "activo");
    fijarTenant("tenant-b", "activo");
    const res = (await postAvisoSync(
      ctx("http://x/api/jobs/aviso-sync", { method: "POST", headers: { "X-Job-Secret": SECRETO } }),
    )) as Response;
    expect(res.status).toBe(200);
    const j = (await res.json()) as {
      fallidos: number;
      resultados: Array<{ tenant_id: string; status: number; cuerpo: { error: string } }>;
    };
    expect(j.fallidos).toBe(2);
    expect(j.resultados.map((r) => [r.tenant_id, r.status, r.cuerpo.error])).toEqual([
      ["tenant-a", 503, "base_no_disponible"],
      ["tenant-b", 503, "base_no_disponible"],
    ]);
  });

  it("whatsapp-cierre en multi sin X-Tenant-Id responde 403", async () => {
    modoMulti();
    fijarTenant("tenant-a", "activo");
    const res = (await postWaCierre(
      ctx("http://x/api/jobs/whatsapp-cierre", {
        method: "POST",
        headers: { "X-Job-Secret": SECRETO },
        body: { tenant_id: "tenant-a", fecha_jornada: "2026-10-11" },
      }),
    )) as Response;
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "No tenés permiso para ver este comercio." });
  });
});

const hayPG = Boolean(process.env.PG_TEST_URL_A && process.env.PG_TEST_URL_B);
const sufijo = `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6)}`;
const DIA_MS = 86_400_000;

let basePrivA = "";
let basePrivB = "";

function fijarMultiPG() {
  process.env.TENANT_MODE = "multi";
  process.env["TENANT_DATABASE_URL_tenant-a"] = basePrivA;
  process.env["TENANT_DATABASE_URL_tenant-b"] = basePrivB;
  process.env.JOBS_SECRET = SECRETO;
}

describe.skipIf(!hayPG)("SEC4-S2 fan-out con PG local: vencimientos-servicios por base", () => {
  const msgA = `sec04-bill-a-${sufijo}@test.local`;
  const msgB = `sec04-bill-b-${sufijo}@test.local`;
  const concepto = `Job PG ${sufijo}`;
  let ordenA = "";
  let ordenB = "";

  beforeAll(async () => {
    basePrivA = await asegurarBasePrivada("pers_sec04_a", process.env.PG_TEST_URL_A ?? "");
    basePrivB = await asegurarBasePrivada("pers_sec04_b", process.env.PG_TEST_URL_B ?? "");
    fijarMultiPG();
    resetStore();
    fijarTenant("tenant-a", "activo");
    fijarTenant("tenant-b", "activo");
    control.botLinks.set("+5491100000231", { tenantId: "tenant-a", googleSub: "due-tenant-a", estado: "verificado" });
    control.waPrefs.set("tenant-a:due-tenant-a", { optIn: true, avisoHora: "08:00", pausadoHastaMs: null });
    control.botLinks.set("+5491100000232", { tenantId: "tenant-b", googleSub: "due-tenant-b", estado: "verificado" });
    control.waPrefs.set("tenant-b:due-tenant-b", { optIn: true, avisoHora: "08:00", pausadoHastaMs: null });
    const ayerIso = sumarDiasAR(fechaAR(Date.now()), -1);
    const ayerMs = Date.now() - DIA_MS;
    for (const [tenant, msg, numero] of [
      ["tenant-a", msgA, `OP-PG-A-${sufijo}`],
      ["tenant-b", msgB, `OP-PG-B-${sufijo}`],
    ] as const) {
      const id = await conTenant(tenant, async () => {
        const db = getTenantDb();
        const [cuenta] = await db
          .insert(serviceAccounts)
          .values({ servicio: "luz", proveedor: "Edenor", titular: concepto, activa: true })
          .returning({ id: serviceAccounts.id });
        await db.insert(utilityBills).values({
          accountId: cuenta!.id,
          messageId: msg,
          periodo: "2026-10",
          vencimiento: ayerIso,
          montoCentavos: 100n,
          estado: "pendiente",
          necesitaRevision: false,
          origen: "pdf_digital",
          confianza: {},
        });
        const [orden] = await db
          .insert(paymentOrders)
          .values({
            idempotencyKey: `sec04-ord-${tenant}-${sufijo}`,
            numero: numero.slice(0, 16),
            payeeId: crypto.randomUUID(),
            concepto,
            montoCentavos: 100000n,
            venceEl: new Date(ayerMs),
            metodoSugerido: "Transferencia",
            instruccionTipo: "transferencia",
            instruccionSnapshot: { medioSugerido: "Transferencia" },
            creadoPor: "sistema",
          })
          .returning({ id: paymentOrders.id });
        return orden!.id;
      });
      if (tenant === "tenant-a") ordenA = id;
      else ordenB = id;
    }
  });

  afterAll(async () => {
    fijarMultiPG();
    for (const tenant of ["tenant-a", "tenant-b"] as const) {
      await conTenant(tenant, async () => {
        const db = getTenantDb();
        await db.delete(utilityBills).where(eq(utilityBills.messageId, msgA));
        await db.delete(utilityBills).where(eq(utilityBills.messageId, msgB));
        const ordenes = await db.select().from(paymentOrders);
        for (const o of ordenes) {
          if (o.concepto === concepto) {
            await db.delete(paymentOrderEvents).where(eq(paymentOrderEvents.paymentOrderId, o.id));
            await db.delete(paymentOrders).where(eq(paymentOrders.id, o.id));
          }
        }
        const cuentas = await db.select().from(serviceAccounts);
        for (const c of cuentas) {
          if (c.titular === concepto) await db.delete(serviceAccounts).where(eq(serviceAccounts.id, c.id));
        }
      });
    }
    delete process.env.TENANT_MODE;
    delete process.env["TENANT_DATABASE_URL_tenant-a"];
    delete process.env["TENANT_DATABASE_URL_tenant-b"];
  });

  it("un disparo sin X-Tenant-Id marca las órdenes vencidas en cada base", async () => {
    fijarMultiPG();
    const res = (await postVencServ(
      ctx("http://x/api/jobs/vencimientos-servicios", {
        method: "POST",
        headers: { "X-Job-Secret": SECRETO },
      }),
    )) as Response;
    expect(res.status).toBe(200);
    const j = (await res.json()) as {
      fan_out: boolean;
      resultados: Array<{ tenant_id: string; status: number; cuerpo: { resultados: Array<{ tenant_id: string; vencidas_marcadas: string[] }> } }>;
    };
    expect(j.fan_out).toBe(true);
    const porTenant = new Map(j.resultados.map((r) => [r.tenant_id, r]));
    expect(porTenant.get("tenant-a")?.cuerpo.resultados[0]?.vencidas_marcadas).toContain(ordenA);
    expect(porTenant.get("tenant-b")?.cuerpo.resultados[0]?.vencidas_marcadas).toContain(ordenB);
    const estadoA = await conTenant("tenant-a", async () => {
      const db = getTenantDb();
      return db.select().from(paymentOrders).where(eq(paymentOrders.id, ordenA));
    });
    expect(estadoA[0]?.estado).toBe("vencida");
    const estadoB = await conTenant("tenant-b", async () => {
      const db = getTenantDb();
      return db.select().from(paymentOrders).where(eq(paymentOrders.id, ordenB));
    });
    expect(estadoB[0]?.estado).toBe("vencida");
  });
});

describe.skipIf(!hayPG)("SEC4-S2 aviso-sync DB-first en fan-out con PG local", () => {
  const DEV_A = "sec04-aviso-a";
  const DEV_B = "sec04-aviso-b";

  let baseAvisoA = "";
  let baseAvisoB = "";

  function fijarAvisoPG() {
    process.env.TENANT_MODE = "multi";
    process.env["TENANT_DATABASE_URL_tenant-a"] = baseAvisoA;
    process.env["TENANT_DATABASE_URL_tenant-b"] = baseAvisoB;
    process.env.JOBS_SECRET = SECRETO;
  }

  async function limpiarAvisoPG() {
    for (const tenant of ["tenant-a", "tenant-b"] as const) {
      await conTenant(tenant, async () => {
        const db = getTenantDb();
        await db.delete(deviceSyncState).where(eq(deviceSyncState.deviceCode, DEV_A));
        await db.delete(deviceSyncState).where(eq(deviceSyncState.deviceCode, DEV_B));
      });
    }
  }

  beforeAll(async () => {
    baseAvisoA = await asegurarBasePrivada("pers_sec04aviso_a", process.env.PG_TEST_URL_A ?? "");
    baseAvisoB = await asegurarBasePrivada("pers_sec04aviso_b", process.env.PG_TEST_URL_B ?? "");
    fijarAvisoPG();
    resetStore();
    fijarTenant("tenant-a", "activo");
    fijarTenant("tenant-b", "activo");
    await limpiarAvisoPG();
    const ahora = new Date();
    await conTenant("tenant-a", async () => {
      const db = getTenantDb();
      await db.insert(deviceSyncState).values({
        deviceCode: DEV_A,
        tenantId: "tenant-a",
        ultimaVistaEn: ahora,
        pendientes: 0,
        ultimaOpHlc: null,
        actualizadoEn: ahora,
      });
    });
    await conTenant("tenant-b", async () => {
      const db = getTenantDb();
      await db.insert(deviceSyncState).values({
        deviceCode: DEV_B,
        tenantId: "tenant-b",
        ultimaVistaEn: new Date(ahora.getTime() - 80 * 3_600_000),
        pendientes: 3,
        ultimaOpHlc: "5:0",
        actualizadoEn: ahora,
      });
    });
  });

  afterAll(async () => {
    fijarAvisoPG();
    await limpiarAvisoPG();
    delete process.env.TENANT_MODE;
    delete process.env["TENANT_DATABASE_URL_tenant-a"];
    delete process.env["TENANT_DATABASE_URL_tenant-b"];
  });

  it("un disparo sin X-Tenant-Id revisa cada base y avisa solo los devices propios", async () => {
    fijarAvisoPG();
    const res = (await postAvisoSync(
      ctx("http://x/api/jobs/aviso-sync", { method: "POST", headers: { "X-Job-Secret": SECRETO } }),
    )) as Response;
    expect(res.status).toBe(200);
    const j = (await res.json()) as {
      fallidos: number;
      resultados: Array<{
        tenant_id: string;
        status: number;
        cuerpo: { revisados: number; avisos: Array<{ device_code: string; nivel: number; cuarentena: boolean }> };
      }>;
    };
    expect(j.fallidos).toBe(0);
    const porTenant = new Map(j.resultados.map((r) => [r.tenant_id, r]));
    const enA = porTenant.get("tenant-a")?.cuerpo;
    const enB = porTenant.get("tenant-b")?.cuerpo;
    expect(porTenant.get("tenant-a")?.status).toBe(200);
    expect(enA?.revisados).toBe(1);
    expect(enA?.avisos).toEqual([]);
    expect(porTenant.get("tenant-b")?.status).toBe(200);
    expect(enB?.revisados).toBe(1);
    expect(enB?.avisos.map((a) => a.device_code)).toEqual([DEV_B]);
    expect(enB?.avisos.map((a) => a.device_code)).not.toContain(DEV_A);
    expect(enA?.avisos.map((a) => a.device_code)).not.toContain(DEV_B);
    expect(enB?.avisos[0]?.nivel).toBe(72);
    expect(enB?.avisos[0]?.cuarentena).toBe(true);
  });
});
