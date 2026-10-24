import { beforeEach, describe, expect, it } from "vitest";
import type { FiscalProvider, PedidoC } from "../src/modules/fiscal/fiscal.js";
import { crear_homo_fake } from "../src/modules/fiscal/homo-fake.js";
import { clave_fiscal, en_vuelo_por, limpiar_en_vuelo } from "../src/modules/fiscal/lock.js";
import { conciliarSerieDiaria, procesar_pendiente } from "../src/modules/fiscal/worker.js";
import type { StoredFiscalDoc } from "../src/lib/store.js";
import { POST } from "../src/pages/api/jobs/fiscal-conciliacion.js";
import { ctx } from "./helpers/ctx.js";

const CUIT = 20933331726;
const AHORA = 1_700_000_000_000;

function pendiente(id = "d1"): StoredFiscalDoc {
  return {
    id,
    idempotency_key: `sale:${id}:11`,
    sale_id: id,
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

function pedido(nro: number, total: bigint): PedidoC {
  return {
    cbteTipo: 11,
    ptoVta: 3,
    cbteDesde: nro,
    cbteHasta: nro,
    cbteFch: "20261010",
    concepto: 1,
    docTipo: 99,
    docNro: 0n,
    condIvaReceptor: 5,
    impTotal: total,
    impNeto: total,
    monId: "PES",
    monCotiz: 1,
  };
}

beforeEach(() => {
  limpiar_en_vuelo();
});

describe("FE-S19 conciliacion tras timeout", () => {
  it("un timeout sin comprobante conserva el numero y espera 30 segundos", async () => {
    const base = crear_homo_fake();
    let autorizar = 0;
    const provider: FiscalProvider = {
      ...base,
      autorizar_c: async () => {
        autorizar += 1;
        throw new Error("timeout");
      },
    };
    const r = await procesar_pendiente({
      doc: pendiente(),
      lastNumber: 144,
      totalCentavos: 100n,
      cuit: CUIT,
      provider,
      ahoraMs: AHORA,
    });
    expect(r.doc.estado).toBe("pendiente");
    expect(r.doc.cbte_nro).toBe(145);
    expect(r.doc.ultimo_error_codigo).toBe("timeout");
    expect(Date.parse(r.doc.proximo_intento ?? "")).toBe(AHORA + 30_000);
    expect(en_vuelo_por(clave_fiscal(CUIT, "3", "11"))).toBe("d1");

    const temprano = await procesar_pendiente({
      doc: r.doc,
      lastNumber: 144,
      totalCentavos: 100n,
      cuit: CUIT,
      provider,
      ahoraMs: AHORA + 1_000,
    });
    expect(temprano.doc.cbte_nro).toBe(145);
    expect(autorizar).toBe(1);
  });

  it("a los 30 segundos un comprobante que coincide toma el CAE y no reenvia", async () => {
    const base = crear_homo_fake();
    await base.autorizar_c(pedido(145, 100n), String(CUIT));
    let autorizar = 0;
    const provider: FiscalProvider = {
      ...base,
      autorizar_c: async () => {
        autorizar += 1;
        throw new Error("no deberia reenviar");
      },
    };
    const doc: StoredFiscalDoc = {
      ...pendiente(),
      cbte_nro: 145,
      intentos: 1,
      ultimo_error_codigo: "timeout",
      proximo_intento: new Date(AHORA).toISOString(),
    };
    const r = await procesar_pendiente({
      doc,
      lastNumber: 144,
      totalCentavos: 100n,
      cuit: CUIT,
      provider,
      ahoraMs: AHORA,
    });
    expect(r.doc.estado).toBe("autorizado");
    expect(r.doc.cbte_nro).toBe(145);
    expect(r.doc.cae).toBeTruthy();
    expect(autorizar).toBe(0);
    expect(en_vuelo_por(clave_fiscal(CUIT, "3", "11"))).toBeNull();
  });

  it("si el numero no existe, reenvia ese mismo numero", async () => {
    const base = crear_homo_fake();
    const enviados: number[] = [];
    const provider: FiscalProvider = {
      ...base,
      autorizar_c: async (p, cuit) => {
        enviados.push(p.cbteDesde);
        return base.autorizar_c(p, cuit);
      },
    };
    const doc: StoredFiscalDoc = {
      ...pendiente(),
      cbte_nro: 145,
      intentos: 1,
      ultimo_error_codigo: "timeout",
      proximo_intento: new Date(AHORA).toISOString(),
    };
    const r = await procesar_pendiente({
      doc,
      lastNumber: 144,
      totalCentavos: 100n,
      cuit: CUIT,
      provider,
      ahoraMs: AHORA,
    });
    expect(enviados).toEqual([145]);
    expect(r.doc.estado).toBe("autorizado");
    expect(r.doc.cbte_nro).toBe(145);
  });

  it("un comprobante distinto pausa la cola", async () => {
    const base = crear_homo_fake();
    await base.autorizar_c(pedido(145, 999n), String(CUIT));
    let autorizar = 0;
    const provider: FiscalProvider = {
      ...base,
      autorizar_c: async () => {
        autorizar += 1;
        throw new Error("no deberia reenviar");
      },
    };
    const doc: StoredFiscalDoc = {
      ...pendiente(),
      cbte_nro: 145,
      intentos: 1,
      ultimo_error_codigo: "timeout",
      proximo_intento: new Date(AHORA).toISOString(),
    };
    const r = await procesar_pendiente({
      doc,
      lastNumber: 144,
      totalCentavos: 100n,
      cuit: CUIT,
      provider,
      ahoraMs: AHORA,
    });
    expect(r.doc.estado).toBe("pendiente");
    expect(r.doc.cbte_nro).toBe(145);
    expect(r.doc.ultimo_error_codigo).toBe("difiere");
    expect(autorizar).toBe(0);
    expect(en_vuelo_por(clave_fiscal(CUIT, "3", "11"))).toBe("d1");
  });

  it("el 10016 resincroniza y reintenta una sola vez", async () => {
    let autorizar = 0;
    const provider: FiscalProvider = {
      get_ta: async () => ({ token: "t", sign: "s" }),
      ultimo_autorizado: async () => 10,
      autorizar_c: async () => {
        autorizar += 1;
        throw new Error("ARCA rechazo 10016");
      },
      consultar: async () => ({ existe: false, coincide: false }),
    };
    const r = await procesar_pendiente({
      doc: pendiente(),
      lastNumber: 10,
      totalCentavos: 100n,
      cuit: CUIT,
      provider,
      ahoraMs: AHORA,
    });
    expect(autorizar).toBe(2);
    expect(r.doc.estado).toBe("rechazado");
    expect(r.doc.ultimo_error_codigo).toBe("10016");

    await procesar_pendiente({
      doc: r.doc,
      lastNumber: 10,
      totalCentavos: 100n,
      cuit: CUIT,
      provider,
      ahoraMs: AHORA + 60_000,
    });
    expect(autorizar).toBe(2);
  });
});

describe("FE-S19 job diario", () => {
  it("recupera el CAE del hueco propio y marca el ajeno como emitido fuera", async () => {
    const provider = crear_homo_fake();
    await provider.autorizar_c(pedido(3, 100n), String(CUIT));
    await provider.autorizar_c(pedido(4, 999n), String(CUIT));
    const esperadoPorNro = new Map([
      [3, { docTipo: 99, docNro: "0", impTotalCentavos: 100n, cbteFch: "20261010" }],
    ]);
    const r = await conciliarSerieDiaria({
      ultimoLocal: 2,
      cbteTipo: 11,
      ptoVta: 3,
      cuit: String(CUIT),
      provider,
      esperadoPorNro,
    });
    expect(r.ultimoArca).toBe(4);
    const propio = r.hallazgos[0];
    const ajeno = r.hallazgos[1];
    expect(propio?.nro).toBe(3);
    expect(propio?.accion).toBe("cae-recuperado");
    if (propio?.accion !== "cae-recuperado") return;
    expect(propio.cae).toHaveLength(14);
    expect(ajeno).toEqual({ nro: 4, accion: "emitido-fuera-del-sistema" });
  });

  it("sin certificado el job no llama a ARCA", async () => {
    const previo = process.env.JOBS_SECRET;
    const cert = process.env.ARCA_CERT_PEM;
    const key = process.env.ARCA_KEY_PEM;
    const cuit = process.env.ARCA_CUIT_PROVEEDOR;
    process.env.JOBS_SECRET = "fe-s19";
    delete process.env.ARCA_CERT_PEM;
    delete process.env.ARCA_KEY_PEM;
    delete process.env.ARCA_CUIT_PROVEEDOR;
    try {
      const prohibido = await POST(ctx("http://x/api/jobs/fiscal-conciliacion", { method: "POST" }));
      expect(prohibido.status).toBe(403);
      const vacio = await POST(
        ctx("http://x/api/jobs/fiscal-conciliacion", { method: "POST", headers: { "X-Job-Secret": "fe-s19" } }),
      );
      expect(vacio.status).toBe(200);
      expect(await vacio.json()).toEqual({ comparado: false, motivo: "sin-certificado" });
    } finally {
      if (previo === undefined) delete process.env.JOBS_SECRET;
      else process.env.JOBS_SECRET = previo;
      if (cert === undefined) delete process.env.ARCA_CERT_PEM;
      else process.env.ARCA_CERT_PEM = cert;
      if (key === undefined) delete process.env.ARCA_KEY_PEM;
      else process.env.ARCA_KEY_PEM = key;
      if (cuit === undefined) delete process.env.ARCA_CUIT_PROVEEDOR;
      else process.env.ARCA_CUIT_PROVEEDOR = cuit;
    }
  });
});
