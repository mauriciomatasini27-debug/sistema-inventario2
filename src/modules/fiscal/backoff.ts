// Backoff fiscal (FE-S19/S20, ADR-0018 Errores). Núcleo puro.
// Transitorio (timeout, 5xx, FEDummy caído): 30s, 2m, 10m, 30m, luego 1h.
// Negocio (R: 10015/10016/IVA receptor): no reintenta, va a bandeja.
export const PASOS_MS = [30_000, 120_000, 600_000, 1_800_000, 3_600_000] as const;
export const PASO_LUEGO_MS = 3_600_000 as const;

export function proximo_intento(intentos: number, ahoraMs: number): number {
  const paso = intentos < PASOS_MS.length ? PASOS_MS[intentos]! : PASO_LUEGO_MS;
  return ahoraMs + paso;
}

export type ClaseError = "transitorio" | "autorizacion" | "negocio";

export function clasificar_error(codigo: string): ClaseError {
  if (codigo === "600" || codigo === "601" || codigo === "notAuthorized" || codigo === "cert.expired") return "autorizacion";
  if (codigo === "10015" || codigo === "10016" || codigo === "iva-receptor" || codigo.startsWith("R")) return "negocio";
  return "transitorio";
}

export function es_reintentable(codigo: string): boolean {
  return clasificar_error(codigo) === "transitorio";
}
