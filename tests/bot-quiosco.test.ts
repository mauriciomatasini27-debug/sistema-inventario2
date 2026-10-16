import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ctx } from "./helpers/ctx.js";
import {
  clave_bot_quiosco,
  ejecutar_bot_quiosco,
  limpiar_corridas_quiosco,
  type ComercioQuiosco,
  type ProductoQuiosco,
} from "../src/jobs/bot-quiosco.js";
import { clasificarLotes } from "../src/lib/repos/lotes.js";
import { fechaAR, type FechaAR } from "../src/lib/fecha-ar.js";
import { control, resetStore, store } from "../src/lib/store.js";
import { POST as POSTBot } from "../src/pages/api/jobs/bot-quiosco.js";
import { cambiarModuloBot } from "../src/lib/repos/bot-modulos.js";

const SECRET = "test-secret-jobs";
const DIA = 86_400_000;

// Reloj fijo: 22:00 en Buenos Aires (01:00Z del día siguiente). Solo se
// falsea Date, igual que tests/vencimientos.test.ts.
vi.useFakeTimers({ toFake: ["Date"] });
vi.setSystemTime(new Date("2026-10-14T01:00:00Z"));
const ahoraMs = Date.now();
const hoy = fechaAR(new Date(ahoraMs)) as FechaAR;

// venceEl a N días exactos de ahoraMs: classify usa ceil(ms/DIA), así el
// tramo cae en N sin off-by-one por la hora del reloj fijo.
const enDias = (d: number): string => new Date(ahoraMs + d * DIA).toISOString();

function productos(pares: ReadonlyArray<[string, string, bigint]>): Map<string, ProductoQuiosco> {
  return new Map(pares.map(([sku, nombre, precioCentavos]) => [sku, { nombre, precioCentavos }]));
}

function comercio(over: Partial<ComercioQuiosco> = {}): ComercioQuiosco {
  return {
    tenantId: "t1",
    nombreComercio: "Kiosco La Esquina",
    modulos: ["vencimientos"],
    lotes: clasificarLotes([], ahoraMs),
    productos: new Map(),
    dormidos: [],
    prefs: { optIn: true, avisoHora: "08:00", pausadoHastaMs: null },
    ...over,
  };
}

interface EnvioCapturado {
  tenantId: string;
  texto: string;
  clave: string;
}

function correr(comercios: ComercioQuiosco[]): { resultados: ReturnType<typeof ejecutar_bot_quiosco>["resultados"]; enviados: EnvioCapturado[] } {
  const enviados: EnvioCapturado[] = [];
  const { resultados } = ejecutar_bot_quiosco({
    comercios,
    fecha: hoy,
    ahoraMs,
    enviar: (tenantId, payload) => {
      enviados.push({ tenantId, texto: payload.texto, clave: payload.clave });
      return { ok: true };
    },
  });
  return { resultados, enviados };
}

beforeEach(() => {
  resetStore();
  limpiar_corridas_quiosco();
});

