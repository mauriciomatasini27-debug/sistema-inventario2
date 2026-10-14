import { beforeEach, describe, expect, it } from "vitest";
import { crear_homo_fake } from "../src/modules/fiscal/homo-fake.js";
import { MARCA_PRUEBA, type FiscalProvider, type PedidoC } from "../src/modules/fiscal/fiscal.js";
import { clave_fiscal, en_vuelo_por, limpiar_en_vuelo, marcar_en_vuelo } from "../src/modules/fiscal/lock.js";
import { procesar_pendiente, procesar_pendiente_serializado } from "../src/modules/fiscal/worker.js";
import type { StoredFiscalDoc } from "../src/lib/store.js";

let seq = 0;
function pendiente(over: Partial<StoredFiscalDoc> = {}): StoredFiscalDoc {
  seq += 1;
  return {
    id: `slice-${seq}`,
    idempotency_key: `sale:slice-${seq}:11`,
    sale_id: `slice-${seq}`,
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
    ...over,
  };
}

const CUIT = 20933331726;

describe("fiscal slice homo ADR-0019 (D4/D5 + representación)", () => {
  beforeEach(() => limpiar_en_vuelo());

  it("10 ventas simultáneas mismo PV numeran 1..10 sin huecos ni duplicados", async () => {
    const provider = crear_homo_fake();
    const rs = await Promise.all(
      Array.from({ length: 10 }, () =>
        procesar_pendiente_serializado({ doc: pendiente(), lastNumber: 0, totalCentavos: 100n, cuit: CUIT, provider }),
      ),
    );
    expect(rs.every((r) => r.doc.estado === "autorizado")).toBe(true);
    const nros = rs.map((r) => r.doc.cbte_nro).sort((a, b) => (a ?? 0) - (b ?? 0));
    expect(nros).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it("autorizado lleva marca de prueba + link token + QR", async () => {
    const provider = crear_homo_fake();
    const r = await procesar_pendiente({ doc: pendiente(), lastNumber: 0, totalCentavos: 100n, cuit: CUIT, provider });
    expect(r.doc.estado).toBe("autorizado");
    expect(r.doc.marca).toBe(MARCA_PRUEBA);
    expect(r.doc.link_token).toMatch(/^[0-9a-f]{16}$/);
    expect(r.doc.qr_payload?.startsWith("https://www.arca.gob.ar/fe/qr/?p=")).toBe(true);
  });

  it("consulta que difiere (total/doc/fecha) pausa con lock retenido, no duplica", async () => {
    const provider = crear_homo_fake();
    // ARCA tiene el 1 con otro total: el retry del doc numerado difiere.
    const pedidoDivergente: PedidoC = { cbteTipo: 11, ptoVta: 3, cbteDesde: 1, cbteHasta: 1, cbteFch: "20261010", concepto: 1, docTipo: 99, docNro: 0n, condIvaReceptor: 5, impTotal: 999n, impNeto: 999n, monId: "PES", monCotiz: 1 };
    await provider.autorizar_c(
      pedidoDivergente,
      String(CUIT),
    );
    const flaky: FiscalProvider = { ...provider, autorizar_c: async (): Promise<never> => { throw new Error("timeout"); } };
    const r = await procesar_pendiente({ doc: pendiente({ cbte_nro: 1 }), lastNumber: 0, totalCentavos: 100n, cuit: CUIT, provider: flaky });
    expect(r.doc.estado).toBe("pendiente");
    expect(r.doc.cbte_nro).toBe(1);
    // Pausa + alerta: el lock queda retenido hasta resolución manual.
    expect(en_vuelo_por(clave_fiscal(CUIT, "3", "11"))).toBe(r.doc.id);
    limpiar_en_vuelo();
  });

  it("secuencia retenida por otro doc retrocede sin consumir número", () => {
    const clave = clave_fiscal(CUIT, "3", "11");
    expect(marcar_en_vuelo(clave, "otro-doc")).toBe(true);
    return procesar_pendiente({ doc: pendiente(), lastNumber: 41, totalCentavos: 100n, cuit: CUIT, provider: crear_homo_fake() }).then(
      (r) => {
        expect(r.doc.estado).toBe("pendiente");
        expect(r.doc.cbte_nro).toBeNull();
        expect(r.lastNumber).toBe(41);
        limpiar_en_vuelo();
      },
    );
  });
});
