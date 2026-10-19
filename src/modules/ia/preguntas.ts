import {
  crear_catalogo,
  type LecturasIA,
  type NombreHerramienta,
  type SesionIA,
} from "./asistente.js";

export interface PreguntaSugerida {
  readonly texto: string;
  readonly herramienta: NombreHerramienta;
}

const PLANTILLAS: Record<NombreHerramienta, readonly string[]> = {
  top_productos: ["¿Qué productos se vendieron más este mes?", "¿Cuáles son los productos más vendidos?"],
  ventas_periodo: ["¿Cuánto vendí este mes?", "¿Cómo vienen las ventas del mes?"],
  por_vencer: ["¿Qué está por vencer?", "¿Qué productos vencen pronto?"],
  deudores: ["¿Quién me debe más?", "¿Cómo está el fiado?"],
  stock_bajo: ["¿Qué productos tienen stock bajo?", "¿Qué me falta reponer?"],
  margen_producto: ["¿Cuál es el margen del producto?"],
  caja_dia: ["¿Cuánto hay en caja?", "¿Cómo está la caja del día?"],
  rotacion_lenta: ["¿Qué productos no rotan?", "¿Qué está estancado?"],
};

export function preguntasSugeridas(
  lecturas: LecturasIA,
  rol: SesionIA["rol"],
): PreguntaSugerida[] {
  const catalogo = crear_catalogo(lecturas);
  return catalogo.flatMap((herramienta) => {
    if (!herramienta.ejecutar) return [];
    if (herramienta.soloDueno && rol !== "dueno") return [];
    return PLANTILLAS[herramienta.nombre].map((texto) => ({
      texto,
      herramienta: herramienta.nombre,
    }));
  });
}