describe("BOT-S3 quiosco: vencimientos (CAT-S4) + promo vencer", () => {
  it("lote a 3 días: avisa el lote y propone la promo (texto literal)", () => {
    const lotes = clasificarLotes([{ id: "l-1", sku: "m1", cantidadRestante: 12, venceEl: enDias(3) }], ahoraMs);
    const { resultados, enviados } = correr([
      comercio({ lotes, productos: productos([["m1", "Milka leche", 300n]]) }),
    ]);

    expect(resultados).toHaveLength(1);
    expect(resultados[0]?.estado).toBe("enviado");
    expect(resultados[0]?.clave).toBe(clave_bot_quiosco("t1", hoy));
    expect(resultados[0]?.secciones).toEqual(["vencimientos"]);
    expect(enviados).toHaveLength(1);
    expect(enviados[0]?.texto).toBe(
      "Kiosco La Esquina · 2026-10-13\n" +
        "Vencimientos:\n" +
        "- Milka leche: vence en 3 días (12 u.)\n" +
        "Promos:\n" +
        "- Milka leche: 2x1 (vence en 3d), recupera $ 36,00. Ponelo en oferta antes del vencimiento",
    );
    expect(resultados[0]?.promos).toHaveLength(1);
    expect(resultados[0]?.promos[0]).toMatchObject({ sku: "m1", motivo: "vencer", promo: "2x1", venceEnDias: 3 });
  });

  it("umbrales: 15, 7 y 3 días caen en su tramo; 16 días no aparece", () => {
    const lotes = clasificarLotes(
      [
        { id: "l15", sku: "a15", cantidadRestante: 1, venceEl: enDias(15) },
        { id: "l7", sku: "a7", cantidadRestante: 1, venceEl: enDias(7) },
        { id: "l3", sku: "a3", cantidadRestante: 1, venceEl: enDias(3) },
        { id: "l16", sku: "a16", cantidadRestante: 1, venceEl: enDias(16) },
      ],
      ahoraMs,
    );
    expect(lotes.alertas_15d.map((a) => a.sku)).toEqual(["a15"]);
    expect(lotes.alertas_7d.map((a) => a.sku)).toEqual(["a7"]);
    expect(lotes.alertas_3d.map((a) => a.sku)).toEqual(["a3"]);

    const { resultados, enviados } = correr([comercio({ lotes })]);
    expect(resultados[0]?.estado).toBe("enviado");
    const texto = enviados[0]?.texto ?? "";
    expect(texto).toContain("- a3: vence en 3 días (1 u.)");
    expect(texto).toContain("- a7: vence en 7 días (1 u.)");
    expect(texto).toContain("- a15: vence en 15 días (1 u.)");
    expect(texto).not.toContain("a16");
  });

  it("módulo vencimientos apagado: sin aviso y sin envío si no hay otra sección", () => {
    const lotes = clasificarLotes([{ id: "l-1", sku: "m1", cantidadRestante: 12, venceEl: enDias(3) }], ahoraMs);
    const { resultados, enviados } = correr([comercio({ modulos: ["rotacion"], lotes })]);

    expect(resultados[0]?.estado).toBe("omitido_sin_novedad");
    expect(resultados[0]?.secciones).toEqual([]);
    expect(resultados[0]?.texto).toBeNull();
    expect(enviados).toHaveLength(0);
  });

  it("lotes a 0 y 1 día dicen hoy y mañana", () => {
    const lotes = clasificarLotes(
      [
        { id: "l0", sku: "a0", cantidadRestante: 2, venceEl: enDias(0) },
        { id: "l1", sku: "a1", cantidadRestante: 4, venceEl: enDias(1) },
      ],
      ahoraMs,
    );
    const { enviados } = correr([comercio({ lotes })]);
    const texto = enviados[0]?.texto ?? "";
    expect(texto).toContain("- a0: vence hoy (2 u.)");
    expect(texto).toContain("- a1: vence mañana (4 u.)");
  });

  it("lote a 16 días no genera novedad", () => {
    const lotes = clasificarLotes([{ id: "l-1", sku: "m1", cantidadRestante: 12, venceEl: enDias(16) }], ahoraMs);
    const { resultados, enviados } = correr([comercio({ lotes })]);
    expect(resultados[0]?.estado).toBe("omitido_sin_novedad");
    expect(enviados).toHaveLength(0);
  });
});

describe("BOT-S3 quiosco: rotación (RT6) y gating por módulo", () => {
  it("dormidos con módulo rotacion activo: sección rotacion con promo dormido (texto literal)", () => {
    const { resultados, enviados } = correr([
      comercio({
        modulos: ["rotacion"],
        dormidos: [{ sku: "d1", diasSinVenta: 45, inmovilizadoCentavos: 1500n }],
        productos: productos([["d1", "Alfajor", 100n]]),
      }),
    ]);

    expect(resultados[0]?.estado).toBe("enviado");
    expect(resultados[0]?.secciones).toEqual(["rotacion"]);
    expect(enviados[0]?.texto).toBe(
      "Kiosco La Esquina · 2026-10-13\n" +
        "Rotación:\n" +
        "- Alfajor: 2x1 (dormido 45d), recupera $ 15,00. Revisá si sigue a la venta",
    );
    expect(resultados[0]?.promos[0]).toMatchObject({ sku: "d1", motivo: "dormido", diasDormido: 45 });
  });

  it("módulo rotacion apagado: no sale la sección rotación aunque haya dormidos", () => {
    const lotes = clasificarLotes([{ id: "l-1", sku: "m1", cantidadRestante: 12, venceEl: enDias(3) }], ahoraMs);
    const { resultados, enviados } = correr([
      comercio({
        modulos: ["vencimientos"],
        lotes,
        dormidos: [{ sku: "d1", diasSinVenta: 45, inmovilizadoCentavos: 1500n }],
        productos: productos([["m1", "Milka leche", 300n]]),
      }),
    ]);

    expect(resultados[0]?.secciones).toEqual(["vencimientos"]);
    expect(enviados[0]?.texto).not.toContain("Rotación");
    expect(resultados[0]?.promos.map((p) => p.motivo)).toEqual(["vencer"]);
  });
});

