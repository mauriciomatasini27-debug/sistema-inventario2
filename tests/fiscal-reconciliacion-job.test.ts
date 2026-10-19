import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ctx } from "./helpers/ctx.js";
import { resetStore, type StoredFiscalDoc } from "../src/lib/store.js";
import { POST as POSTReconciliacion } from "../src/pages/api/jobs/fiscal-reconciliacion.js";
import { asegurarDoc, buscarFiscalDocPorId } from "../src/lib/repos/fiscal.js";
import { puertoMemoria } from "../src/lib/fiscal-emitir.js";
import { ejecutarReconciliacionFiscal } from "../src/jobs/fiscal-reconciliacion.js";
import type { FiscalProvider } from "../src/modules/fiscal/fiscal.js";

const CUIT = 20123456789;

function proveedor(cae = "70412345678901"): FiscalProvider {
  return {
    async get_ta() {
      return { token: "t", sign: "s" };
    },
    async ultimo_autorizado() {
      return 4;
    },
    async autorizar_c() {
      return { cae, caeVto: "2026-11-20", raw: { homo: true } };
    },
    async consultar() {
      return { existe: true, coincide: true, cae };
    },
  };
}

function docVarado(overrides: Partial<StoredFiscalDoc> = {}): StoredFiscalDoc {
  const id = crypto.randomUUID();
  return {
    id,
    idempotency_key: `sale:${id}:11`,
    sale_id: crypto.randomUUID(),
    cbte_tipo: "11",
    pto_vta: "3",
    cbte_nro: 5,
    cbte_fch: "20261010",
    doc_tipo: "99",
    doc_nro: "0",
    cond_iva_receptor: "5",
    estado: "respuesta_incierta",
    cae: null,
    cae_vto: null,
    qr_payload: null,
    imp_total_centavos: "12100",
    ...overrides,
  };
}

beforeEach(() => {
  resetStore();
  delete process.env.TENANT_DATABASE_URL;
  delete process.env["TENANT_DATABASE_URL_tenant-a"];
  process.env.JOBS_SECRET = "job-secret";
  process.env.ARCA_CUIT_PROVEEDOR = "20933331726";
});

afterEach(() => {
  delete process.env.JOBS_SECRET;
  delete process.env.ARCA_CUIT_PROVEEDOR;
});

describe("FE-S19 job de reconciliación fiscal", () => {
  it("concilia una respuesta incierta con FECompConsultar y la autoriza", async () => {
    const doc = docVarado();
    await asegurarDoc(doc);

    const r = await ejecutarReconciliacionFiscal({ cuit: CUIT, provider: proveedor(), puerto: puertoMemoria() });

    expect(r).toEqual({ resueltos: 1, retenidos: 0 });
    const final = await buscarFiscalDocPorId(doc.id);
    expect(final?.estado).toBe("autorizado");
    expect(final?.cae).toBe("70412345678901");
    expect(final?.cbte_nro).toBe(5);
  });

  it("no reenvía si la consulta no coincide y lo deja retenido", async () => {
    const doc = docVarado();
    await asegurarDoc(doc);
    const provider: FiscalProvider = {
      ...proveedor(),
      async consultar() {
        return { existe: true, coincide: false };
      },
    };

    const r = await ejecutarReconciliacionFiscal({ cuit: CUIT, provider, puerto: puertoMemoria() });

    expect(r).toEqual({ resueltos: 0, retenidos: 1 });
    const final = await buscarFiscalDocPorId(doc.id);
    expect(final?.estado).toBe("respuesta_incierta");
  });

  it("la ruta exige X-Job-Secret y drena los varados del comercio", async () => {
    const doc = docVarado();
    await asegurarDoc(doc);

    const sin = await POSTReconciliacion(ctx("http://x/api/jobs/fiscal-reconciliacion", { method: "POST" }));
    expect(sin.status).toBe(403);

    const con = await POSTReconciliacion(
      ctx("http://x/api/jobs/fiscal-reconciliacion", {
        method: "POST",
        headers: { "X-Job-Secret": "job-secret" },
      }),
    );
    expect(con.status).toBe(200);
    expect(await con.json()).toEqual({ resueltos: 1, retenidos: 0 });
    expect((await buscarFiscalDocPorId(doc.id))?.estado).toBe("autorizado");
  });

  it("un doc ya autorizado no se toca", async () => {
    const doc = docVarado({ estado: "autorizado", cae: "70000000000001" });
    await asegurarDoc(doc);

    const r = await ejecutarReconciliacionFiscal({ cuit: CUIT, provider: proveedor(), puerto: puertoMemoria() });

    expect(r).toEqual({ resueltos: 0, retenidos: 0 });
    const final = await buscarFiscalDocPorId(doc.id);
    expect(final).toEqual(expect.objectContaining({ estado: "autorizado", cae: "70000000000001" }));
  });

  it("deja retenido un pendiente marcado difiere para revisión humana", async () => {
    const doc = docVarado({ estado: "pendiente", cbte_nro: null, ultimo_error_codigo: "difiere" });
    await asegurarDoc(doc);

    const r = await ejecutarReconciliacionFiscal({ cuit: CUIT, provider: proveedor(), puerto: puertoMemoria() });

    expect(r).toEqual({ resueltos: 0, retenidos: 1 });
    const final = await buscarFiscalDocPorId(doc.id);
    expect(final?.estado).toBe("pendiente");
  });
});
