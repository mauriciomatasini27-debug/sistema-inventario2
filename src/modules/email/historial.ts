// Núcleo puro NE14: historial en la app (90 días). Sin IO.
// Tocar abre la pantalla origen, no una copia del email. Reenvío es P1.

import type { TipoEmail } from "./catalogo.js";

export type EstadoEmail = "entregado" | "reboto" | "suprimido" | "pendiente";
export type EstadoWA = "entregado" | "leido" | "fallo";

export interface RegistroHistorial {
  readonly tipo: TipoEmail;
  readonly fechaMs: number;
  readonly estadoEmail: EstadoEmail;
  readonly estadoWA?: EstadoWA | undefined;
  readonly pantalla: string;
}

export interface ItemHistorial extends RegistroHistorial {
  readonly detalle: string;
}

const VENTANA_MS = 90 * 24 * 3600_000;

export function listar_historial(registros: ReadonlyArray<RegistroHistorial>, ahoraMs: number): ItemHistorial[] {
  return registros
    .filter((r) => ahoraMs - r.fechaMs <= VENTANA_MS)
    .sort((a, b) => b.fechaMs - a.fechaMs)
    .map((r) => ({
      ...r,
      detalle: r.estadoWA ? `Email: ${r.estadoEmail} · WhatsApp: ${r.estadoWA}` : `Email: ${r.estadoEmail}`,
    }));
}

// P1: reenviar desde el historial. Firma reservada para no bloquear el slice.
export function solicitar_reenvio(): { ok: false; motivo: "p1" } {
  return { ok: false, motivo: "p1" };
}
