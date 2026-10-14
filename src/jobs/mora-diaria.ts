import { control } from "../lib/store.js";
import { adminStore } from "../lib/admin-store.js";
import { aplicar_evento_vida } from "../modules/admin/mora.js";
import { fechaAR } from "../lib/fecha-ar.js";

// Job mora diaria PA7 (06:00 America/Argentina). Reconcilia lifecycle events
// pendientes: aplica a control.tenants todo evento cuyo efecto no esté
// reflejado (consumidor control-side; en monoproceso las rutas ya aplican
// inline, acá queda el camino multiproceso). La suspensión automática por
// deuda vive en fase 2 con cargos (hoy la cobranza es manual MVP: evaluar +
// suspender/regularizar desde el panel).
// Idempotente por clave mora:YYYY-MM-DD: re-corridas del mismo día retornan ya.

export function ejecutarMoraDiaria(ahora = new Date()): {
  ya: boolean;
  fecha: string;
  aplicados: string[];
} {
  const fecha = fechaAR(ahora);
  const clave = `mora:${fecha}`;
  if (adminStore.moraRuns.has(clave)) {
    return { ya: true, fecha, aplicados: [] };
  }
  const aplicados: string[] = [];
  for (const e of adminStore.eventosVida) {
    const tenant = control.tenants.get(e.tenantId);
    if (!tenant) continue;
    if (tenant.estado === e.aEstado) continue;
    tenant.estado = aplicar_evento_vida(tenant.estado, e.aEstado);
    aplicados.push(e.tenantId);
  }
  adminStore.moraRuns.set(clave, { fecha, aplicados, corridoEn: ahora.toISOString() });
  return { ya: false, fecha, aplicados };
}
