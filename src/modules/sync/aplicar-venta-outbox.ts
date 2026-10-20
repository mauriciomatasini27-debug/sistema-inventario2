import { postSalesSchema } from "../../lib/validation.js";
import { registrar_venta } from "../sales/registro_venta.js";

export type ResultadoAplicarVenta =
  | { readonly resultado: "aplicada"; readonly saleId: string }
  | { readonly resultado: "ya_aplicada" }
  | { readonly resultado: "no_aplicable" };

// P10-6 (ADR-0097 VF-S2): una op "sales" del outbox se aplica con el
// mismo repo que /api/sales. offline: true siempre: el definitivo T-* lo
// asigna promote, y sin gateFiscal porque la venta ya se cobró offline.
// key = op_id cierra el replay (YA_VISTA / YA_VISTA_DB).
export async function aplicarVentaOutbox(e: {
  readonly opId: string;
  readonly payload: unknown;
  readonly modulo?: string;
}): Promise<ResultadoAplicarVenta> {
  if (e.modulo !== undefined && e.modulo !== "sales") return { resultado: "no_aplicable" };
  const parsed = postSalesSchema.safeParse(e.payload);
  if (!parsed.success) return { resultado: "no_aplicable" };
  const b = parsed.data;
  const reg = await registrar_venta({
    key: e.opId,
    lineas: b.lineas,
    medio: b.medio,
    deviceCode: b.device_code,
    seqLocal: b.seq_local,
    offline: true,
    pagos: b.pagos,
    clientOccurredAt: b.client_occurred_at,
  });
  if (!reg.ok) {
    if (reg.codigo === "YA_VISTA" || reg.codigo === "YA_VISTA_DB") return { resultado: "ya_aplicada" };
    return { resultado: "no_aplicable" };
  }
  return { resultado: "aplicada", saleId: reg.venta.saleId };
}
