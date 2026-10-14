import { beforeEach, describe, expect, it } from "vitest";
import { ctx } from "./helpers/ctx.js";
import { armar_pedido_b, determinar_clase } from "../src/modules/fiscal/fiscal.js";
import { desagregar_iva_21 } from "../src/modules/fiscal/iva.js";
import { crear_homo_fake } from "../src/modules/fiscal/homo-fake.js";
import { procesar_pendiente } from "../src/modules/fiscal/worker.js";
import { POST } from "../src/pages/api/sales.js";
import { resetStore, store } from "../src/lib/store.js";

function req_venta(key: string, seq: number, over: Record<string, unknown> = {}) {
  return ctx("http://localhost/api/sales", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": key },
    body: {
      lineas: [{ product_id: "demo-sku-1", qty: 1, precio_centavos: 12100 }],
      medio: "Efectivo",
      device_code: "MOST-01",
      seq_local: seq,
      client_occurred_at: new Date().toISOString(),
      offline: false,
      ...over,
    },
  });
}

const RI_ETAPA3 = { fiscal_emisor_condicion: "responsable_inscripto", fiscal_emisor_etapa: 3 } as const;
const CUIT_RI = { fiscal_receptor_cuit: "20-93333172-6", fiscal_cond_iva_receptor: 1 } as const;

describe("fiscal A (FE-E2 etapa 3)", () => {
  beforeEach(() => resetStore());

  it("clase: RI→RI etapa 3 es A, etapa 2 sigue null", () => {
    expect(determinar_clase("responsable_inscripto", "responsable_inscripto", 3)).toBe(1);
    expect(determinar_clase("responsable_inscripto", "responsable_inscripto", 2)).toBeNull();
    expect(determinar_clase("responsable_inscripto", "consumidor_final", 3)).toBe(6);
    expect(determinar_clase("monotributo", "responsable_inscripto", 3)).toBe(11);
  });

  it("pedido A exige CUIT, rechaza CF", () => {
    const base = { totalCentavos: 12100n, ptoVta: 3, cbteNro: 1, cbteFch: "20261010", condIvaReceptor: 1, impNetoCentavos: 10000n, impIvaCentavos: 2100n, alicId: 5 } as const;
    const ok = armar_pedido_b({ ...base, cbteTipo: 1, docTipo: 80, docNro: "20933331726" });
    expect(ok?.cbteTipo).toBe(1);
    expect(ok?.docNro).toBe(20933331726n);
    expect(armar_pedido_b({ ...base, cbteTipo: 1, docTipo: 99, docNro: "0" })).toBeNull();
    // ND-A (2) ahora válido con CUIT (FE-S16); tipo 4 sigue inválido.
    expect(armar_pedido_b({ ...base, cbteTipo: 2, docTipo: 80, docNro: "20933331726" })?.cbteTipo).toBe(2);
    expect(armar_pedido_b({ ...base, cbteTipo: 4 as never, docTipo: 80, docNro: "20933331726" })).toBeNull();
  });

  it("worker autoriza A con QR tipo 1", async () => {
    const provider = crear_homo_fake();
    const d = desagregar_iva_21(12100n)!;
    const r = await procesar_pendiente({
      doc: {
        id: "a1", idempotency_key: "sale:sa:1", sale_id: "sa", cbte_tipo: "1", pto_vta: "3",
        cbte_nro: null, cbte_fch: "20261010", doc_tipo: "80", doc_nro: "20933331726", cond_iva_receptor: "1",
        estado: "pendiente", cae: null, cae_vto: null, qr_payload: null,
        imp_iva_centavos: d.impIvaCentavos.toString(), alic_iva_id: "5",
      },
      lastNumber: 60,
      totalCentavos: 12100n,
      cuit: 20933331726,
      provider,
    });
    expect(r.doc.estado).toBe("autorizado");
    expect(r.doc.cbte_nro).toBe(61);
    const payload = JSON.parse(Buffer.from(r.doc.qr_payload!.split("?p=")[1]!, "base64").toString("utf-8")) as Record<string, unknown>;
    expect(payload["tipoCmp"]).toBe(1);
  });

  it("venta RI etapa 3 con CUIT RI crea pendiente A con IVA", async () => {
    const res = await POST(req_venta("a-online", 31, { ...RI_ETAPA3, ...CUIT_RI }));
    const json = (await res.json()) as Record<string, unknown>;
    expect(res.status).toBe(201);
    expect(json["fiscal_estado"]).toBe("pendiente");
    const doc = [...store.fiscalDocs.values()].at(-1)!;
    expect(doc.cbte_tipo).toBe("1");
    expect(doc.doc_tipo).toBe("80");
    expect(doc.imp_iva_centavos).not.toBeNull();
  });

  it("venta RI etapa 3 sin CUIT online es B a CF (no A)", async () => {
    const res = await POST(req_venta("a-sin-cuit", 32, { ...RI_ETAPA3 }));
    const json = (await res.json()) as Record<string, unknown>;
    expect(res.status).toBe(201);
    expect(json["fiscal_estado"]).toBe("pendiente");
    expect([...store.fiscalDocs.values()].at(-1)!.cbte_tipo).toBe("6");
  });

  it("venta RI etapa 3 con CUIT no-RI online rechaza sin persistir", async () => {
    const res = await POST(
      req_venta("a-cuit-no-ri", 33, {
        ...RI_ETAPA3,
        fiscal_receptor_cuit: "20-93333172-6",
        fiscal_cond_iva_receptor: 6,
      }),
    );
    expect(res.status).toBe(422);
    expect(store.fiscalDocs.size).toBe(0);
    expect(store.idempotency.size).toBe(0);
  });

  it("venta RI etapa 3 con CUIT no-RI offline queda en espera", async () => {
    const res = await POST(
      req_venta("a-off-espera", 34, {
        ...RI_ETAPA3,
        fiscal_receptor_cuit: "20-93333172-6",
        fiscal_cond_iva_receptor: 6,
        offline: true,
      }),
    );
    const json = (await res.json()) as Record<string, unknown>;
    expect(res.status).toBe(201);
    expect(json["fiscal_estado"]).toBe("en_espera_de_datos");
    expect([...store.fiscalDocs.values()].at(-1)!.estado).toBe("en_espera_de_datos");
  });

  it("venta RI etapa 3 offline con CUIT crea pendiente_de_sync A", async () => {
    const res = await POST(req_venta("a-off", 35, { ...RI_ETAPA3, ...CUIT_RI, offline: true }));
    const json = (await res.json()) as Record<string, unknown>;
    expect(res.status).toBe(201);
    expect(json["fiscal_estado"]).toBe("pendiente_de_sync");
    expect([...store.fiscalDocs.values()].at(-1)!.cbte_tipo).toBe("1");
  });
});
