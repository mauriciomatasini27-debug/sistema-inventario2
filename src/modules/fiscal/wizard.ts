// Wizard fiscal pasos 0-6 + delegación (FE-S4/S5/S6, ADR-0018 D2).
// Puro: pasos con pausa/resume; delegación Ya-lo-hice → pendiente_proveedor.
export const WIZARD_PASOS = [0, 1, 2, 3, 4, 5, 6] as const;

export type DelegacionEstado = "pendiente" | "pendiente_proveedor" | "activa" | "revocada" | "lista_espera";

export interface WizardEstado {
  readonly paso: number;
  readonly delegacion: DelegacionEstado;
  readonly pausaEn: number | null;
}

export function wizard_inicial(): WizardEstado {
  return { paso: 0, delegacion: "pendiente", pausaEn: null };
}

export function wizard_avanzar(w: WizardEstado, paso: number): WizardEstado {
  if (!Number.isInteger(paso) || paso < 0 || paso > 6) return w;
  return { ...w, paso, pausaEn: null };
}

export function wizard_pausar(w: WizardEstado): WizardEstado {
  return { ...w, pausaEn: w.paso };
}

export function wizard_resumir(w: WizardEstado): WizardEstado {
  return { ...w, paso: w.pausaEn ?? w.paso, pausaEn: null };
}

export function confirmar_delegacion(w: WizardEstado): WizardEstado {
  return { ...w, delegacion: "pendiente_proveedor" };
}

export function resolver_delegacion(w: WizardEstado, ok: boolean, esRIetapa1 = false): WizardEstado {
  if (esRIetapa1) return { ...w, delegacion: "lista_espera" };
  return { ...w, delegacion: ok ? "activa" : "pendiente_proveedor" };
}

export function revocar_delegacion(w: WizardEstado): WizardEstado {
  return { ...w, delegacion: "revocada" };
}
