import { beforeEach, describe, expect, it } from "vitest";
import { POST as POSTSugerir, limpiar_vistos_notif } from "../src/pages/api/payment-orders/sugerir-desde-notif.js";
import { matchear_notif, parsear_notif_bancaria } from "../src/modules/payments/notifs-bancarias.js";
import type { PaymentOrder } from "../src/modules/payments/ordenes.js";
import { resetStore, store } from "../src/lib/store.js";

const DIA = 86_400_000;
const HOY = "2026-10-10";
const hoyMs = Date.parse(`${HOY}T12:00:00Z`);

function orden(id: string, numero: string, venceMs: number, monto = 4800000n, estado: PaymentOrder["estado"] = "preparada"): PaymentOrder {
  return {
    id, numero, payeeId: "pay-1", tipo: "proveedor", concepto: `Concepto ${numero}`,
    montoCentavos: monto, venceElMs: venceMs, medioSugerido: "Transferencia",
    instruccion: "transferencia", categoria: "pago_proveedores", estado,
    version: 1, idempotencyKey: `k-${id}`, eventos: [],
  };
}

beforeEach(() => {
  resetStore();
  limpiar_vistos_notif();
  store.paymentOrders.set("o-hoy", orden("o-hoy", "OP-1", hoyMs));
  store.paymentOrders.set("o-manana", orden("o-manana", "OP-2", hoyMs + DIA));
  store.paymentOrders.set("o-otro-monto", orden("o-otro-monto", "OP-3", hoyMs, 100n));
  store.paymentOrders.set("o-lejos", orden("o-lejos", "OP-4", hoyMs + 10 * DIA));
  store.paymentOrders.set("o-pagada", orden("o-pagada", "OP-5", hoyMs, 4800000n, "pagada"));
});

function post(body: unknown) {
  return POSTSugerir({
    request: new Request("http://x/api/payment-orders/sugerir-desde-notif", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  } as never) as Promise<Response>;
}

describe("OP10 parseo de notificacion bancaria", () => {
  it("extrae banco, monto AR, fecha y referencia", () => {
    const r = parsear_notif_bancaria(
      "Banco Galicia: recibiste una transferencia de $ 48.000 el 10/10/2026. Nro operacion 123456",
      HOY,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.notif.banco).toBe("galicia");
    expect(r.notif.montoCentavos).toBe(4800000n);
    expect(r.notif.fechaIso).toBe("2026-10-10");
    expect(r.notif.referencia).toBe("123456");
  });

  it("entiende hoy y ayer", () => {
    const hoy = parsear_notif_bancaria("Te pagaron $ 1.000 hoy", HOY);
    expect(hoy.ok && hoy.notif.fechaIso).toBe(HOY);
    const ayer = parsear_notif_bancaria("Te pagaron $ 1.000 ayer", HOY);
    expect(ayer.ok && ayer.notif.fechaIso).toBe("2026-10-09");
  });

  it("rechaza secretos, 16 digitos, sin monto y sin fecha", () => {
    expect(parsear_notif_bancaria("tu token es abc pagaste $ 5", HOY).ok).toBe(false);
    expect(parsear_notif_bancaria("Nro operacion 1234567890123456 pagaste $ 5 el 10/10/2026", HOY).ok).toBe(false);
    expect(parsear_notif_bancaria("hola mundo el 10/10/2026", HOY).ok).toBe(false);
    expect(parsear_notif_bancaria("pagaste $ 5 sin fecha clara", HOY).ok).toBe(false);
  });
});

describe("OP10 sugerencia desde notif (solo sugiere, nunca paga)", () => {
  const TEXTO = "Banco Galicia: pagaste $ 48.000 el 10/10/2026";

  it("matchea monto exacto ±2 dias, mismo dia primero; excluye resto", async () => {
    const res = await post({ texto: TEXTO, notif_id: "n1", hoy_iso: HOY });
    expect(res.status).toBe(200);
    const j = (await res.json()) as {
      notif: Record<string, string | null>;
      candidatos: Array<{ orderId: string; motivo: string }>;
      evaluadas: number;
    };
    expect(j.notif).toMatchObject({ banco: "galicia", monto_centavos: "4800000", fecha_iso: HOY });
    expect(j.candidatos.map((c) => c.orderId)).toEqual(["o-hoy", "o-manana"]);
    expect(j.candidatos[0]?.motivo).toContain("mismo día");
    // Solo preparada|vencida se evalúan (la pagada no).
    expect(j.evaluadas).toBe(4);
  });

  it("reintento misma clave es 409 con el original y no muta nada", async () => {
    const foto = (): string =>
      JSON.stringify({
        orders: [...store.paymentOrders.values()].map((o) => [o.id, o.estado, o.version]),
        movs: store.movements.length,
      });
    const antes = foto();
    const r1 = await post({ texto: TEXTO, notif_id: "n-dup", hoy_iso: HOY });
    expect(r1.status).toBe(200);
    const j1 = await r1.json();
    const r2 = await post({ texto: "otro texto distinto", notif_id: "n-dup", hoy_iso: HOY });
    expect(r2.status).toBe(409);
    const j2 = (await r2.json()) as { original: unknown };
    expect(j2.original).toEqual(j1);
    expect(store.paymentOrders.get("o-hoy")?.estado).toBe("preparada");
    expect(store.paymentOrders.get("o-hoy")?.version).toBe(1);
    expect(foto()).toBe(antes);
  });

  it("422 con cuerpo invalido o texto sin datos", async () => {
    expect((await post({})).status).toBe(422);
    expect((await post({ texto: "", notif_id: "x" })).status).toBe(422);
    expect((await post({ texto: "hola sin datos", notif_id: "x", hoy_iso: HOY })).status).toBe(422);
    expect((await post({ texto: TEXTO, notif_id: "x", ventana_dias: 99 })).status).toBe(422);
  });

  it("matching puro respeta ventana configurable", () => {
    const p = parsear_notif_bancaria(TEXTO, HOY);
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    const ordenes = [...store.paymentOrders.values()];
    expect(matchear_notif(p.notif, ordenes, 0).candidatos.map((c) => c.orderId)).toEqual(["o-hoy"]);
    expect(matchear_notif(p.notif, ordenes, 2).candidatos.map((c) => c.orderId)).toEqual(["o-hoy", "o-manana"]);
  });
});
