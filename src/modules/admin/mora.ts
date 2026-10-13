// LANE admin — Mora PA7 (gracia 14d, suspensión día 15, baja día 45).
//
// Núcleo puro: sin IO, sin Drizzle. evaluar_mora no muta estado: el runner
// decide si emite tenant_lifecycle_events. Fechas en zona America/Argentina;
// `ahora` inyectable para tests deterministas.

export interface DunningPolicy {
  readonly plan: string;
  readonly diasGracia: number;
  readonly diasASuspension: number;
  readonly diasABaja: number;
  readonly activa: boolean;
}

// Seed PA7 (migración 0001): gracia 14, suspensión 15, baja 45.
export const POLITICA_DEFECTO: DunningPolicy = {
  plan: "base",
  diasGracia: 14,
  diasASuspension: 15,
  diasABaja: 45,
  activa: true,
};

export interface EstadoMora {
  readonly tenantId: string;
  readonly diasAtraso: number;
  readonly saldoDeudorCentavos: bigint;
  readonly ultimaEvaluacionEn: string | null;
}

export type DecisionMora = "al_dia" | "en_gracia" | "suspender" | "baja" | "mantener_suspension";

export interface ResultadoMora {
  readonly decision: DecisionMora;
  readonly proximoPasoEn: string;
  readonly debeEmitirEvento: boolean;
}

function masDias(base: Date, dias: number): string {
  return new Date(base.getTime() + dias * 86_400_000).toISOString();
}

// Por qué suspender emite evento y no muta: el cambio de tenants.estado lo
// aplica el contexto control consumiendo tenant_lifecycle_events; admin
// propone, control dispone (evita doble fuente de verdad silenciosa).
export function evaluar_mora(
  estado: EstadoMora,
  policy: DunningPolicy,
  suspendidoAhora: boolean,
  ahora?: Date,
): ResultadoMora {
  const hoy = ahora ?? new Date();
  if (!policy.activa || estado.saldoDeudorCentavos <= 0n || estado.diasAtraso <= 0) {
    return { decision: "al_dia", proximoPasoEn: masDias(hoy, 1), debeEmitirEvento: false };
  }
  if (estado.diasAtraso >= policy.diasABaja) {
    return { decision: "baja", proximoPasoEn: masDias(hoy, 1), debeEmitirEvento: !suspendidoAhora };
  }
  if (estado.diasAtraso >= policy.diasASuspension) {
    if (suspendidoAhora) {
      return { decision: "mantener_suspension", proximoPasoEn: masDias(hoy, 1), debeEmitirEvento: false };
    }
    return { decision: "suspender", proximoPasoEn: masDias(hoy, 1), debeEmitirEvento: true };
  }
  if (estado.diasAtraso > policy.diasGracia) {
    return {
      decision: "en_gracia",
      proximoPasoEn: masDias(hoy, policy.diasASuspension - estado.diasAtraso),
      debeEmitirEvento: false,
    };
  }
  return {
    decision: "en_gracia",
    proximoPasoEn: masDias(hoy, policy.diasGracia - estado.diasAtraso + 1),
    debeEmitirEvento: false,
  };
}

// Aplica un lifecycle event sobre el estado visto (puro). Lo usa la ruta
// inline hoy y el worker control en multiproceso mañana: un solo código.
const ESTADOS_VISTOS = ["pendiente", "aprovisionando", "activo", "suspendido", "en_baja", "baja", "archivado"] as const;

export function aplicar_evento_vida(estadoActual: string, aEstado: string): string {
  if (!(ESTADOS_VISTOS as readonly string[]).includes(aEstado)) {
    throw new Error(`estado destino inválido: ${aEstado}`);
  }
  if (estadoActual === aEstado) return estadoActual;
  return aEstado;
}
