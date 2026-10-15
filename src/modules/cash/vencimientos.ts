export interface VencimientoAvisable {
  readonly id: string;
  readonly venceEl: string;
  readonly estado: string;
  readonly avisadoEl?: string | null | undefined;
}

export const VENTANA_AVISO_MS = 3 * 86_400_000;

export function vencimientosAAvisar<T extends VencimientoAvisable>(items: ReadonlyArray<T>, ahora: number): T[] {
  const avisan: T[] = [];
  for (const d of items) {
    if (d.estado !== "pendiente") continue;
    if (d.avisadoEl !== null && d.avisadoEl !== undefined) continue;
    if (new Date(d.venceEl).getTime() - ahora > VENTANA_AVISO_MS) continue;
    avisan.push(d);
  }
  return avisan;
}
