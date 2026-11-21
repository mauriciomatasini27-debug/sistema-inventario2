import { control } from "../lib/store.js";
import { adminStore } from "../lib/admin-store.js";
import { aplicar_evento_vida } from "../modules/admin/mora.js";
import { fechaAR } from "../lib/fecha-ar.js";


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
