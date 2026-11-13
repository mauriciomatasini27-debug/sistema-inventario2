import {
  elementosEnfocables,
  indiceTabAtrapado,
  modoDiscretoActivo,
  temaEsOscuro,
} from "./panel-topbar.js";
import type { EstadoModo } from "./modo.js";

export { elementosEnfocables, indiceTabAtrapado };

export function cuentaMenuAbierto(expanded: boolean, hidden: boolean): boolean {
  return expanded && !hidden;
}

export function debeCerrarMenuTecla(tecla: string, menuAbierto: boolean): boolean {
  return menuAbierto && tecla === "Escape";
}

export function temaSwitchMarcado(datasetTema: string | undefined): boolean {
  return temaEsOscuro(datasetTema);
}

export function discretoSwitchMarcado(estado: EstadoModo): boolean {
  return modoDiscretoActivo(estado);
}
