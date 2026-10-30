// FE-S26 / #106: job diario de alertas de vencimiento del certificado fiscal.
import {
  alertaDesdeComputador,
  claveRegistroAlertaCert,
  diasRestantesCertificado,
  type UmbralCertDias,
  umbralesPorEmitir,
} from "../modules/fiscal/cert-vencimiento.js";
import { listarResumenComputadoresFiscal, type FiscalControlDeps } from "../lib/repos/fiscal-control.js";
import { leerFiscalParam, guardarFiscalParam } from "../lib/repos/fiscal-parametros.js";
import { adminStore } from "../lib/admin-store.js";

export interface ResultadoCertVencimiento {
  readonly fecha: string;
  readonly alertas: ReadonlyArray<{
    readonly fiscalComputerId: string;
    readonly ambiente: string;
    readonly alias: string;
    readonly diasRestantes: number;
    readonly severidad: string;
    readonly umbralActivo: number | null;
  }>;
  readonly emitidas: ReadonlyArray<{ readonly fiscalComputerId: string; readonly umbral: UmbralCertDias }>;
}

async function umbralesYaEmitidos(fiscalComputerId: string): Promise<Set<UmbralCertDias>> {
  const emitidos = new Set<UmbralCertDias>();
  for (const umbral of [60, 30, 7] as const) {
    const v = await leerFiscalParam(claveRegistroAlertaCert(fiscalComputerId, umbral));
    if (v) emitidos.add(umbral);
  }
  return emitidos;
}

export async function ejecutar_alertas_certificado(
  ahora: Date,
  deps: FiscalControlDeps = {},
): Promise<ResultadoCertVencimiento> {
  const computadores = await listarResumenComputadoresFiscal(deps);
  const alertas = [];
  const emitidas: Array<{ fiscalComputerId: string; umbral: UmbralCertDias }> = [];

  for (const c of computadores) {
    const alerta = alertaDesdeComputador(c, ahora);
    if (alerta) {
      alertas.push({
        fiscalComputerId: alerta.fiscalComputerId,
        ambiente: alerta.ambiente,
        alias: alerta.alias,
        diasRestantes: alerta.diasRestantes,
        severidad: alerta.severidad,
        umbralActivo: alerta.umbralActivo,
      });
    }
    if (!c.notAfter) continue;
    const dias = diasRestantesCertificado(c.notAfter, ahora);
    const ya = await umbralesYaEmitidos(c.id);
    for (const umbral of umbralesPorEmitir(dias, ya)) {
      await guardarFiscalParam(claveRegistroAlertaCert(c.id, umbral), ahora.toISOString());
      emitidas.push({ fiscalComputerId: c.id, umbral });
    }
  }

  adminStore.alertasCertificadoFiscal = alertas.map((a) => ({ ...a, actualizadoEn: ahora.toISOString() }));

  return { fecha: ahora.toISOString(), alertas, emitidas };
}
