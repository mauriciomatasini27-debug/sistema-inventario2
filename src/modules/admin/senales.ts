// LANE admin — Señales PA4 (solo contadores, nunca negocio).
//
// Núcleo puro: sin IO, sin Drizzle. Lo único que admin sabe de un comercio
// son contadores agregados. consumir_señal devuelve acto siempre: el consumo
// es auditable aunque la señal se descarte.

import { es_senal_permitida } from "./boundary.js";
import type { ActoAdmin } from "./actos.js";

export interface SenalEntrante {
  readonly id: string;
  readonly tipo: string;
  readonly payload: unknown;
}

export interface HealthCounters {
  readonly tenantsActivos: number;
  readonly tenantsSuspendidos: number;
  readonly demosPurgadas: number;
  readonly cobrosCentavos: bigint;
  readonly ultimaSenalEn: string | null;
}

export interface EventoVidaNuevo {
  readonly tenantId: string;
  readonly deEstado: string;
  readonly aEstado: string;
  readonly motivo: string;
}

function tenantDe(payload: unknown): string | null {
  if (payload !== null && typeof payload === "object" && "tenant_id" in payload) {
    const v = (payload as Record<string, unknown>)["tenant_id"];
    return typeof v === "string" && v ? v : null;
  }
  return null;
}

export type ConsumirSenalResult =
  | { readonly consumida: true; readonly salud: HealthCounters; readonly eventoVida?: EventoVidaNuevo; readonly acto: ActoAdmin }
  | { readonly consumida: false; readonly acto: ActoAdmin };

// Por qué acto siempre: PA2 exige que todo consumo (incluso descarte) quede
// auditado. El reader marca la señal consumida en ambos casos (idempotente).
export function consumir_senal(
  senal: SenalEntrante,
  saludPrevia: HealthCounters | null,
  ahora?: Date,
): ConsumirSenalResult {
  const at = (ahora ?? new Date()).toISOString();
  const base: HealthCounters = saludPrevia ?? {
    tenantsActivos: 0,
    tenantsSuspendidos: 0,
    demosPurgadas: 0,
    cobrosCentavos: 0n,
    ultimaSenalEn: null,
  };
  if (!es_senal_permitida(senal.tipo)) {
    return {
      consumida: false,
      acto: { kind: "senal_descartada", outboxId: senal.id, tipo: senal.tipo },
    };
  }
  const tenantId = tenantDe(senal.payload);
  const salud: HealthCounters = { ...base, ultimaSenalEn: at };
  if (senal.tipo === "tenant_aprovisionado") {
    return {
      consumida: true,
      salud: { ...salud, tenantsActivos: salud.tenantsActivos + 1 },
      acto: { kind: "senal_consumida", outboxId: senal.id, tenantId },
    };
  }
  if (senal.tipo === "demo_purgada") {
    return {
      consumida: true,
      salud: { ...salud, demosPurgadas: salud.demosPurgadas + 1 },
      acto: { kind: "senal_consumida", outboxId: senal.id, tenantId },
    };
  }
  return {
    consumida: true,
    salud,
    acto: { kind: "senal_consumida", outboxId: senal.id, tenantId },
  };
}
