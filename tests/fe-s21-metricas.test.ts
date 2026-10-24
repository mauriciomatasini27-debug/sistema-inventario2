import { beforeEach, describe, expect, it } from "vitest";
import type { PedidoC } from "../src/modules/fiscal/fiscal.js";
import {
  actualizar_cola_fiscal_por_tenant,
  crear_arca_provider,
  leer_archivo_auditoria_arca,
  leer_metricas_arca,
  limpiar_metricas_y_auditoria_arca,
  limpiar_ta_cache,
} from "../src/modules/fiscal/arca-provider.js";

const cfg = {
  ambiente: "homo" as const,
  cuitProveedor: "20933331726",
  certPem: "CERT",
  keyPem: "KEY",
};

function pedido(): PedidoC {
  return {
    cbteTipo: 11,
    ptoVta: 3,
    cbteDesde: 1,
    cbteHasta: 1,
    cbteFch: "20261010",
    concepto: 1,
    docTipo: 99,
    docNro: 0n,
    condIvaReceptor: 5,
    impTotal: 100n,
    impNeto: 100n,
    monId: "PES",
    monCotiz: 1,
  };
}

beforeEach(() => {
  limpiar_ta_cache();
  limpiar_metricas_y_auditoria_arca();
});

describe("FE-S21 métricas y archivo ARCA", () => {
  it("cuenta un rechazo y guarda pedido/respuesta sin token", async () => {
    const provider = crear_arca_provider(cfg, {
      tenantId: "tenant-a",
      ta: {
        leer: async () => ({ token: "TOKEN-SECRETO", sign: "SIGN-SECRETO", expiraEn: Date.now() + 6 * 60 * 60 * 1000 }),
        guardar: async () => {},
      },
      fe_solicitar: async () => ({
        cae: "",
        caeVto: "",
        resultado: "R",
        codigoRechazo: "10015",
      }),
    });

    await expect(provider.autorizar_c(pedido(), "20933331726")).rejects.toThrow(/ARCA rechazo/);

    const metricas = leer_metricas_arca();
    expect(metricas.llamadas).toBe(1);
    expect(metricas.rechazosPorCodigo["10015"]).toBe(1);

    const archivo = leer_archivo_auditoria_arca(5);
    expect(archivo.length).toBe(1);
    const serializado = JSON.stringify(archivo[0]);
    expect(serializado).not.toMatch(/TOKEN-SECRETO|SIGN-SECRETO/);
    expect(serializado).toContain("FECAESolicitar");
  });

  it("expone cola por comercio y antigüedad del pendiente más viejo", () => {
    const viejo = Date.now() - 120_000;
    actualizar_cola_fiscal_por_tenant([
      { tenantId: "t1", cola: { pendientes: 2, pendienteMasViejoEn: viejo } },
      { tenantId: "t2", cola: { pendientes: 0, pendienteMasViejoEn: null } },
    ]);

    const m = leer_metricas_arca();
    expect(m.colaPorComercio["t1"]?.pendientes).toBe(2);
    expect(m.antiguedadPendienteMasViejoMs).not.toBeNull();
    expect(m.antiguedadPendienteMasViejoMs ?? 0).toBeGreaterThanOrEqual(119_000);
  });
});
