import { beforeEach, describe, expect, it } from "vitest";
import { ctx } from "./helpers/ctx.js";
import {
  armar_pedido_b,
  armar_pedido_con_receptor,
  clase_nc_desde_factura,
  idempotency_key_for_return,
} from "../src/modules/fiscal/fiscal.js";
import { decidir_nc } from "../src/modules/fiscal/nc.js";
import { promover_nc_tras_cae } from "../src/modules/fiscal/sync-fiscal.js";
import { crear_homo_fake } from "../src/modules/fiscal/homo-fake.js";
import { procesar_pendiente } from "../src/modules/fiscal/worker.js";
import { POST as POST_SALES } from "../src/pages/api/sales.js";
import { POST as POST_RETURNS } from "../src/pages/api/returns.js";
import { resetStore, store } from "../src/lib/store.js";

async function vender(key: string, seq: number, over: Record<string, unknown> = {}) {
  const req = ctx("http://localhost/api/sales", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": key },
    body: {
      lineas: [{ product_id: "demo-sku-1", qty: 1, precio_centavos: 266000 }],
      medio: "Efectivo",
      device_code: "MOST-01",
      seq_local: seq,
      client_occurred_at: new Date().toISOString(),
      offline: false,
      ...over,
    },
  });
  const res = await POST_SALES(req);
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

async function devolver(key: string, saleId: string, monto: number, over: Record<string, unknown> = {}) {
  const req = ctx("http://localhost/api/returns", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": key },
    body: {
      sale_id: saleId,
      monto_centavos: monto,
      items: [{ product_id: "demo-sku-1", qty: 1 }],
      medio: "Efectivo",
      motivo: "cliente arrepentido",
      actor: "dueno",
      client_occurred_at: new Date().toISOString(),
      ...over,
    },
  });
  const res = await POST_RETURNS(req);
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

async function autorizarFactura(saleId: string, total: bigint, last: number) {
  const fkey = [...store.fiscalDocs.keys()].find((k) => {
    const d = store.fiscalDocs.get(k)!;
    return d.sale_id === saleId && (d.cbte_tipo === "11" || d.cbte_tipo === "6" || d.cbte_tipo === "1");
  })!;
  const doc = store.fiscalDocs.get(fkey)!;
  const r = await procesar_pendiente({ doc, lastNumber: last, totalCentavos: total, cuit: 20933331726, provider: crear_homo_fake() });
  store.fiscalDocs.set(fkey, r.doc);
  return r;
}

