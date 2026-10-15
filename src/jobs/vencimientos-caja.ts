import { vencimientosAAvisar, type VencimientoAvisable } from "../modules/cash/vencimientos.js";

// Job diario de vencimientos de caja CAJA-S3 (cron fuera del repo:
// POST /api/jobs/vencimientos-caja con X-Job-Secret, fan-out por tenant).
//
// Marca avisado_el en los pendientes que vencen dentro de 3 días
// (inclusive 72h exactas; los ya vencidos pendientes cuentan) y devuelve
// los avisados en la respuesta. El aviso viaja en `avisados` porque
// cablear el canal (WhatsApp u otro) pide infraestructura nueva; el canal
// se conecta después consumiendo esta respuesta.

export interface VencimientoCajaAviso extends VencimientoAvisable {
  readonly concepto: string;
  readonly montoCentavos: string;
}

export interface AvisoVencimientoCaja {
  readonly id: string;
  readonly concepto: string;
  readonly vence_el: string;
  readonly monto_centavos: string;
}

export function avisosVencimientosCaja(items: ReadonlyArray<VencimientoCajaAviso>, ahoraMs: number): AvisoVencimientoCaja[] {
  return vencimientosAAvisar(items, ahoraMs).map((d) => ({
    id: d.id,
    concepto: d.concepto,
    vence_el: d.venceEl,
    monto_centavos: d.montoCentavos,
  }));
}
