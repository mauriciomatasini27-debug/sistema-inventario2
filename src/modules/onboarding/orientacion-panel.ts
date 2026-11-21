// TB-165: la guía corta del panel se decide en servidor. El Dueño conserva su
// diálogo de bienvenida; el Empleado recibe sólo los pasos de su rol filtrados
// por la membership activa. Sin sesión determinable no se inventa orientación.
import { pasos_para_rol, type PasoTour } from "./tour.js";

export type RolParaOrientacion = "dueno" | "empleado" | null;

export function pasosGuiaEmpleado(
  rol: RolParaOrientacion,
  permisos: readonly string[] = [],
): PasoTour[] {
  if (rol !== "empleado") return [];
  return pasos_para_rol("empleado", [...permisos]);
}

export interface OrientacionPanel {
  // TB-165: diálogo de bienvenida y enlace «Configurar comercio», sólo del Dueño.
  mostrarBienvenida: boolean;
  pasosEmpleado: PasoTour[];
}

// TB-165: una sola decisión testeable para la vista. `esDueno` viene del
// guard de membership del servidor; el rol y permisos, de la sesión activa.
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
