import { describe, expect, it } from "vitest";
import { crear_homo_fake } from "../src/modules/fiscal/homo-fake.js";
import { procesar_pendiente } from "../src/modules/fiscal/worker.js";
import type { StoredFiscalDoc } from "../src/lib/store.js";

function pendiente(): StoredFiscalDoc {
  return {
    id: "d1",
    idempotency_key: "sale:s1:11",
    sale_id: "s1",
    cbte_tipo: "11",
    pto_vta: "3",
    cbte_nro: null,
    cbte_fch: "20261010",
    doc_tipo: "99",
    doc_nro: "0",
    cond_iva_receptor: "5",
    estado: "pendiente",
    cae: null,
    cae_vto: null,
    qr_payload: null,
  };
}

describe("fiscal worker slice", () => {
  it("autoriza y numera correlativo con QR", async () => {
    const provider = crear_homo_fake();
    const r1 = await procesar_pendiente({ doc: pendiente(), lastNumber: 124, totalCentavos: 266000n, cuit: 20933331726, provider });
    expect(r1.doc.estado).toBe("autorizado");
    expect(r1.doc.cbte_nro).toBe(125);
    expect(r1.doc.cae?.length).toBe(14);
    expect(r1.doc.qr_payload?.startsWith("https://www.arca.gob.ar/fe/qr/?p=")).toBe(true);
    expect(r1.lastNumber).toBe(125);
  });

  it("timeout con CAE ya emitido recupera sin duplicar", async () => {
    const provider = crear_homo_fake();
    const flaky = { ...provider, autorizar_c: async () => { throw new Error("timeout"); } };
    await provider.autorizar_c({ cbteTipo: 11, ptoVta: 3, cbteDesde: 125, cbteHasta: 125, cbteFch: "20261010", concepto: 1, docTipo: 99, docNro: 0n, condIvaReceptor: 5, impTotal: 100n, impNeto: 100n, monId: "PES", monCotiz: 1 } as never, "20933331726");
    const r = await procesar_pendiente({ doc: pendiente(), lastNumber: 124, totalCentavos: 100n, cuit: 20933331726, provider: flaky as never });
    expect(r.doc.estado).toBe("autorizado");
    expect(r.doc.cbte_nro).toBe(125);
  });

  it("doc con CUIT autoriza con receptor 80", async () => {
    const provider = crear_homo_fake();
    const r = await procesar_pendiente({
      doc: { ...pendiente(), doc_tipo: "80", doc_nro: "20933331726", cond_iva_receptor: "5" },
      lastNumber: 124,
      totalCentavos: 80000n,
      cuit: 20933331726,
      provider,
    });
    expect(r.doc.estado).toBe("autorizado");
    expect(r.doc.cbte_nro).toBe(125);
  });

  it("total inválido rechaza sin consumir número", async () => {
    const provider = crear_homo_fake();
    const r = await procesar_pendiente({ doc: pendiente(), lastNumber: 124, totalCentavos: 0n, cuit: 20933331726, provider });
    expect(r.doc.estado).toBe("rechazado");
    expect(r.lastNumber).toBe(124);
  });
});
