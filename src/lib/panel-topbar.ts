import type { EstadoModo } from "./modo.js";

/** TB-BARRA-SUPERIOR: etiquetas de la barra y del menú de cuenta. */
export function inicialAvatar(nombre: string): string {
  const t = nombre.trim();
  if (!t) return "?";
  return t.charAt(0).toLocaleUpperCase("es-AR");
}

export function etiquetaRolPanel(rol: "dueno" | "empleado"): string {
  return rol === "dueno" ? "Dueño" : "Empleado";
}

export function textoEstadoModoBarra(estado: EstadoModo): string {
  if (estado === "minimizado") return "Modo discreto";
  if (estado === "pensando") return "Modo pensando";
  if (estado === "exito") return "Modo contento";
  if (estado === "alerta") return "Modo atento";
  return "Modo atento";
}

export function modoDiscretoActivo(estado: EstadoModo): boolean {
  return estado === "minimizado";
}

export function temaEsOscuro(datasetTema: string | undefined): boolean {
  return datasetTema !== "claro";
}

export interface DatosCuentaBarra {
  readonly nombre: string;
  readonly rol: string;
  readonly inicial: string;
}

export function datosCuentaBarra(
  nombre: string | null | undefined,
  rol: "dueno" | "empleado" | null,
): DatosCuentaBarra {
  const nombreFinal = nombre?.trim() || "Miembro";
  return {
    nombre: nombreFinal,
    rol: rol ? etiquetaRolPanel(rol) : "—",
    inicial: inicialAvatar(nombreFinal),
  };
}

const SELECTOR_FOCO =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function elementosEnfocables(contenedor: ParentNode): HTMLElement[] {
  return [...contenedor.querySelectorAll<HTMLElement>(SELECTOR_FOCO)].filter(
    (el) => !el.hasAttribute("disabled") && el.getAttribute("aria-hidden") !== "true",
  );
}

/** TB-BARRA-SUPERIOR: orden circular al atrapar Tab en el menú de cuenta. */
export function indiceTabAtrapado(
  total: number,
  actual: number,
  haciaAtras: boolean,
): number {
  if (total <= 0) return -1;
  if (haciaAtras) return actual <= 0 ? total - 1 : actual - 1;
  return actual >= total - 1 ? 0 : actual + 1;
}
