import { horaMinutoAR } from "./fecha-ar.js";

// DASH-S3: lógica de cliente de la tarjeta `Bot` del índice de /panel. Sin DOM:
// solo formatea para que la pantalla pinte con textContent.

export function formatearUltimaConsulta(ultimaEnMs: number | null): string {
  if (ultimaEnMs === null) return "Todavía no hubo consultas";
  return horaMinutoAR(ultimaEnMs);
}
