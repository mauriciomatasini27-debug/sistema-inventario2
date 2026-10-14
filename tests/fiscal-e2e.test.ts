import { beforeEach, describe, expect, it } from "vitest";
import { ctx } from "./helpers/ctx.js";
import { POST } from "../src/pages/api/sales.js";
import { GET } from "../src/pages/api/fiscal/documents.js";
import { resetStore, store } from "../src/lib/store.js";
import { crear_homo_fake } from "../src/modules/fiscal/homo-fake.js";
import { procesar_pendiente } from "../src/modules/fiscal/worker.js";

function req_venta(key: string, seq: number, over: Record<string, unknown> = {}): Request {
  return new Request("http://localhost/api/sales", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": key },
    body: JSON.stringify({
      lineas: [{ product_id: "demo-sku-1", qty: 1, precio_centavos: 266000 }],
      medio: "Efectivo",
      device_code: "MOST-01",
      seq_local: seq,
      client_occurred_at: new Date().toISOString(),
      offline: false,
      ...over,
    }),
  });
}

async function vender(key: string, seq: number, over: Record<string, unknown> = {}) {
  const res = await POST({ request: req_venta(key, seq, over) } as never);
  const json = (await res.json()) as Record<string, unknown>;
  return { status: res.status, json };
}

describe("fiscal E2E slice homo (ADR-0019)", () => {
  beforeEach(() => resetStore());

  it("venta $2.660 crea pendiente y worker autoriza con CAE+QR", async () => {
    const { status, json } = await vender("e2e-1", 1);
    expect(status).toBe(201);
    expect(json["fiscal_estado"]).toBe("pendiente");
    const saleId = json["sale_id"] as string;

    const fkey = [...store.fiscalDocs.keys()][0]!;
    const doc = store.fiscalDocs.get(fkey)!;
    const provider = crear_homo_fake();
    const r = await procesar_pendiente({ doc, lastNumber: 0, totalCentavos: 266000n, cuit: 20933331726, provider });
    expect(r.doc.estado).toBe("autorizado");
    expect(r.doc.cbte_nro).toBe(1);
    expect(r.doc.cae?.length).toBe(14);
    expect(r.doc.qr_payload?.startsWith("https://www.arca.gob.ar/fe/qr/?p=")).toBe(true);
    const payload = JSON.parse(Buffer.from(r.doc.qr_payload!.split("?p=")[1]!, "base64").toString("utf-8")) as Record<string, unknown>;
    expect(payload["codAut"]).toBe(r.doc.cae);
    store.fiscalDocs.set(fkey, r.doc);
    store.fiscalLastNumber = r.lastNumber;

    const g = await GET(ctx(`http://localhost/api/fiscal/documents?sale_id=${saleId}`));
    const gd = (await g.json()) as { docs: Array<{ estado: string }> };
    expect(gd.docs[0]?.estado).toBe("autorizado");
  });

  it("doble POST misma key da 409 y una sola factura", async () => {
    const k = "e2e-doble";
    const r1 = await vender(k, 2);
    expect(r1.status).toBe(201);
    const r2 = await vender(k, 2);
    expect(r2.status).toBe(409);
    expect(store.fiscalDocs.size).toBe(1);
  });

  it("timeout tras enviar recupera por consulta sin duplicar", async () => {
    const { json } = await vender("e2e-timeout", 3);
    void json;
    const fkey = [...store.fiscalDocs.keys()][0]!;
    const doc = store.fiscalDocs.get(fkey)!;
    const provider = crear_homo_fake();
    await provider.autorizar_c(
      { cbteTipo: 11, ptoVta: 3, cbteDesde: 1, cbteHasta: 1, cbteFch: doc.cbte_fch, concepto: 1, docTipo: 99, docNro: 0n, condIvaReceptor: 5, impTotal: 266000n, impNeto: 266000n, monId: "PES", monCotiz: 1 },
      "20933331726",
    );
    const flaky = { ...provider, autorizar_c: async (): Promise<never> => { throw new Error("timeout"); } };
    const r = await procesar_pendiente({ doc, lastNumber: 0, totalCentavos: 266000n, cuit: 20933331726, provider: flaky as never });
    expect(r.doc.estado).toBe("autorizado");
    expect(r.doc.cbte_nro).toBe(1);
    expect(r.lastNumber).toBe(1);
  });

  it("venta con CUIT guarda receptor 80 y autoriza", async () => {
    const { status, json } = await vender("e2e-cuit", 4, {
      fiscal_receptor_cuit: "20-93333172-6",
      fiscal_cond_iva_receptor: 5,
    });
    expect(status).toBe(201);
    expect(json["fiscal_estado"]).toBe("pendiente");
    const fkey = [...store.fiscalDocs.keys()].at(-1)!;
    const doc = store.fiscalDocs.get(fkey)!;
    expect(doc.doc_tipo).toBe("80");
    expect(doc.doc_nro).toBe("20933331726");
    const provider = crear_homo_fake();
    const r = await procesar_pendiente({ doc, lastNumber: 0, totalCentavos: 266000n, cuit: 20933331726, provider });
    expect(r.doc.estado).toBe("autorizado");
  });

  it("venta online $10M sin DNI se rechaza sin persistir", async () => {
    const lineas = [
      { product_id: "demo-sku-1", qty: 1, precio_centavos: 500000000 },
      { product_id: "demo-sku-1", qty: 1, precio_centavos: 500000000 },
    ];
    const { status } = await vender("e2e-umbral", 5, { lineas });
    expect(status).toBe(422);
    expect(store.fiscalDocs.size).toBe(0);
    expect(store.idempotency.size).toBe(0);
  });

  it("venta offline $10M sin DNI queda en espera (doc guardado en bandeja)", async () => {
    const lineas = [
      { product_id: "demo-sku-1", qty: 1, precio_centavos: 500000000 },
      { product_id: "demo-sku-1", qty: 1, precio_centavos: 500000000 },
    ];
    const { status, json } = await vender("e2e-off-umbral", 6, { lineas, offline: true });
    expect(status).toBe(201);
    expect(json["fiscal_estado"]).toBe("en_espera_de_datos");
    expect(store.fiscalDocs.size).toBe(1);
    expect([...store.fiscalDocs.values()][0]!.estado).toBe("en_espera_de_datos");
  });

  it("venta con CUIT inválido se rechaza sin persistir", async () => {
    const { status } = await vender("e2e-cuit-mal", 7, {
      fiscal_receptor_cuit: "20933331725",
      fiscal_cond_iva_receptor: 5,
    });
    expect(status).toBe(422);
    expect(store.fiscalDocs.size).toBe(0);
  });

  it("10 ventas mismo PV numeran 1..10 sin huecos", async () => {
    const provider = crear_homo_fake();
    let last = 0;
    for (let i = 0; i < 10; i++) {
      const { status } = await vender(`e2e-bulk-${i}`, 10 + i);
      expect(status).toBe(201);
      const fkey = [...store.fiscalDocs.keys()].at(-1)!;
      const doc = store.fiscalDocs.get(fkey)!;
      const r = await procesar_pendiente({ doc, lastNumber: last, totalCentavos: 266000n, cuit: 20933331726, provider });
      expect(r.doc.cbte_nro).toBe(last + 1);
      store.fiscalDocs.set(fkey, r.doc);
      last = r.lastNumber;
    }
    expect(last).toBe(10);
    const nros = [...store.fiscalDocs.values()].map((d) => d.cbte_nro).sort((a, b) => (a ?? 0) - (b ?? 0));
    expect(nros).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });
});
