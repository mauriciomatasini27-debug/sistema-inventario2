// Núcleo puro B15: sugerencias de promo. Sin IO.
// Max 3 por impacto, 1 línea WA + Ver detalle web, descarte 2 semanas,
// alerta de vencimiento opcional max 1/día. Rioplatense, sin emojis.

import { formatear_pesos } from "../email/plantilla-cierre.js";

export type MotivoPromo = "dormido" | "vencer" | "sobrestock" | "combo";
export type TipoPromo = "2x1" | "NxM" | "segunda_X_desc" | "combo";

export interface Sugerencia {
  readonly sku: string;
  readonly nombre: string;
  readonly motivo: MotivoPromo;
  readonly promo: TipoPromo;
  readonly impactoCentavos: bigint;
  readonly detalle: string;
  readonly diasDormido?: number | undefined;
  readonly venceEnDias?: number | undefined;
  readonly stock?: number | undefined;
}

export const MAX_SUGERENCIAS = 3 as const;
export const DESCARTE_MS = 14 * 24 * 60 * 60 * 1000;
export const PLANTILLA_ALERTA_VENCIMIENTO = "alerta_vencimiento_promo" as const;

// Top 3 por impacto esperado (mayor recupero primero). Estable por sku.
export function topear_3_por_impacto(sugerencias: ReadonlyArray<Sugerencia>): Sugerencia[] {
  return [...sugerencias]
    .sort((a, b) => {
      if (a.impactoCentavos !== b.impactoCentavos) return a.impactoCentavos > b.impactoCentavos ? -1 : 1;
      return a.sku < b.sku ? -1 : a.sku > b.sku ? 1 : 0;
    })
    .slice(0, MAX_SUGERENCIAS);
}

function motivo_corto(m: MotivoPromo, s: Sugerencia): string {
  switch (m) {
    case "dormido":
      return s.diasDormido != null ? `dormido ${s.diasDormido}d` : "dormido";
    case "vencer":
      return s.venceEnDias != null ? `vence en ${s.venceEnDias}d` : "por vencer";
    case "sobrestock":
      return s.stock != null ? `sobrestock ${s.stock} u.` : "sobrestock";
    case "combo":
      return "combo";
  }
}

// 1 línea WA por sugerencia: nombre + promo + motivo + impacto.
export function armar_linea_promo(s: Sugerencia): string {
  return `${s.nombre}: ${s.promo} (${motivo_corto(s.motivo, s)}), recupera ${formatear_pesos(s.impactoCentavos)}. ${s.detalle}`;
}

export interface BloquePromosWa {
  readonly lineas: ReadonlyArray<string>;
  readonly botones: ReadonlyArray<{ readonly id: string; readonly titulo: string }>;
}

// Dentro del viernes sin plantilla extra: el botón Ver promos abre la
// ventana web con el detalle (el adaptador resuelve la URL).
export function armar_bloque_promos(top3: ReadonlyArray<Sugerencia>): BloquePromosWa {
  return {
    lineas: top3.map(armar_linea_promo),
    botones: [
      { id: "crear_promo", titulo: "Crear promo" },
      { id: "ahora_no_promo", titulo: "Ahora no" },
      { id: "ver_detalle_promo", titulo: "Ver detalle" },
    ],
  };
}

export function url_ver_promos(baseWeb: string, tenantId: string): string {
  return `${baseWeb}/promos?sugeridas=1&tenant=${encodeURIComponent(tenantId)}`;
}

// --- Descarte 2 semanas (botón Ahora no) ---

export type TiendaDescartes = Map<string, number>;

function clave_descarte(tenantId: string, sku: string): string {
  return `promo_desc:${tenantId}:${sku}`;
}

export function descartar_2_semanas(
  tienda: TiendaDescartes,
  args: { tenantId: string; sku: string; ahoraMs: number },
): void {
  tienda.set(clave_descarte(args.tenantId, args.sku), args.ahoraMs + DESCARTE_MS);
}

export function esta_descartada(
  tienda: TiendaDescartes,
  args: { tenantId: string; sku: string; ahoraMs: number },
): boolean {
  const hasta = tienda.get(clave_descarte(args.tenantId, args.sku));
  return hasta != null && args.ahoraMs < hasta;
}

export function filtrar_descartadas(
  tienda: TiendaDescartes,
  args: { tenantId: string; ahoraMs: number; sugerencias: ReadonlyArray<Sugerencia> },
): Sugerencia[] {
  return args.sugerencias.filter(
    (s) => !esta_descartada(tienda, { tenantId: args.tenantId, sku: s.sku, ahoraMs: args.ahoraMs }),
  );
}

// --- Alerta vencimiento promo (opcional, max 1/día) ---

export type TiendaAlertas = Map<string, string>;

function clave_alerta(tenantId: string, diaISO: string): string {
  return `alerta_venc:${tenantId}:${diaISO}`;
}

export function puede_alertar_vencimiento(
  tienda: TiendaAlertas,
  args: { tenantId: string; diaISO: string; activada: boolean },
): boolean {
  if (!args.activada) return false;
  return !tienda.has(clave_alerta(args.tenantId, args.diaISO));
}

export function armar_alerta_vencimiento(args: {
  nombrePromo: string;
  vence: string;
}): { readonly plantilla: typeof PLANTILLA_ALERTA_VENCIMIENTO; readonly texto: string } {
  return {
    plantilla: PLANTILLA_ALERTA_VENCIMIENTO,
    texto: `La promo ${args.nombrePromo} vence ${args.vence}. ¿La extendemos un par de días más?`,
  };
}

export function registrar_alerta(
  tienda: TiendaAlertas,
  args: { tenantId: string; diaISO: string; promoId: string },
): { status: 201 } | { status: 409 } {
  const key = clave_alerta(args.tenantId, args.diaISO);
  if (tienda.has(key)) return { status: 409 };
  tienda.set(key, args.promoId);
  return { status: 201 };
}
