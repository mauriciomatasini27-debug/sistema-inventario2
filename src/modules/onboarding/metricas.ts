// Métricas ON12 sin UX. Eventos en control sin datos de negocio.
// Puro sin IO. Rige Ley 25.326: sin contenido de mensajes ni negocio.
export const EVENTOS_ONBOARDING = [
  "login_google_primera_vez",
  "alta_formulario_completo",
  "whatsapp_vincular_mostrado",
  "whatsapp_vincular_recibido",
  "whatsapp_verificado",
  "aprovisionamiento_inicio",
  "aprovisionamiento_fin",
  "bienvenida_enviada",
  "bienvenida_respondida",
  "primer_ingreso_app",
  "tour_completado",
  "video_fin",
  "primer_producto",
  "decimo_producto",
  "primera_venta",
  "primera_consulta_bot",
] as const;

export type EventoOnboarding = (typeof EVENTOS_ONBOARDING)[number];

export interface PuntoEmbudo {
  evento: string;
  total: number;
}

export function cuantil(ordenados: number[], q: number): number | null {
  if (ordenados.length === 0) return null;
  const i = Math.min(ordenados.length - 1, Math.floor(q * ordenados.length));
  return ordenados[i]!;
}

// TTFV: login hasta primer valor en minutos. Mediana y p75.
export function calcular_ttfv(minutos: number[]): { mediana: number | null; p75: number | null } {
  const xs = [...minutos].sort((a, b) => a - b);
  return { mediana: cuantil(xs, 0.5), p75: cuantil(xs, 0.75) };
}

// Comercio activado: 10 productos más 1 umbral más 1 uso real en 7 días.
export function comercio_activado(input: {
  productos: number;
  conUmbral: number;
  usoReal: boolean;
  diasDesdeAlta: number;
}): boolean {
  return input.productos >= 10 && input.conUmbral >= 1 && input.usoReal && input.diasDesdeAlta <= 7;
}

export function embudo_por_etapa(conteos: Record<string, number>, orden: string[]): PuntoEmbudo[] {
  return orden.map((evento) => ({ evento, total: conteos[evento] ?? 0 }));
}