describe("BOT-S3 quiosco: aislamiento, idempotencia y opt-in", () => {
  it("aísla tenants: el que tiene el módulo apagado no recibe y sus lotes no se filtran", () => {
    const lotesA = clasificarLotes([{ id: "la", sku: "ska", cantidadRestante: 1, venceEl: enDias(3) }], ahoraMs);
    const lotesB = clasificarLotes([{ id: "lb", sku: "skb", cantidadRestante: 1, venceEl: enDias(3) }], ahoraMs);
    const { resultados, enviados } = correr([
      comercio({ tenantId: "ta", modulos: [], lotes: lotesA, productos: productos([["ska", "Producto A", 100n]]) }),
      comercio({
        tenantId: "tb",
        nombreComercio: "Kiosco B",
        modulos: ["vencimientos"],
        lotes: lotesB,
        productos: productos([["skb", "Producto B", 100n]]),
      }),
    ]);

    expect(resultados.map((r) => [r.tenantId, r.estado])).toEqual([
      ["ta", "omitido_sin_novedad"],
      ["tb", "enviado"],
    ]);
    expect(enviados).toHaveLength(1);
    expect(enviados[0]?.tenantId).toBe("tb");
    expect(enviados[0]?.texto).toContain("Producto B");
    expect(enviados[0]?.texto).not.toContain("Producto A");
    expect(enviados[0]?.texto).not.toContain("ska");
  });

  it("idempotente por tenant+fecha: la segunda corrida no reenvía", () => {
    const lotes = clasificarLotes([{ id: "l-1", sku: "m1", cantidadRestante: 12, venceEl: enDias(3) }], ahoraMs);
    const c = comercio({ lotes, productos: productos([["m1", "Milka leche", 300n]]) });
    const primera = correr([c]);
    const segunda = correr([c]);

    expect(primera.resultados[0]?.estado).toBe("enviado");
    expect(segunda.resultados[0]?.estado).toBe("omitido_ya_enviado");
    expect(segunda.enviados).toHaveLength(0);
  });

  it("sin opt-in no envía", () => {
    const lotes = clasificarLotes([{ id: "l-1", sku: "m1", cantidadRestante: 12, venceEl: enDias(3) }], ahoraMs);
    const { resultados, enviados } = correr([
      comercio({ lotes, prefs: { optIn: false, avisoHora: "08:00", pausadoHastaMs: null } }),
    ]);

    expect(resultados[0]?.estado).toBe("omitido_optout");
    expect(enviados).toHaveLength(0);
  });
});

describe("BOT-S3 ruta POST /api/jobs/bot-quiosco", () => {
  function semillaRuta(): void {
    delete process.env.TENANT_MODE;
    process.env.JOBS_SECRET = SECRET;
    control.tenants.set("slice0", {
      id: "slice0",
      nombreComercio: "Kiosco La Esquina",
      slug: "kiosco",
      estado: "activo",
      plan: "base",
      moneda: "ARS",
      ownerGoogleSub: "due",
      esDemo: false,
    });
    control.botLinks.set("+5491100000001", { tenantId: "slice0", googleSub: "due", estado: "verificado" });
    control.waPrefs.set("slice0:due", { optIn: true, avisoHora: "08:00", pausadoHastaMs: null });
    store.lotes.set("l-1", { id: "l-1", sku: "m1", cantidad: 12, cantidadRestante: 12, venceEl: enDias(3), costoCentavos: "100" });
    store.stock.set("m1", 12);
    store.prices.set("m1", 300);
  }

  beforeEach(semillaRuta);
  afterAll(() => {
    vi.useRealTimers();
    delete process.env.JOBS_SECRET;
    delete process.env.TENANT_MODE;
  });

  it("sin X-Job-Secret es 403", async () => {
    const res = (await POSTBot(ctx("http://x/api/jobs/bot-quiosco", { method: "POST" }))) as Response;
    expect(res.status).toBe(403);
  });

  const conSecret = () => ctx("http://x/api/jobs/bot-quiosco", { method: "POST", headers: { "X-Job-Secret": SECRET } });

  it("módulo vencimientos apagado en tenant_bot_modules: la ruta no avisa ni propone promo", async () => {
    await cambiarModuloBot("slice0", "vencimientos", false);
    const res = (await POSTBot(conSecret())) as Response;
    expect(res.status).toBe(200);
    const j = (await res.json()) as { resultados: Array<{ tenant_id: string; estado: string; secciones: string[]; promos: unknown[] }> };
    expect(j.resultados).toEqual([{ tenant_id: "slice0", estado: "omitido_sin_novedad", secciones: [], promos: [] }]);
  });

  it("solo el número del tenant del contexto entra en la corrida", async () => {
    control.tenants.set("otro", {
      id: "otro",
      nombreComercio: "Otro Kiosco",
      slug: "otro",
      estado: "activo",
      plan: "base",
      moneda: "ARS",
      ownerGoogleSub: "due2",
      esDemo: false,
    });
    control.botLinks.set("+5491100000002", { tenantId: "otro", googleSub: "due2", estado: "verificado" });
    control.waPrefs.set("otro:due2", { optIn: true, avisoHora: "08:00", pausadoHastaMs: null });
    const res = (await POSTBot(conSecret())) as Response;
    const j = (await res.json()) as { resultados: Array<{ tenant_id: string }> };
    expect(j.resultados.map((r) => r.tenant_id)).toEqual(["slice0"]);
  });

  it("con secret y sin credenciales Cloud API registra fallo y no marca enviado", async () => {
    const res = (await POSTBot(
      ctx("http://x/api/jobs/bot-quiosco", { method: "POST", headers: { "X-Job-Secret": SECRET } }),
    )) as Response;
    expect(res.status).toBe(200);
    const j = (await res.json()) as {
      fecha: string;
      resultados: Array<{ tenant_id: string; estado: string; secciones: string[] }>;
    };
    expect(j.fecha).toBe(hoy);
    expect(j.resultados).toHaveLength(1);
    expect(j.resultados[0]).toMatchObject({ tenant_id: "slice0", estado: "fallo", secciones: ["vencimientos"] });
    expect(store.waEnviados.size).toBe(0);
  });
});
