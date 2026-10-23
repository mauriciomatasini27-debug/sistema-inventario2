import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import postgres from "postgres";
import { ctx } from "./helpers/ctx.js";
import { asegurarBasePrivada } from "./helpers/pg-privada.js";
import { control, resetStore, store } from "../src/lib/store.js";
import { POST as POSTAviso } from "../src/pages/api/jobs/whatsapp-aviso.js";
import { fechaAR } from "../src/lib/fecha-ar.js";
import { limpiar_corridas_wa } from "../src/jobs/whatsapp-aviso-matutino.js";
import {
  alertasPreviasDelDia,
  limpiarAlertasStockMemoria,
  registrarAlertasStock,
} from "../src/lib/repos/whatsapp.js";
import { clave_alerta_stock } from "../src/modules/alertas/stock-bajo.js";

const SECRET = "job-secret-alr-durable";
const URL_A = process.env.PG_TEST_URL_A;

afterEach(() => {
  vi.unstubAllGlobals();
});

async function correrAviso(): Promise<Array<{ tenant_id: string; estado: string }>> {
  const res = (await POSTAviso(ctx("http://x/api/jobs/whatsapp-aviso", { method: "POST", headers: { "X-Job-Secret": SECRET } }))) as Response;
  expect(res.status).toBe(200);
  const json = (await res.json()) as { resultados: Array<{ tenant_id: string; estado: string }> };
  return json.resultados;
}

function estadoDe(resultados: Array<{ tenant_id: string; estado: string }>, tenantId: string): string | undefined {
  return resultados.find((r) => r.tenant_id === tenantId)?.estado;
}

function credencialesFake(): void {
  process.env.WHATSAPP_PHONE_NUMBER_ID = "phone-test";
  process.env.WHATSAPP_TOKEN = "token-test";
  vi.stubGlobal("fetch", async () => ({
    ok: true,
    status: 200,
    json: async () => ({ messages: [{ id: "wamid-test" }] }),
  }));
}

describe("ALR-S2 memoria durable", () => {
  let n = 0;

  function comercio(optIn: boolean): string {
    n++;
    const tenantId = `t-alr-dur-${n}`;
    const sub = `dueno-alr-dur-${n}`;
    const numero = `+549110001${String(n).padStart(3, "0")}`;
    control.tenants.set(tenantId, {
      id: tenantId,
      nombreComercio: `Kiosco ${n}`,
      slug: `kiosco-alr-dur-${n}`,
      estado: "activo",
      plan: "basico",
      moneda: "ARS",
      ownerGoogleSub: sub,
      esDemo: false,
    });
    control.botLinks.set(numero, { tenantId, googleSub: sub, estado: "verificado" });
    control.waPrefs.set(`${tenantId}:${sub}`, { optIn, avisoHora: "08:00", pausadoHastaMs: null });
    return tenantId;
  }

  beforeEach(() => {
    resetStore();
    limpiar_corridas_wa();
    limpiarAlertasStockMemoria();
    delete process.env.TENANT_MODE;
    delete process.env.TENANT_DATABASE_URL;
    delete process.env.WHATSAPP_PHONE_NUMBER_ID;
    delete process.env.WHATSAPP_TOKEN;
    process.env.JOBS_SECRET = SECRET;
    vi.unstubAllGlobals();
  });

  it("(a) sin clave previa envía y deja la alerta disponible para el próximo run", async () => {
    const tenantId = comercio(true);
    credencialesFake();
    const fecha = fechaAR(new Date());

    const resultados = await correrAviso();
    expect(estadoDe(resultados, tenantId)).toBe("enviado");

    const previas = await alertasPreviasDelDia(tenantId, fecha);
    expect(previas.has("demo-sku-1")).toBe(true);
  });

  it("(b) una alerta no urgente ya registrada no se repite el mismo día", async () => {
    const tenantId = comercio(true);
    credencialesFake();
    const fecha = fechaAR(new Date());

    await registrarAlertasStock(tenantId, fecha, [
      { sku: "demo-sku-1", nombre: "Alfajor", stock: 10, umbral: 10, urgente: false },
    ]);

    const resultados = await correrAviso();
    expect(estadoDe(resultados, tenantId)).toBe("omitido_sin_novedad");
  });

  it("(c) una alerta urgente ya registrada sí vuelve a salir", async () => {
    const tenantId = comercio(true);
    credencialesFake();
    const fecha = fechaAR(new Date());

    await registrarAlertasStock(tenantId, fecha, [
      { sku: "demo-sku-1", nombre: "Alfajor", stock: 0, umbral: 10, urgente: true },
    ]);
    store.stock.set("demo-sku-1", 0);

    const resultados = await correrAviso();
    expect(estadoDe(resultados, tenantId)).toBe("enviado");
  });

  it("al día siguiente la misma alerta no urgente vuelve a salir", async () => {
    const tenantId = comercio(true);
    credencialesFake();
    const ayer = fechaAR(new Date(Date.now() - 24 * 3600 * 1000));
    await registrarAlertasStock(tenantId, ayer, [
      { sku: "demo-sku-1", nombre: "Alfajor", stock: 10, umbral: 10, urgente: false },
    ]);
    expect(estadoDe(await correrAviso(), tenantId)).toBe("enviado");
  });

  it("la misma alerta registrada en otro comercio no frena a este", async () => {
    const otro = comercio(false);
    const tenantId = comercio(true);
    credencialesFake();
    await registrarAlertasStock(otro, fechaAR(new Date()), [
      { sku: "demo-sku-1", nombre: "Alfajor", stock: 10, umbral: 10, urgente: false },
    ]);
    expect(estadoDe(await correrAviso(), tenantId)).toBe("enviado");
  });

  it("con la base caída el job no corta y la alerta queda en memoria", async () => {
    const tenantId = comercio(true);
    credencialesFake();
    process.env.TENANT_DATABASE_URL = "postgres://postgres@127.0.0.1:1/caida";
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      expect(estadoDe(await correrAviso(), tenantId)).toBe("enviado");
      // Sin DB la alerta queda en memoria: el próximo run del día la ve.
      expect((await alertasPreviasDelDia(tenantId, fechaAR(new Date()))).has("demo-sku-1")).toBe(true);
    } finally {
      warn.mockRestore();
      delete process.env.TENANT_DATABASE_URL;
    }
  });

  it("la clave incluye tenant, sku y fecha", () => {
    const k = clave_alerta_stock("t-a", "sku-1", "2026-10-16");
    expect(k).toContain("t-a");
    expect(k).toContain("sku-1");
    expect(k).toContain("2026-10-16");
    expect(k).toBe("alerta_stock:t-a:sku-1:2026-10-16");
  });

  it("registrar dos veces el mismo día es idempotente", async () => {
    const tenantId = "t-alr-idem";
    const fecha = "2026-10-16";
    const alerta = { sku: "demo-sku-1", nombre: "Alfajor", stock: 10, umbral: 10, urgente: false };
    await registrarAlertasStock(tenantId, fecha, [alerta]);
    await registrarAlertasStock(tenantId, fecha, [alerta]);
    const previas = await alertasPreviasDelDia(tenantId, fecha);
    expect(previas.size).toBe(1);
    expect(previas.has("demo-sku-1")).toBe(true);
  });

  it("otra fecha u otro tenant no ven alertas ajenas", async () => {
    const tenantId = "t-alr-otra-fecha";
    await registrarAlertasStock(tenantId, "2026-10-16", [
      { sku: "demo-sku-1", nombre: "Alfajor", stock: 10, umbral: 10, urgente: false },
    ]);
    expect((await alertasPreviasDelDia(tenantId, "2026-10-17")).size).toBe(0);
    expect((await alertasPreviasDelDia("t-alr-otro-tenant", "2026-10-16")).size).toBe(0);
  });
});

