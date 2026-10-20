export const CLAVE_AVISO_UBICACIONES = "on4.5:aviso-ubicaciones-sembradas";

export interface DecisionAvisoUbicaciones {
  readonly sembradasPorRubro: boolean;
  readonly descartado: boolean;
}

export function mostrarAvisoUbicaciones({ sembradasPorRubro, descartado }: DecisionAvisoUbicaciones): boolean {
  return sembradasPorRubro && !descartado;
}
