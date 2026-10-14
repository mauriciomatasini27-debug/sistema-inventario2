import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { POST as POSTVenc } from "../src/pages/api/jobs/vencimientos-servicios.js";
import { ejecutar_vencimientos_servicios } from "../src/jobs/vencimientos-servicios.js";
import { fechaAR, sumarDiasAR } from "../src/lib/fecha-ar.js";
import type { PaymentOrder } from "../src/modules/payments/ordenes.js";
import { control, resetStore, store } from "../src/lib/store.js";

const SECRET = "test-secret-jobs";
const DIA = 86_400_000;

const hoyMs = Date.now();
const hoyIso = fechaAR(new Date(hoyMs));
const isoDias = (d: number): string => sumarDiasAR(hoyIso, d);

function orden(id: string, numero: string, venceMs: number): PaymentOrder {
  return {
    id,
    numero,
    payeeId: "pay-1",
    tipo: "proveedor",
    concepto: `Concepto ${numero}`,
    montoCentavos: 100000n,
    venceElMs: venceMs,
    medioSugerido: "Transferencia",
    instruccion: "transferencia",
    categoria: "pago_proveedores",
    estado: "preparada",
    version: 1,
    idempotencyKey: `k-${id}`,
    eventos: [],
  };
}

function semilla(): void {
  resetStore();
  process.env.JOBS_SECRET = SECRET;
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
  store.utilityBills.set("b-vieja", { ...base, id: "b-vieja", messageId: "m3", vencimiento: isoDias(-40), montoCentavos: 100n });
  store.utilityBills.set("b-pagada", { ...base, id: "b-pagada", messageId: "m4", vencimiento: isoDias(2), montoCentavos: 100n, estado: "pagada" });
  store.paymentOrders.set("o-prox", orden("o-prox", "OP-1", hoyMs + 2 * DIA));
  store.paymentOrders.set("o-venc", orden("o-venc", "OP-2", hoyMs - DIA));
  store.paymentOrders.set("o-vieja", orden("o-vieja", "OP-3", hoyMs - 40 * DIA));
}

beforeEach(semilla);
afterAll(() => {
  delete process.env.JOBS_SECRET;
});

describe("CS12/OP11 recordatorios de vencimiento", () => {
  it("sin secret es 403", async () => {
    const res = (await POSTVenc({ request: new Request("http://x/api/jobs/vencimientos", { method: "POST" }) } as never)) as Response;
    expect(res.status).toBe(403);
  });

  it("marca vencidas sin importar el envio; sin credenciales todo es fallo sin quemar idempotencia", async () => {
    const res = (await POSTVenc({
      request: new Request("http://x/api/jobs/vencimientos", { method: "POST", headers: { "X-Job-Secret": SECRET } }),
    } as never)) as Response;
    expect(res.status).toBe(200);
    const j = (await res.json()) as {
      resultados: Array<{ tenant_id: string; vencidas_marcadas: string[]; recordatorios: Array<{ tipo: string; estado: string }>; sugerencias: unknown[] }>;
    };
    expect(j.resultados).toHaveLength(1);
    const r = j.resultados[0];
    expect(r?.vencidas_marcadas).toEqual(expect.arrayContaining(["o-venc", "o-vieja"]));
    const tipos = (r?.recordatorios ?? []).map((x) => x.tipo).sort();
    expect(tipos).toEqual(["orden_proxima", "orden_vencida", "servicio_proximo", "servicio_vencido"]);
    expect(new Set((r?.recordatorios ?? []).map((x) => x.estado))).toEqual(new Set(["fallo"]));
    expect(store.waEnviados.size).toBe(0);
    expect((r?.sugerencias ?? []).length).toBeGreaterThan(0);
    // La marca persiste aunque el aviso falle.
    expect(store.paymentOrders.get("o-venc")?.estado).toBe("vencida");
    expect(store.paymentOrders.get("o-vieja")?.estado).toBe("vencida");
    expect(store.paymentOrders.get("o-prox")?.estado).toBe("preparada");
  });

  it("job puro: envia una vez por dia, reintento es duplicado", () => {
    const ya = new Set<string>();
    const enviados: string[] = [];
    const args = {
      comercio: { tenantId: "t1", nombreComercio: "Kiosco", prefs: { optIn: true, avisoHora: "08:00", pausadoHastaMs: null } },
      facturas: [...store.utilityBills.values()],
      ordenes: [...store.paymentOrders.values()],
      cuentas: new Map([["acc-luz", { proveedor: "Edenor", servicio: "luz" }]]),
      hoyIso,
      hoyMs,
      yaEnviados: ya,
      enviar: (t: string): boolean => {
        enviados.push(t);
        return true;
      },
    };
    const r1 = ejecutar_vencimientos_servicios(args);
    expect(r1.recordatorios.filter((x) => x.estado === "enviado")).toHaveLength(4);
    expect(enviados).toHaveLength(4);
    expect(enviados[0]).toContain("Edenor");
    const r2 = ejecutar_vencimientos_servicios({ ...args, ordenes: r1.ordenes });
    expect(r2.recordatorios.filter((x) => x.estado === "omitido_ya_enviado")).toHaveLength(4);
    expect(enviados).toHaveLength(4);
  });

  it("opt-out no envia nada y pausa se informa distinto", () => {
    let llamadas = 0;
    const base = {
      facturas: [...store.utilityBills.values()],
      ordenes: [...store.paymentOrders.values()],
      cuentas: new Map([["acc-luz", { proveedor: "Edenor", servicio: "luz" }]]),
      hoyIso,
      hoyMs,
      yaEnviados: new Set<string>(),
      enviar: (): boolean => {
        llamadas++;
        return true;
      },
    };
    const rOff = ejecutar_vencimientos_servicios({
      ...base,
      comercio: { tenantId: "t1", nombreComercio: "K", prefs: { optIn: false, avisoHora: "08:00", pausadoHastaMs: null } },
    });
    expect(llamadas).toBe(0);
    expect(new Set(rOff.recordatorios.map((x) => x.estado))).toEqual(new Set(["omitido_optout"]));
    const rPausa = ejecutar_vencimientos_servicios({
      ...base,
      comercio: { tenantId: "t1", nombreComercio: "K", prefs: { optIn: true, avisoHora: "08:00", pausadoHastaMs: hoyMs + DIA } },
    });
    expect(llamadas).toBe(0);
    expect(new Set(rPausa.recordatorios.map((x) => x.estado))).toEqual(new Set(["omitido_pausa"]));
  });
});
