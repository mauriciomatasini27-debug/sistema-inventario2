import { plantilla_rubro } from "./plantillas-rubro.js";

export const ORIGEN_PLANTILLA_RUBRO = "Sistema (plantilla de rubro)";
export const EVENTO_UBICACIONES_SEMBRADAS = "ubicaciones_sembradas_rubro";
export const EVENTO_UBICACIONES_SEMBRADAS_ERROR = "ubicaciones_sembradas_rubro_error";

export interface UbicacionExistente {
  archivada: boolean;
}

export function nombresUbicacionesRubro(
  rubro: string,
  existentes: ReadonlyArray<UbicacionExistente>,
): string[] {
  if (existentes.length > 0) return [];
  return [...plantilla_rubro(rubro).ubicaciones];
}
