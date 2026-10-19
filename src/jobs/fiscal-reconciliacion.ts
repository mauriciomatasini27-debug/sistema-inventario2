import { rehidratar_fiscal, type PuertoFiscalDurable, type Rehidratacion } from "../lib/fiscal-emitir.js";
import type { FiscalProvider } from "../modules/fiscal/fiscal.js";

// FE-S19: un comprobante varado (respuesta_incierta o "difiere") se resuelve
// consultando FECompConsultar antes de reenviar, o reintentando la emisión con
// el mismo número. No crea ventas ni toca caja; solo converge el documento.
export async function ejecutarReconciliacionFiscal(args: {
  readonly cuit: number;
  readonly provider: FiscalProvider;
  readonly puerto: PuertoFiscalDurable;
}): Promise<Rehidratacion> {
  return rehidratar_fiscal({ cuit: args.cuit, provider: args.provider }, args.puerto);
}