describe("fiscal NC (FE-S14/S15)", () => {
  beforeEach(() => resetStore());

  it("mapea clase factura a NC y keys por devolución", () => {
    expect(clase_nc_desde_factura(11)).toBe(13);
    expect(clase_nc_desde_factura(6)).toBe(8);
    expect(clase_nc_desde_factura(1)).toBe(3);
    expect(clase_nc_desde_factura(99)).toBeNull();
    expect(idempotency_key_for_return("r1", 13)).toBe("return:r1:13");
  });

  it("decide: sin factura solo interno, pendiente espera, tope bloquea", () => {
    expect(decidir_nc(null, 100n, 0n).decision).toBe("solo-interno");
    expect(
      decidir_nc({ cbteTipo: 11, ptoVta: 3, cbteNro: null, estado: "pendiente", impTotalCentavos: 266000n, docTipo: 99, docNro: "0", condIvaReceptor: 5 }, 100n, 0n).decision,
    ).toBe("esperar-cae");
    const emitir = decidir_nc(
      { cbteTipo: 11, ptoVta: 3, cbteNro: 124, estado: "autorizado", impTotalCentavos: 266000n, docTipo: 99, docNro: "0", condIvaReceptor: 5 },
      100000n,
      0n,
    );
    expect(emitir.decision).toBe("emitir-nc");
    if (emitir.decision === "emitir-nc") {
      expect(emitir.ncTipo).toBe(13);
      expect(emitir.cbtesAsoc).toEqual({ tipo: 11, ptoVta: 3, nro: 124 });
    }
    expect(
      decidir_nc(
        { cbteTipo: 6, ptoVta: 3, cbteNro: 10, estado: "autorizado", impTotalCentavos: 266000n, docTipo: 99, docNro: "0", condIvaReceptor: 5 },
        200000n,
        100000n,
      ).decision,
    ).toBe("tope-excedido");
  });

  it("pedidos NC: C sin IVA, B con IVA, A exige CUIT", () => {
    const c = armar_pedido_con_receptor({ saleId: "s", totalCentavos: 100n, ptoVta: 3, cbteNro: 1, cbteFch: "20261010", cbteTipo: 13, docTipo: 99, docNro: "0", condIvaReceptor: 5 });
    expect(c?.cbteTipo).toBe(13);
    const b = armar_pedido_b({ totalCentavos: 12100n, ptoVta: 3, cbteNro: 1, cbteFch: "20261010", docTipo: 99, docNro: "0", condIvaReceptor: 5, impNetoCentavos: 10000n, impIvaCentavos: 2100n, alicId: 5, cbteTipo: 8 });
    expect(b?.cbteTipo).toBe(8);
    expect(armar_pedido_b({ totalCentavos: 12100n, ptoVta: 3, cbteNro: 1, cbteFch: "20261010", docTipo: 99, docNro: "0", condIvaReceptor: 5, impNetoCentavos: 10000n, impIvaCentavos: 2100n, alicId: 5, cbteTipo: 3 })).toBeNull();
  });

  it("worker autoriza NC C con QR tipo 13", async () => {
    const r = await procesar_pendiente({
      doc: {
        id: "nc1", idempotency_key: "return:r1:13", sale_id: "s1", cbte_tipo: "13", pto_vta: "3",
        cbte_nro: null, cbte_fch: "20261010", doc_tipo: "99", doc_nro: "0", cond_iva_receptor: "5",
        estado: "pendiente", cae: null, cae_vto: null, qr_payload: null,
        return_id: "r1", cbtes_asoc_tipo: "11", cbtes_asoc_pto_vta: "3", cbtes_asoc_nro: 124,
      },
      lastNumber: 30,
      totalCentavos: 100000n,
      cuit: 20933331726,
      provider: crear_homo_fake(),
    });
    expect(r.doc.estado).toBe("autorizado");
    expect(r.doc.cbte_nro).toBe(31);
    const payload = JSON.parse(Buffer.from(r.doc.qr_payload!.split("?p=")[1]!, "base64").toString("utf-8")) as Record<string, unknown>;
    expect(payload["tipoCmp"]).toBe(13);
  });

  it("E2E: venta autorizada + devolución parcial crea NC pendiente y autoriza", async () => {
    const v = await vender("nc-e2e-1", 41);
    expect(v.status).toBe(201);
    const saleId = v.json["sale_id"] as string;
    await autorizarFactura(saleId, 266000n, 100);
    const d = await devolver("nc-dev-1", saleId, 100000);
    expect(d.status).toBe(201);
    expect(d.json["fiscal_estado"]).toBe("pendiente");
    expect(d.json["nc_tipo"]).toBe(13);
    const ncKey = [...store.fiscalDocs.keys()].find((k) => store.fiscalDocs.get(k)!.cbte_tipo === "13")!;
    const nc = store.fiscalDocs.get(ncKey)!;
    expect(nc.cbtes_asoc_nro).not.toBeNull();
    const r = await procesar_pendiente({ doc: nc, lastNumber: 200, totalCentavos: 100000n, cuit: 20933331726, provider: crear_homo_fake() });
    expect(r.doc.estado).toBe("autorizado");
  });

  it("E2E: devolución que supera la venta da 422 sin NC", async () => {
    const v = await vender("nc-e2e-2", 42);
    const saleId = v.json["sale_id"] as string;
    await autorizarFactura(saleId, 266000n, 100);
    const d = await devolver("nc-dev-2", saleId, 266001);
    expect(d.status).toBe(422);
    expect([...store.fiscalDocs.values()].filter((x) => x.cbte_tipo === "13").length).toBe(0);
  });

  it("E2E: factura pendiente → NC espera_cae, tras CAE se promueve y autoriza", async () => {
    const v = await vender("nc-e2e-3", 43);
    const saleId = v.json["sale_id"] as string;
    const d = await devolver("nc-dev-3", saleId, 50000);
    expect(d.status).toBe(201);
    expect(d.json["fiscal_estado"]).toBe("espera_cae");
    await autorizarFactura(saleId, 266000n, 100);
    const promovidos = promover_nc_tras_cae([...store.fiscalDocs.values()], saleId);
    for (const p of promovidos) store.fiscalDocs.set(p.idempotency_key, p);
    const nc = [...store.fiscalDocs.values()].find((x) => x.cbte_tipo === "13")!;
    expect(nc.estado).toBe("pendiente");
    expect(nc.cbtes_asoc_nro).not.toBeNull();
    const r = await procesar_pendiente({ doc: nc, lastNumber: 200, totalCentavos: 50000n, cuit: 20933331726, provider: crear_homo_fake() });
    expect(r.doc.estado).toBe("autorizado");
  });

  it("E2E: doble POST misma key da 409 y una sola NC", async () => {
    const v = await vender("nc-e2e-4", 44);
    const saleId = v.json["sale_id"] as string;
    await autorizarFactura(saleId, 266000n, 100);
    const r1 = await devolver("nc-doble", saleId, 50000);
    expect(r1.status).toBe(201);
    const r2 = await devolver("nc-doble", saleId, 50000);
    expect(r2.status).toBe(409);
    expect([...store.fiscalDocs.values()].filter((x) => x.cbte_tipo === "13").length).toBe(1);
  });
});
