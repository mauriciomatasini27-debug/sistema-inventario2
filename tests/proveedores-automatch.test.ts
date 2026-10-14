import { beforeEach, describe, expect, it } from "vitest";
import { ctx } from "./helpers/ctx.js";
import { POST as POSTOrder } from "../src/pages/api/purchase-orders.js";
import { POST as POSTDraft } from "../src/pages/api/supplier-invoices/drafts.js";
import { POST as POSTConfirm } from "../src/pages/api/supplier-invoices/drafts/confirm.js";
import { vincular_auto } from "../src/modules/purchases/matching.js";
import { resetStore, store } from "../src/lib/store.js";

const CUIT = "20-93333172-6";
// 10 x 1.648.000 = 16.480.000 centavos ($ 164.800,00).
const LINEAS = [{ sku: "yerba", qty: 10, costo_centavos: 1648000 }];

beforeEach(() => resetStore());

function req(url: string, key: string | null, body: unknown) {
  return ctx(url, {
    method: "POST",
    headers: key !== null ? { "Idempotency-Key": key } : {},
    body: body as Record<string, unknown>,
  });
}

async function crearOC(key: string, lineas = LINEAS, cuit = CUIT) {
  const res = await POSTOrder(
    req("http://x/api/purchase-orders", key, { supplier_cuit: cuit, lineas, creado_por: "d" }),
  );
  expect(res.status).toBe(201);
  return ((await res.json()) as { order_id: string }).order_id;
}

async function ingerir(key: string, totalTexto: string) {
  const res = await POSTDraft(
    req("http://x/api/supplier-invoices/drafts", key, {
      origen: "gmail",
      bytes_ref: `bytes-${key}`,
      es_comprobante: true,
      cuit_texto: CUIT,
      fecha_texto: "10/10/2026",
      total_texto: totalTexto,
    }),
  );
  expect(res.status).toBe(201);
  return ((await res.json()) as { draft_id: string }).draft_id;
}

async function confirmar(draftId: string) {
  const res = await POSTConfirm(
    req("http://x/api/supplier-invoices/drafts/confirm", null, { draft_id: draftId, quien: "d" }),
  );
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

describe("matching automatico pedido-factura al confirmar", () => {
  it("1 match exacto vincula, cierra la OC y deja log auditable", async () => {
    const oc = await crearOC("oc-1");
    const draft = await ingerir("br-1", "164.800,00");
    const { status, json } = await confirmar(draft);
    expect(status).toBe(201);
    expect(json["vinculo"]).toEqual({ order_id: oc });
    expect(json["match_intentos"]).toBe(1);
    expect(store.purchaseOrders.get(oc)?.estado).toBe("cerrada");
    const filas = store.supplierMatchLog.filter((e) => e.draftId === `borr-br-1`);
    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({ orderId: oc, coincide: true, motivo: "auto-exacto: OC cerrada al confirmar" });
  });

  it("monto fuera de tolerancia no vincula ni cierra, pero loguea", async () => {
    const oc = await crearOC("oc-2");
    const draft = await ingerir("br-2", "100,00");
    const { status, json } = await confirmar(draft);
    expect(status).toBe(201);
    expect(json["vinculo"]).toBeNull();
    expect(store.purchaseOrders.get(oc)?.estado).toBe("abierta");
    const filas = store.supplierMatchLog.filter((e) => e.draftId === "borr-br-2");
    expect(filas).toHaveLength(1);
    expect(filas[0]?.coincide).toBe(false);
  });

  it("2 exactos no vinculan (requiere eleccion manual) y nada se cierra", async () => {
    const oc1 = await crearOC("oc-3a");
    const oc2 = await crearOC("oc-3b");
    const draft = await ingerir("br-3", "164.800,00");
    const { status, json } = await confirmar(draft);
    expect(status).toBe(201);
    expect(json["vinculo"]).toBeNull();
    expect(String(json["vinculo_motivo"])).toContain("elegir manual");
    expect(store.purchaseOrders.get(oc1)?.estado).toBe("abierta");
    expect(store.purchaseOrders.get(oc2)?.estado).toBe("abierta");
  });

  it("sin OCs informa sin candidata", async () => {
    const draft = await ingerir("br-4", "164.800,00");
    const { status, json } = await confirmar(draft);
    expect(status).toBe(201);
    expect(json["vinculo"]).toBeNull();
    expect(json["vinculo_motivo"]).toBe("sin orden candidata");
    expect(json["match_intentos"]).toBe(0);
  });

  it("en tolerancia pero no exacto no vincula (puro)", () => {
    const r = vincular_auto({
      draftId: "d",
      cuit: CUIT,
      totalCentavos: 16_400_000n,
      ordenes: [{ id: "oc", supplierCuit: CUIT, estado: "abierta", totalCentavos: 16_480_000n }],
      ahoraIso: new Date().toISOString(),
    });
    expect(r.vinculado).toBeNull();
    expect(r.motivo).toContain("sin match exacto");
  });
});
