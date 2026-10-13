// CAEA contingencia Fase 4 (FE-S27, ADR-0018 D6, RG 5782).
// Desactivado por defecto. Solo contingencias 15016-15018.
// CbteFchHsGen obligatorio cuando activo + FECAEARegInformativo en plazo.
export const CAEA_ACTIVO_DEFAULT = false as const;

export function caea_habilitado(params: Record<string, string | undefined>): boolean {
  return params["CAEA_ACTIVO"] === "on";
}

export function validar_cbte_fch_hs_gen(v: string): boolean {
  return /^\d{8} \d{6}$/.test(v);
}
