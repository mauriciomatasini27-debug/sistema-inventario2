// TB-165 [rol]: orientación del panel en servidor según rol y membership activa.
import { pasos_para_rol, type PasoTour } from "./tour.js";

export type RolParaOrientacion = "dueno" | "empleado" | null;

export function pasosGuiaEmpleado(
  rol: RolParaOrientacion,
  permisos: readonly string[] = [],
): PasoTour[] {
  if (rol !== "empleado") return [];
  return pasos_para_rol("empleado", [...permisos]);
}

export function urlCuestionario(mostrar: boolean, tenantId: string): string | null {
  if (!mostrar || !tenantId) return null;
  return `/onboarding?tenant_id=${encodeURIComponent(tenantId)}`;
}

export interface OrientacionPanel {
  mostrarBienvenida: boolean;
  pasosEmpleado: PasoTour[];
}

export function orientacionParaPanel(
  rol: RolParaOrientacion,
  permisos: readonly string[],
  esDueno: boolean,
): OrientacionPanel {
  return {
    mostrarBienvenida: esDueno && rol !== "empleado",
    pasosEmpleado: pasosGuiaEmpleado(rol, permisos),
  };
}