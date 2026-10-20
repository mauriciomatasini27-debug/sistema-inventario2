import { control } from "./store.js";
import { tenantActual, tenantPorDefecto } from "./tenant-mode.js";
import { EVENTO_UBICACIONES_SEMBRADAS } from "../modules/onboarding/ubicaciones-rubro.js";

export function existeEventoDeTenant(
  tipo: string,
  tenantId: string = tenantActual() ?? tenantPorDefecto(),
): boolean {
  return control.events.some((e) => e.tenantId === tenantId && e.tipo === tipo);
}

export function ubicacionesSembradasPorRubro(tenantId?: string): boolean {
  return existeEventoDeTenant(EVENTO_UBICACIONES_SEMBRADAS, tenantId);
}
