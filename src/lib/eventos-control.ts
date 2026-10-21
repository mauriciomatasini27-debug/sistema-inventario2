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

// PRD-STOCK-01 STOCK-S8 (ADR-0107): espejo en memoria de tenant_product_seeds
// para single sin DB. La clave es el tenant, no la partición de store.
export function productosSembradosRubro(tenantId: string): boolean {
  return control.semillasProductos.has(tenantId);
}

export function marcarProductosSembradosRubro(tenantId: string): void {
  control.semillasProductos.add(tenantId);
}
