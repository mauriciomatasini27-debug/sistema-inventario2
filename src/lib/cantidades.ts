export const MAX_GRAMOS = 1_000_000;
export const MAX_UNIDADES = 999;

export function esCantidadValida(cantidad: number, porPeso: boolean | undefined): boolean {
  if (!Number.isInteger(cantidad) || cantidad < 1) return false;
  return porPeso === true ? cantidad <= MAX_GRAMOS : cantidad <= MAX_UNIDADES;
}
