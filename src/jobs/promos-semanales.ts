import { sugerir_promo, type PromoPct } from "../modules/analytics/promociones.js";
import { listar_dormidos } from "../modules/analytics/selectores.js";
import { DEFAULT_SETTINGS, type FilaRotacion } from "../modules/analytics/tipos.js";
import { formatear_pesos } from "../modules/email/plantilla-cierre.js";
import type { Sugerencia } from "../modules/whatsapp/promos.js";

function pct_por_antiguedad(diasSinVenta: number): PromoPct {
  if (diasSinVenta >= 90) return 20;
  if (diasSinVenta >= 60) return 15;
  return 10;
}

export function sugerencias_promos_rotacion(filas: ReadonlyArray<FilaRotacion>): Sugerencia[] {
  const porSku = new Map(filas.map((f) => [f.sku, f]));
  const out: Sugerencia[] = [];
  for (const dormido of listar_dormidos(filas, new Set(), DEFAULT_SETTINGS)) {
    const fila = porSku.get(dormido.sku);
    if (!fila) continue;
    // P10-32 [tenant]: la fila RT2 slice-0 no trae precio vigente; sin ventas
    // en la ventana no hay precio confiable y el candidato se descarta.
    const precio =
      fila.neto > 0 && fila.ingresosCentavos > 0n ? fila.ingresosCentavos / BigInt(fila.neto) : 0n;
    const objetivo = pct_por_antiguedad(dormido.diasSinVenta);
    const opciones = sugerir_promo({
      vigenteCentavos: precio,
      costoCentavos: fila.costoCentavos,
      markupMinBp: DEFAULT_SETTINGS.markupMinBp,
    });
    const elegida =
      opciones.find((o) => o.pct === objetivo && o.viable) ??
      [...opciones].reverse().find((o) => o.viable);
    if (!elegida || elegida.precioPromoCentavos <= 0n) continue;
    const recortada = elegida.pct !== objetivo;
    out.push({
      sku: fila.sku,
      nombre: fila.nombre,
      motivo: "dormido",
      promo: "segunda_X_desc",
      impactoCentavos: dormido.inmovilizadoCentavos,
      diasDormido: dormido.diasSinVenta,
      detalle: `2da unidad al ${elegida.pct}% (${formatear_pesos(elegida.precioPromoCentavos)}${recortada ? ", recortado por piso de costo" : ""}). Ver detalle en la web`,
    });
  }
  return out;
}
