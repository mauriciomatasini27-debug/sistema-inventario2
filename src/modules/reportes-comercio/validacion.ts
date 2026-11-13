import { z } from "zod";

export const MAX_TEXTO_REPORTE = 2000;
export const MIN_TEXTO_REPORTE = 8;

export const cuerpoCrearReporte = z.object({
  tipo: z.enum(["problema", "sugerencia"]),
  texto: z
    .string()
    .trim()
    .min(MIN_TEXTO_REPORTE, "Contá un poco más para que podamos entender.")
    .max(MAX_TEXTO_REPORTE, "El texto es demasiado largo."),
  ruta_sugerida: z.string().max(200).optional(),
  pantalla: z.string().max(80).optional(),
});

export const cuerpoEstadoAdmin = z.object({
  estado: z.enum(["recibido", "en_revision", "resuelto"]),
  confirmo_id: z.string().min(1),
  motivo: z.string().min(1).max(500),
});

export type CuerpoCrearReporte = z.infer<typeof cuerpoCrearReporte>;
