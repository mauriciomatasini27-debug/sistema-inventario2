// Bandeja fiscal (FE-S20/FE11.1-2-6, ADR-0018 Errores). Núcleo puro.
// R nunca reintenta automático: texto castellano + acción.
export type AccionBandeja = "completar" | "reenviar" | "no_facturar" | "esperar";

export function texto_castellano(codigo: string): string {
  switch (codigo) {
    case "10015":
      return "Rechazada: dato inválido. Completá y reenviá.";
    case "10016":
      return "Rechazada: período o número. Resync hecho, reenviá.";
    case "iva-receptor":
      return "Rechazada: condición IVA del receptor inválida.";
    case "600":
    case "601":
      return "Falta confirmar delegación.";
    case "cert.expired":
      return "Certificado vencido. Pausada + alerta Control Plane.";
    case "timeout":
      return "Sin respuesta de ARCA. Se consulta antes de reenviar.";
    default:
      return `Rechazada (${codigo}). Revisá y reenviá.`;
  }
}

export function accion_para(codigo: string): AccionBandeja {
  const c = codigo;
  if (c === "10015" || c === "iva-receptor") return "completar";
  if (c === "10016") return "reenviar";
  if (c === "600" || c === "601" || c === "cert.expired") return "esperar";
  if (c === "timeout" || c === "5xx" || c === "fedummy-caido") return "reenviar";
  return "completar";
}
