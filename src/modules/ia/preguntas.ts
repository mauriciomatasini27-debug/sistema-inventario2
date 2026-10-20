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

// DASH-S7 (PRD-DASH-01): el drawer muestra entre 8 y 12 chips. Primero una
// pregunta por herramienta conectada y después las segundas variantes, hasta 12.
export const MAX_PREGUNTAS_SUGERIDAS = 12;

export function preguntasSugeridas(
  lecturas: LecturasIA,
  rol: SesionIA["rol"],
): PreguntaSugerida[] {
  const disponibles = crear_catalogo(lecturas).filter(
    (herramienta) => herramienta.ejecutar && !(herramienta.soloDueno && rol !== "dueno"),
  );
  const rondas = Math.max(0, ...disponibles.map((h) => PLANTILLAS[h.nombre].length));
  const preguntas: PreguntaSugerida[] = [];
  for (let ronda = 0; ronda < rondas; ronda++) {
    for (const herramienta of disponibles) {
      const texto = PLANTILLAS[herramienta.nombre][ronda];
      if (texto !== undefined) preguntas.push({ texto, herramienta: herramienta.nombre });
    }
  }
  return preguntas.slice(0, MAX_PREGUNTAS_SUGERIDAS);
}
