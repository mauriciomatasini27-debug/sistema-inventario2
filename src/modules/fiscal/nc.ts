// Decisión NC automática por devolución (FE-S14/S15, ADR-0018 D5).
// Núcleo puro: sin IO, sin Drizzle. La devolución interna (registrar_devolucion)
// ya validó tope contra la venta; acá se decide la NC fiscal contra lo
// facturado, con CbtesAsoc obligatorio a la factura original.
import { clase_nc_desde_factura, type CbtesAsoc } from "./fiscal.js";

export interface FacturaOrigen {
  readonly cbteTipo: number;
  readonly ptoVta: number;
  readonly cbteNro: number | null;
  readonly estado: string;
  readonly impTotalCentavos: bigint;
  readonly docTipo: number;
  readonly docNro: string;
  readonly condIvaReceptor: number;
}

export type DecisionNc =
  | { readonly decision: "emitir-nc"; readonly ncTipo: number; readonly cbtesAsoc: CbtesAsoc }
  | { readonly decision: "esperar-cae" }
  | { readonly decision: "solo-interno" }
  | { readonly decision: "tope-excedido"; readonly acumuladoCentavos: bigint; readonly facturadoCentavos: bigint };

export function decidir_nc(
  factura: FacturaOrigen | null,
  montoNcCentavos: bigint,
  acumuladoNcPrevioCentavos: bigint,
): DecisionNc {
  if (montoNcCentavos <= 0n || acumuladoNcPrevioCentavos < 0n) {
    return { decision: "tope-excedido", acumuladoCentavos: acumuladoNcPrevioCentavos, facturadoCentavos: 0n };
  }
  // Venta sin factura fiscal: solo comprobante interno, sin NC.
  if (factura === null) return { decision: "solo-interno" };
  const ncTipo = clase_nc_desde_factura(factura.cbteTipo);
  if (ncTipo === null) return { decision: "solo-interno" };
  // Factura aún sin CAE: la NC espera y sale en orden tras autorizar.
  if (factura.estado !== "autorizado") return { decision: "esperar-cae" };
  if (factura.cbteNro === null || factura.cbteNro < 1) return { decision: "esperar-cae" };
  // Suma NC nunca supera lo facturado (tope fiscal, espejo del C14 interno).
  if (acumuladoNcPrevioCentavos + montoNcCentavos > factura.impTotalCentavos) {
    return {
      decision: "tope-excedido",
      acumuladoCentavos: acumuladoNcPrevioCentavos,
      facturadoCentavos: factura.impTotalCentavos,
    };
  }
  return {
    decision: "emitir-nc",
    ncTipo,
    cbtesAsoc: { tipo: factura.cbteTipo, ptoVta: factura.ptoVta, nro: factura.cbteNro },
  };
}
