// Núcleo puro B2 opt-in / opt-out / pausa (PRD Bot B2.3-B2.5). Sin IO.
// El adaptador persiste en notification_preferences (upsert usuario+tenant).

export type ComandoAviso =
  | { readonly kind: "baja" }
  | { readonly kind: "alta" }
  | { readonly kind: "pausa"; readonly dias: number }
  | { readonly kind: "cambio_hora"; readonly hora: string }
  | { readonly kind: "ninguno" };

const SIN_TILDES = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

export function parsear_comando_aviso(texto: string): ComandoAviso {
  const t = SIN_TILDES(texto.trim());
  if (/^(baja|stop|no quiero mas avisos)$/.test(t)) return { kind: "baja" };
  if (/^(alta|quiero avisos)$/.test(t)) return { kind: "alta" };
  const pausa = t.match(/^pausar avisos (\d{1,2}) dias?$/);
  if (pausa) return { kind: "pausa", dias: Math.min(30, Math.max(1, Number(pausa[1]))) };
  if (t === "pausar avisos") return { kind: "pausa", dias: 7 };
  const hora = t.match(/^aviso (\d{1,2}):(\d{2})$/);
  if (hora) {
    const h = Number(hora[1]);
    const m = Number(hora[2]);
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
      return { kind: "cambio_hora", hora: `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}` };
    }
  }
  return { kind: "ninguno" };
}

export interface Preferencias {
  readonly optIn: boolean;
  readonly avisoHora: string;
  readonly pausadoHastaMs: number | null;
}

export function puede_enviar_whatsapp(prefs: Preferencias, ahoraMs: number): boolean {
  if (!prefs.optIn) return false;
  if (prefs.pausadoHastaMs != null && ahoraMs < prefs.pausadoHastaMs) return false;
  return true;
}

export const RESPUESTA_BAJA =
  "Listo, no te voy a mandar mas avisos. Podes seguir consultando cuando quieras. Para volver a activarlos escribi ALTA." as const;
