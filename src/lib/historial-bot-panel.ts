export const ALTO_FILA_PX = 88;
export const OVERSCAN = 4;

export interface Ventana {
  readonly desde: number;
  readonly hasta: number;
  readonly altoTotal: number;
  readonly offsetY: number;
}

export function ventanaVisible(args: {
  total: number;
  scrollTop: number;
  altoVista: number;
}): Ventana {
  const desde = Math.max(0, Math.floor(args.scrollTop / ALTO_FILA_PX) - OVERSCAN);
  const hasta = Math.min(args.total, Math.ceil((args.scrollTop + args.altoVista) / ALTO_FILA_PX) + OVERSCAN);
  return {
    desde,
    hasta,
    altoTotal: args.total * ALTO_FILA_PX,
    offsetY: desde * ALTO_FILA_PX,
  };
}
