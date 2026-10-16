// SYNC-S7 (PRD-SYNC-01) / OF16.1.6+OF9.5 / FC13.8: tipos de op de outbox
// (`payload.tipo`) que nunca se aplican desde la vía offline. El push
// responde `necesita_conexion` sin persistir y el encolado local lanza
// NecesitaConexionError ("Necesita conexión").
// Hoja pura sin imports: la usan el gate del servidor, el repo de sync y la
// cola offline sin ciclos ni store.
export const OPERACIONES_SOLO_ONLINE = [
  "cambio_tope",
  "cambio_plazo",
  "baja_fiado",
  "ajuste_stock",
  "ajuste_precio",
  "reversion",
  "export",
] as const;
export type OperacionSoloOnline = (typeof OPERACIONES_SOLO_ONLINE)[number];

export const CODIGO_NECESITA_CONEXION = "necesita_conexion" as const;
export const MENSAJE_NECESITA_CONEXION = "Necesita conexión";

export class NecesitaConexionError extends Error {
  readonly codigo = CODIGO_NECESITA_CONEXION;
  constructor(mensaje: string = MENSAJE_NECESITA_CONEXION) {
    super(mensaje);
    this.name = "NecesitaConexionError";
  }
}

/** ¿Este `payload.tipo` de outbox es sensible y exige online? */
export function esOperacionSoloOnline(tipo: unknown): tipo is OperacionSoloOnline {
  return (
    typeof tipo === "string" &&
    (OPERACIONES_SOLO_ONLINE as readonly string[]).includes(tipo)
  );
}
