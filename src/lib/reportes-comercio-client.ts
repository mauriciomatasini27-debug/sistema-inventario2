export type VistaReportes = "nuevo" | "lista" | "recibido";

export interface EnvioReporteOk {
  id: string;
  estado: string;
  reintento: boolean;
}

export function pantallaActual(): string {
  if (typeof window === "undefined") return "/panel";
  return `${window.location.pathname}`;
}

export function etiquetaEstado(estado: string): string {
  if (estado === "en_revision") return "En revisión";
  if (estado === "resuelto") return "Resuelto";
  return "Recibido";
}

export function nuevaClaveEnvio(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `local-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
