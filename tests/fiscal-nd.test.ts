import { beforeEach, describe, expect, it } from "vitest";
import { clase_nd_desde_factura, idempotency_key_for_nd } from "../src/modules/fiscal/fiscal.js";
import { decidir_nd } from "../src/modules/fiscal/nd.js";
import { crear_homo_fake } from "../src/modules/fiscal/homo-fake.js";
import { procesar_pendiente } from "../src/modules/fiscal/worker.js";
import { POST as POST_ND } from "../src/pages/api/fiscal/nd.js";
import { POST as POST_SALES } from "../src/pages/api/sales.js";
import { resetStore, store } from "../src/lib/store.js";

async function vender(key: string, seq: number) {
  const req = new Request("http://localhost/api/sales", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": key },
    body: JSON.stringify({
      lineas: [{ product_id: "demo-sku-1", qty: 1, precio_centavos: 266000 }],
      medio: "Efectivo",
      device_code: "MOST-01",
      seq_local: seq,
      client_occurred_at: new Date().toISOString(),
      offline: false,
    }),
  });
  const res = await POST_SALES({ request: req } as never);
  return (await res.json()) as Record<string, unknown>;
}

describe("fiscal ND manual (FE-S16)", () => {
  beforeEach(() => resetStore());

  it("mapea clase factura a ND", () => {
    expect(clase_nd_desde_factura(11)).toBe(12);
    expect(clase_nd_desde_factura(6)).toBe(7);
    expect(clase_nd_desde_factura(1)).toBe(2);
    expect(clase_nd_desde_factura(99)).toBeNull();
    expect(idempotency_key_for_nd("n1", 12)).toBe("nd:n1:12");
  });

  it("decide: sin factura, espera-cae, falta-caja", () => {
    expect(decidir_nd(null, { huboCobro: false, tieneCajaAsociada: false }).decision).toBe("sin-factura");
    expect(
      decidir_nd({ cbteTipo: 11, ptoVta: 3, cbteNro: null, estado: "pendiente" }, { huboCobro: false, tieneCajaAsociada: false }).decision,
    ).toBe("esperar-cae");
    expect(
      decidir_nd({ cbteTipo: 11, ptoVta: 3, cbteNro: 124, estado: "autorizado" }, { huboCobro: true, tieneCajaAsociada: false }).decision,
    ).toBe("falta-caja");
    const ok = decidir_nd({ cbteTipo: 11, ptoVta: 3, cbteNro: 124, estado: "autorizado" }, { huboCobro: true, tieneCajaAsociada: true });
    expect(ok.decision).toBe("emitir-nd");
  });

  it("empleado no puede emitir ND (403)", async () => {
    const v = await vender("nd-v1", 51);
    const saleId = v["sale_id"] as string;
    const req = new Request("http://localhost/api/fiscal/nd", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": "nd-k1", "X-Rol": "empleado" },
      body: JSON.stringify({ factura_sale_id: saleId, monto_centavos: 50000, motivo: "ajuste", actor: "empleado", client_occurred_at: new Date().toISOString() }),
    });
    const res = await POST_ND({ request: req } as never);
    expect(res.status).toBe(403);
  });

  it("dueño emite ND pendiente con CbtesAsoc y autoriza", async () => {
    const v = await vender("nd-v2", 52);
    const saleId = v["sale_id"] as string;
    // autoriza factura primero
    const fkey = [...store.fiscalDocs.keys()].find((k) => store.fiscalDocs.get(k)!.sale_id === saleId)!;
    const doc = store.fiscalDocs.get(fkey)!;
    const r = await procesar_pendiente({ doc, lastNumber: 100, totalCentavos: 266000n, cuit: 20933331726, provider: crear_homo_fake() });
    store.fiscalDocs.set(fkey, r.doc);
    const cajaId = [...store.movements].find((m) => m.sale_id === saleId)?.id ?? "caja-1";
    const req = new Request("http://localhost/api/fiscal/nd", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": "nd-k2" },
      body: JSON.stringify({ factura_sale_id: saleId, monto_centavos: 50000, motivo: "intereses", actor: "dueno", caja_movement_id: cajaId, client_occurred_at: new Date().toISOString() }),
    });
    const res = await POST_ND({ request: req } as never);
    expect(res.status).toBe(201);
    const json = (await res.json()) as Record<string, unknown>;
    expect(json["nd_tipo"]).toBe(12);
    const nd = [...store.fiscalDocs.values()].find((d) => d.cbte_tipo === "12")!;
    expect(nd.cbtes_asoc_nro).not.toBeNull();
    const ra = await procesar_pendiente({ doc: nd, lastNumber: 200, totalCentavos: 50000n, cuit: 20933331726, provider: crear_homo_fake() });
    expect(ra.doc.estado).toBe("autorizado");
  });
});
