// Purga de demos vencidas (ON2: es_demo borra a los 14 días). Núcleo puro:
// decide qué tenants purgar; el job (src/jobs/purga-demos.ts) ejecuta.
import { DIAS_PRUEBA_GRATIS } from "./aprovisionar.js";

export interface TenantDemo {
  readonly id: string;
  readonly esDemo: boolean;
  readonly estado: string;
  readonly trialHasta: string | null;
}

// Demo vencida: es_demo, no dada de baja, con trial_hasta pasado. Sin
// trial_hasta no se purga (no se puede probar la edad del alta).
export function elegir_demos_a_purgar(tenants: ReadonlyArray<TenantDemo>, ahora: Date): string[] {
  const ids: string[] = [];
  for (const t of tenants) {
    if (!t.esDemo || t.estado === "baja") continue;
    if (!t.trialHasta) continue;
    if (new Date(t.trialHasta).getTime() <= ahora.getTime()) ids.push(t.id);
  }
  return ids;
}

export function dias_purga(): number {
  return DIAS_PRUEBA_GRATIS;
}
