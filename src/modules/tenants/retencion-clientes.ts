// P10-90: retención de datos de clientes tras el cierre de la cuenta
// (/privacidad, PR #369). Núcleo puro: decide qué comercios cerrados ya
// pasaron los 90 días; el job (src/jobs/retencion-clientes.ts) ejecuta.

export const DIAS_RETENCION_CLIENTES = 90;
const MS_DIA = 86_400_000;

export interface TenantCerrable {
  readonly id: string;
  readonly estado: string;
  readonly esDemo: boolean;
  readonly trialHasta: string | null;
  // P10-90: primer tenant_lifecycle_events con a_estado = 'baja' (ISO).
  readonly bajaEn: string | null;
}

// P10-90: la fecha de cierre sale del evento de vida 'baja'. Una demo sin
// evento (purgas previas a P10-90) usa trial_hasta: la purga corre recién
// cuando vence. Sin ninguna de las dos no se puede probar la edad del cierre
// y el comercio no se toca (queda en sinFechaCierre para revisarlo a mano).
export function fecha_cierre(t: TenantCerrable): string | null {
  if (t.estado !== "baja") return null;
  if (t.bajaEn) return t.bajaEn;
  if (t.esDemo && t.trialHasta) return t.trialHasta;
  return null;
}

export interface EleccionRetencion {
  readonly vencidos: string[];
  readonly sinFechaCierre: string[];
}

export function elegir_tenants_retencion(tenants: ReadonlyArray<TenantCerrable>, ahora: Date): EleccionRetencion {
  const vencidos: string[] = [];
  const sinFechaCierre: string[] = [];
  for (const t of tenants) {
    if (t.estado !== "baja") continue;
    const cierre = fecha_cierre(t);
    if (!cierre) {
      sinFechaCierre.push(t.id);
      continue;
    }
    const limite = new Date(cierre).getTime() + DIAS_RETENCION_CLIENTES * MS_DIA;
    if (limite <= ahora.getTime()) vencidos.push(t.id);
  }
  return { vencidos: vencidos.sort(), sinFechaCierre: sinFechaCierre.sort() };
}
