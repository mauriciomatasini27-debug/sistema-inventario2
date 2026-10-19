import {
  crearAsistente,
  crear_catalogo,
  detectar_intencion,
  type LecturasIA,
  type RespuestaAsistente,
} from "../ia/asistente.js";
import type { ProveedorLLM } from "../ia/proveedor.js";
import type { RegistroUsoIA } from "../ia/registro.js";

const CATALOGO = crear_catalogo();

export function reconoce_pregunta_ia(texto: string): boolean {
  return detectar_intencion(texto, CATALOGO) !== null;
}

export interface EntradaAsistenteBot {
  readonly texto: string;
  readonly tenantId: string;
  readonly rol: "dueno" | "empleado";
  readonly proveedor: ProveedorLLM;
  readonly registro: RegistroUsoIA;
  readonly cupoConsultasPorMes?: number;
  readonly lecturas?: LecturasIA;
  readonly mesActual?: () => string;
}

// IA-S4: el canal WhatsApp usa el mismo núcleo del asistente. El plan lo
// resuelve el webhook antes de llamar; fuera de catálogo devuelve null para
// que siga el flujo actual.
export async function preguntar_asistente_bot(
  entrada: EntradaAsistenteBot,
): Promise<RespuestaAsistente | null> {
  if (!reconoce_pregunta_ia(entrada.texto)) return null;
  const asistente = crearAsistente({
    proveedor: entrada.proveedor,
    registro: entrada.registro,
    ...(entrada.lecturas ? { lecturas: entrada.lecturas } : {}),
    ...(entrada.cupoConsultasPorMes !== undefined
      ? { cupoConsultasPorMes: entrada.cupoConsultasPorMes }
      : {}),
    ...(entrada.mesActual ? { mesActual: entrada.mesActual } : {}),
  });
  return asistente.preguntar({ tenantId: entrada.tenantId, rol: entrada.rol }, entrada.texto);
}
