import { rehidratar_fiscal, type PuertoFiscalDurable, type Rehidratacion } from "../lib/fiscal-emitir.js";
import type { FiscalProvider } from "../modules/fiscal/fiscal.js";

export interface SecuenciaFueraDelSistema {
  readonly puntoVenta: string;
  readonly cbteTipo: string;
  readonly local: number;
  readonly remoto: number;
  readonly faltantes: number;
}

export interface ReconciliacionFiscal extends Rehidratacion {
  readonly fuera_del_sistema: readonly SecuenciaFueraDelSistema[];
}

// FE-S19: un comprobante varado (respuesta_incierta o "difiere") se resuelve
// consultando FECompConsultar antes de reenviar, o reintentando la emisión con
// el mismo número. Después compara la secuencia local contra
// FECompUltimoAutorizado para reportar comprobantes emitidos fuera del sistema
// (el próximo número ya salta ese hueco, pero el Dueño tiene que saberlo).
export async function ejecutarReconciliacionFiscal(args: {
  readonly cuit: number;
  readonly provider: FiscalProvider;
  readonly puerto: PuertoFiscalDurable;
}): Promise<ReconciliacionFiscal> {
  const { cuit, provider, puerto } = args;
  const rehidratacion = await rehidratar_fiscal({ cuit, provider }, puerto);
  const fuera: SecuenciaFueraDelSistema[] = [];
  for (const s of await puerto.listar_secuencias()) {
    let remoto: number;
    try {
      remoto = await provider.ultimo_autorizado(String(cuit), Number(s.puntoVenta), Number(s.cbteTipo));
    } catch {
      continue;
    }
    if (!Number.isInteger(remoto) || remoto <= s.lastNumber) continue;
    fuera.push({
      puntoVenta: s.puntoVenta,
      cbteTipo: s.cbteTipo,
      local: s.lastNumber,
      remoto,
      faltantes: remoto - s.lastNumber,
    });
  }
  return { ...rehidratacion, fuera_del_sistema: fuera };
}
