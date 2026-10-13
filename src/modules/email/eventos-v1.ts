// Núcleo puro NE17: turno, conteo, fiado, lotes y promos. Sin IO.
// Email + app; WA solo si tambienWA activo (lo lee el orquestador en prefs).

import { formatear_pesos } from "./plantilla-cierre.js";
import type { TipoEmail } from "./catalogo.js";

export interface EventoEmail {
  readonly tipo: TipoEmail;
  readonly dedupeKey: string;
  readonly idempotencyKey: string;
  readonly asunto: string;
  readonly html: string;
  readonly texto: string;
}

function base(html: string): string {
  return (
    `<div style="max-width:600px;margin:0 auto;background:#f7f5f2;font-family:sans-serif;">` +
    `<div style="padding:24px 20px;">${html}` +
    `<p style="font-size:12px;color:#6b6259;">Preferencias: {{preferencias_url}} · Baja: {{baja_url}}</p></div></div>`
  );
}

function escapar(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// NE17.1: fuera de tolerancia. Dentro de tolerancia no genera aviso.
export function describir_diferencia_turno(args: {
  entregaId: string;
  diferenciaCentavos: bigint;
  esperadoCentavos: bigint;
  contadoCentavos: bigint;
  quienEntrega: string;
  quienRecibe: string;
  motivo: string;
}): EventoEmail | null {
  if (args.diferenciaCentavos > -50000n && args.diferenciaCentavos < 50000n && args.diferenciaCentavos !== 0n) {
    // Dentro de tolerancia ±$500: solo va en el resumen de cierre.
    return null;
  }
  if (args.diferenciaCentavos === 0n) return null;
  const dedupeKey = `diferencia_turno:${args.entregaId}`;
  return {
    tipo: "diferencia_turno",
    dedupeKey,
    idempotencyKey: `${dedupeKey}:email`,
    asunto: `Diferencia de turno: ${formatear_pesos(args.diferenciaCentavos)}`,
    html: base(
      `<p>Diferencia ${formatear_pesos(args.diferenciaCentavos)} (esperado ${formatear_pesos(args.esperadoCentavos)}, contado ${formatear_pesos(args.contadoCentavos)}). ` +
        `${escapar(args.quienEntrega)} → ${escapar(args.quienRecibe)}. Motivo: ${escapar(args.motivo)}</p>` +
        `<a href="{{turnos_url}}">Resolver</a>`,
    ),
    texto:
      `Diferencia ${formatear_pesos(args.diferenciaCentavos)} (esperado ${formatear_pesos(args.esperadoCentavos)}, contado ${formatear_pesos(args.contadoCentavos)}). ${args.quienEntrega} → ${args.quienRecibe}.\n[Resolver]\nBaja: {{baja_url}}`,
  };
}

// NE17.2: disputa y su resolución.
export function describir_disputa(args: { entregaId: string; conteoA: bigint; conteoB: bigint }): EventoEmail {
  const dedupeKey = `entrega_disputa:${args.entregaId}`;
  return {
    tipo: "entrega_disputa",
    dedupeKey,
    idempotencyKey: `${dedupeKey}:email`,
    asunto: `Entrega en disputa`,
    html: base(
      `<p>Conteos: ${formatear_pesos(args.conteoA)} vs ${formatear_pesos(args.conteoB)}.</p><a href="{{turnos_url}}">Resolver disputa</a>`,
    ),
    texto: `Conteos: ${formatear_pesos(args.conteoA)} vs ${formatear_pesos(args.conteoB)}.\n[Resolver disputa]\nBaja: {{baja_url}}`,
  };
}

// NE17.3: ajuste grande por conteo (defecto: neto a costo > $20.000 o >10%).
export function describir_ajuste_conteo(args: {
  sector: string;
  quien: string;
  netoCostoCentavos: bigint;
  pctUnidades: number;
  umbralCostoCentavos?: bigint | undefined;
}): EventoEmail | null {
  const umbral = args.umbralCostoCentavos ?? 2000000n;
  if (args.netoCostoCentavos < umbral && args.netoCostoCentavos > -umbral && Math.abs(args.pctUnidades) <= 10) return null;
  const dedupeKey = `ajuste_conteo:${args.sector}:${args.quien}`;
  return {
    tipo: "ajuste_conteo",
    dedupeKey,
    idempotencyKey: `${dedupeKey}:email`,
    asunto: `Ajuste grande por conteo en ${args.sector}`,
    html: base(
      `<p>${escapar(args.sector)} · ${escapar(args.quien)} · neto ${formatear_pesos(args.netoCostoCentavos)}.</p><a href="{{conteo_url}}">Revisar y confirmar</a>`,
    ),
    texto: `${args.sector} · ${args.quien} · neto ${formatear_pesos(args.netoCostoCentavos)}.\n[Revisar y confirmar]\nBaja: {{baja_url}}`,
  };
}

// NE17.4: fiado vencido / sobre tope, agrupado diario por cliente.
export function describir_fiado(args: { cliente: string; fecha: string; motivo: "vencido" | "sobre_tope"; saldoCentavos: bigint }): EventoEmail {
  const dedupeKey = `fiado:${args.cliente}:${args.fecha}`;
  return {
    tipo: "fiado",
    dedupeKey,
    idempotencyKey: `${dedupeKey}:email`,
    asunto: `${args.cliente} ${args.motivo === "vencido" ? "con deuda vencida" : "sobre su tope"}`,
    html: base(
      `<p>${escapar(args.cliente)} · saldo ${formatear_pesos(args.saldoCentavos)}.</p><a href="{{fiado_url}}">Ver cuenta</a>`,
    ),
    texto: `${args.cliente} · saldo ${formatear_pesos(args.saldoCentavos)}.\n[Ver cuenta]\nBaja: {{baja_url}}`,
  };
}

// NE17.5: lotes por vencer como sección del matutino (umbrales 15/7/3).
export function seccion_lotes(args: { lotes: ReadonlyArray<{ producto: string; dias: number; unidades: number }> }): {
  html: string;
  texto: string;
} {
  if (args.lotes.length === 0) return { html: "", texto: "" };
  return {
    html: `<h2>Por vencer</h2>` + args.lotes.map((l) => `<p>${escapar(l.producto)}: ${l.unidades} u. en ${l.dias} días</p>`).join(""),
    texto: `Por vencer\n` + args.lotes.map((l) => `- ${l.producto}: ${l.unidades} u. en ${l.dias} días`).join("\n"),
  };
}

// NE17.6: promo sugerida por vencimiento.
export function describir_promo(args: { producto: string; lote: string; unidades: number; dias: number; promo: string }): EventoEmail {
  const dedupeKey = `promo:${args.lote}`;
  return {
    tipo: "promo_vencer",
    dedupeKey,
    idempotencyKey: `${dedupeKey}:email`,
    asunto: `Promo sugerida: ${args.producto} (${args.unidades} u.)`,
    html: base(
      `<p>${escapar(args.producto)} · lote ${escapar(args.lote)} · ${args.unidades} u. en ${args.dias} días. Sugerencia: ${escapar(args.promo)}</p><a href="{{promo_url}}">Crear promo</a>`,
    ),
    texto: `${args.producto} · ${args.unidades} u. en ${args.dias} días. Sugerencia: ${args.promo}\n[Crear promo]\nBaja: {{baja_url}}`,
  };
}