describe.skipIf(!URL_A)("ALR durable contra PG", () => {
  let sql: ReturnType<typeof postgres> | null = null;
  let tenantId = "";

  beforeAll(async () => {
    const url = await asegurarBasePrivada("alr_memoria_durable", URL_A!);
    process.env.TENANT_DATABASE_URL = url;
    delete process.env.TENANT_MODE;
    sql = postgres(url, { max: 1 });
    tenantId = randomUUID();
    limpiarAlertasStockMemoria();
    await sql`delete from notification_events where tipo = 'alerta_stock'`;
  });

  afterAll(async () => {
    await sql?.end();
    delete process.env.TENANT_DATABASE_URL;
    limpiarAlertasStockMemoria();
  });

  it("persiste las alertas y deduplica por tenant+fecha", async () => {
    const fecha = "2026-10-23";
    const alertas = [
      { sku: "sku-a", nombre: "A", stock: 3, umbral: 10, urgente: true },
      { sku: "sku-b", nombre: "B", stock: 9, umbral: 10, urgente: false },
    ];
    limpiarAlertasStockMemoria();
    await registrarAlertasStock(tenantId, fecha, alertas);
    limpiarAlertasStockMemoria();

    const previas = await alertasPreviasDelDia(tenantId, fecha);
    expect([...previas].sort()).toEqual(["sku-a", "sku-b"]);
    expect((await alertasPreviasDelDia(tenantId, "2026-10-24")).size).toBe(0);

    await registrarAlertasStock(tenantId, fecha, alertas);
    const cliente = sql;
    if (!cliente) throw new Error("sin cliente de prueba");
    const [conteo] = await cliente<{ n: number }[]>`
      select count(*)::int as n from notification_events
      where tenant_id = ${tenantId} and tipo = 'alerta_stock'
        and dedupe_key like ${`alerta_stock:${tenantId}:%:${fecha}`}
    `;
    expect(conteo?.n).toBe(2);

    const filas = await cliente<{ estado: string; ref_tipo: string | null }[]>`
      select estado, ref_tipo from notification_events where tenant_id = ${tenantId} and tipo = 'alerta_stock'
    `;
    expect(filas).toHaveLength(2);
    expect(filas.every((f) => f.estado === "enviado" && f.ref_tipo === "producto")).toBe(true);
  });
});
