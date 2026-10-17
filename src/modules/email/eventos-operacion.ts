// Núcleo puro NE6: operación (solo email). Sin IO.
// Un email por sincronización; recordatorio max 1/día (dedupe por clave).

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

// NE6.2: stock negativo tras sync. Uno por sincronización, no uno por producto.
export function describir_stock_negativo(args: {
  syncId: string;
  items: ReadonlyArray<{ sku: string; nombre: string; stock: number }>;
  dispositivo: string;
  usuario: string;
}): EventoEmail {
  const dedupeKey = `stock_negativo:${args.syncId}`;
  const filas = args.items.map((i) => `${i.nombre} quedó en ${i.stock}`).join(", ");
  const filasHtml = args.items
    .map((i) => `<tr><td style="padding:6px 0;border-bottom:1px solid #e7e2d9;">${escapar(i.nombre)}</td><td align="right">${i.stock}</td></tr>`)
    .join("");
  return {
    tipo: "sistema_operacion",
    dedupeKey,
    idempotencyKey: `${dedupeKey}:email`,
    asunto: `Stock negativo después de sincronizar: ${filas.slice(0, 80)}`,
    html: base(
      `<p>Stock negativo después de sincronizar (${escapar(args.dispositivo)} · ${escapar(args.usuario)}).</p>` +
        `<table width="100%">${filasHtml}</table>` +
        `<a href="{{sync_url}}" style="display:block;margin:20px 0;padding:14px;background:#bf360c;color:#fff;text-align:center;border-radius:12px;text-decoration:none;font-weight:bold;">Revisar y corregir</a>`,
    ),
    texto: `Stock negativo después de sincronizar (${args.dispositivo} · ${args.usuario}):\n${args.items.map((i) => `- ${i.nombre}: ${i.stock}`).join("\n")}\n[Revisar y corregir]\nBaja: {{baja_url}}`,
  };
}

// NE6.3: cierre automático fallido. El email avisa, no cierra.
export function describir_cierre_fallido(args: { jornada: string }): EventoEmail {
  const dedupeKey = `cierre_fallido:${args.jornada}`;
  return {
    tipo: "sistema_operacion",
    dedupeKey,
    idempotencyKey: `${dedupeKey}:email`,
    asunto: `Cierre automático fallido: jornada ${args.jornada}`,
    html: base(
      `<p>La jornada ${escapar(args.jornada)} con movimientos quedó sin cerrar.</p>` +
        `<a href="{{caja_url}}" style="display:block;margin:20px 0;padding:14px;background:#bf360c;color:#fff;text-align:center;border-radius:12px;text-decoration:none;font-weight:bold;">Ver caja</a>`,
    ),
    texto: `La jornada ${args.jornada} con movimientos quedó sin cerrar.\n[Ver caja]\nBaja: {{baja_url}}`,
  };
}

// NE6.4: Gmail/Fotos vencida o revocada.
export function describir_conexion_vencida(args: { servicio: "gmail" | "fotos"; fecha: string }): EventoEmail {
  const dedupeKey = `conexion_vencida:${args.servicio}:${args.fecha}`;
  const que = args.servicio === "gmail" ? "No vamos a poder leer las facturas de servicios de tu Gmail" : "Se venció la conexión con Google Photos";
  return {
    tipo: "sistema_operacion",
    dedupeKey,
    idempotencyKey: `${dedupeKey}:email`,
    asunto: `Conexión vencida: ${args.servicio}`,
    html: base(
      `<p>${escapar(que)}.</p>` +
        `<a href="{{config_url}}" style="display:block;margin:20px 0;padding:14px;background:#bf360c;color:#fff;text-align:center;border-radius:12px;text-decoration:none;font-weight:bold;">Volver a conectar</a>`,
    ),
    texto: `${que}.\n[Volver a conectar]\nBaja: {{baja_url}}`,
  };
}

// NE6.1: dispositivo sin sincronizar hace más de 24 h.
export function describir_sync_pendiente(args: { dispositivo: string; fecha: string }): EventoEmail {
  const dedupeKey = `sync_pendiente:${args.dispositivo}:${args.fecha}`;
  return {
    tipo: "sistema_operacion",
    dedupeKey,
    idempotencyKey: `${dedupeKey}:email`,
    asunto: `${args.dispositivo} no sincroniza hace más de 24 h`,
    html: base(
      `<p>${escapar(args.dispositivo)} tiene movimientos pendientes hace más de 24 h.</p>` +
        `<a href="{{sync_url}}" style="display:block;margin:20px 0;padding:14px;background:#bf360c;color:#fff;text-align:center;border-radius:12px;text-decoration:none;font-weight:bold;">Ver sincronización</a>`,
    ),
    texto: `${args.dispositivo} tiene movimientos pendientes hace más de 24 h.\n[Ver sincronización]\nBaja: {{baja_url}}`,
  };
}

export function ejemplo_monto(n: bigint): string {
  return formatear_pesos(n);
}
