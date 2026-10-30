import { beforeEach, describe, expect, it } from "vitest";
import {
  alertaDesdeComputador,
  diasRestantesCertificado,
  severidadCertificado,
  umbralesPorEmitir,
  umbralActivo,
} from "../src/modules/fiscal/cert-vencimiento.js";
import { notAfterDesdeCertPem } from "../src/modules/fiscal/cert-pem.js";
import { crear_kms_fake } from "../src/modules/fiscal/kms.js";
import { storeFiscalControlMemoria } from "../src/lib/fiscal-control-almacen.js";
import { guardarComputadorFiscal } from "../src/lib/repos/fiscal-control.js";
import { resetFiscalParamMemoria } from "../src/lib/repos/fiscal-parametros.js";
import { ejecutar_alertas_certificado } from "../src/jobs/fiscal-cert-vencimiento.js";
import { adminStore, resetAdmin } from "../src/lib/admin-store.js";
import { generarCertificadoPrueba, opensslDisponible } from "./helpers/openssl-cert.js";

describe("cert-vencimiento puro", () => {
  const hoy = new Date("2026-10-30T12:00:00Z");

  it("30 días restantes es umbral 30 y severidad crítica", () => {
    const notAfter = new Date("2026-11-29T12:00:00Z");
    expect(diasRestantesCertificado(notAfter, hoy)).toBe(30);
    expect(umbralActivo(30)).toBe(30);
    expect(severidadCertificado(30)).toBe("critico");
  });

  it("emite cada umbral una sola vez", () => {
    const ya = new Set<60 | 30 | 7>([60]);
    expect(umbralesPorEmitir(45, ya)).toEqual([]);
    expect(umbralesPorEmitir(45, new Set())).toEqual([60]);
    expect(umbralesPorEmitir(25, new Set([60]))).toEqual([30]);
    expect(umbralesPorEmitir(5, new Set([60, 30]))).toEqual([7]);
  });

  it("sin not_after no hay alerta visible", () => {
    expect(
      alertaDesdeComputador(
        { id: "c1", ambiente: "homo", alias: "a", cuitProveedor: "20", notAfter: null },
        hoy,
      ),
    ).toBeNull();
  });
});

describe("guardarComputadorFiscal + job #106", () => {
  beforeEach(() => {
    delete process.env.FISCAL_KMS_KEY_B64;
    resetFiscalParamMemoria();
    resetAdmin();
  });

  it.skipIf(!opensslDisponible())("persiste not_after parseado del PEM de prueba", async () => {
    const { certPem, keyPem } = generarCertificadoPrueba({ diasValidez: 45 });
    const parsed = notAfterDesdeCertPem(certPem);
    expect(parsed).not.toBeNull();

    const store = storeFiscalControlMemoria();
    const deps = { almacen: store, kms: crear_kms_fake() };
    const id = await guardarComputadorFiscal(
      {
        ambiente: "homo",
        alias: "test-venc",
        cuitProveedor: "20933331726",
        certPem,
        keyPem,
      },
      deps,
    );

    const fila = await store.buscarComputador("homo", "test-venc");
    expect(fila?.notAfter?.getTime()).toBe(parsed?.getTime());

    const hoy = new Date(parsed!.getTime() - 30 * 86_400_000);
    const r = await ejecutar_alertas_certificado(hoy, { almacen: store, kms: deps.kms });
    expect(r.emitidas).toEqual([{ fiscalComputerId: id, umbral: 30 }]);
    expect(r.alertas[0]?.severidad).toBe("critico");
    expect(adminStore.alertasCertificadoFiscal.length).toBe(1);

    const segunda = await ejecutar_alertas_certificado(hoy, { almacen: store, kms: deps.kms });
    expect(segunda.emitidas).toEqual([]);
  });
});
