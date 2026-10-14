// ND manual Dueño (FE-S16, ADR-0018 D5/D7). Núcleo puro: sin IO, sin Drizzle.
// Misma clase que la factura con CbtesAsoc obligatorio + exige caja asociada
// cuando hubo cobro (C8). Serie propia por (PV, tipo ND) en el worker.
import { clase_nd_desde_factura, type CbtesAsoc } from "./fiscal.js";

export interface FacturaOrigenNd {
  readonly cbteTipo: number;
  readonly ptoVta: number;
  readonly cbteNro: number | null;
  readonly estado: string;
}

export type DecisionNd =
  | { readonly decision: "emitir-nd"; readonly ndTipo: number; readonly cbtesAsoc: CbtesAsoc }
  | { readonly decision: "esperar-cae" }
  | { readonly decision: "sin-factura" }
  | { readonly decision: "falta-caja"; readonly motivo: string };

export function decidir_nd(
  factura: FacturaOrigenNd | null,
  opts: { tieneCajaAsociada: boolean; huboCobro: boolean },
): DecisionNd {
  if (factura === null) return { decision: "sin-factura" };
  const ndTipo = clase_nd_desde_factura(factura.cbteTipo);
  if (ndTipo === null) return { decision: "sin-factura" };
  if (factura.estado !== "autorizado") return { decision: "esperar-cae" };
  if (factura.cbteNro === null || factura.cbteNro < 1) return { decision: "esperar-cae" };
  if (opts.huboCobro && !opts.tieneCajaAsociada) {
    return { decision: "falta-caja", motivo: "ND con cobro exige movimiento caja asociado" };
  }
  return { decision: "emitir-nd", ndTipo, cbtesAsoc: { tipo: factura.cbteTipo, ptoVta: factura.ptoVta, nro: factura.cbteNro } };
}
