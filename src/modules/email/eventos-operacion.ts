// Núcleo puro NE6: operación (solo email). Sin IO.
// Un email por sincronización; recordatorio max 1/día (dedupe por clave).

import { formatear_pesos } from "./plantilla-cierre.js";
import { cta, documento_papel, pie_links, tabla } from "./papel.js";
import type { TipoEmail } from "./catalogo.js";

export interface EventoEmail {
  readonly tipo: TipoEmail;
  readonly dedupeKey: string;
  readonly idempotencyKey: string;
  readonly asunto: string;
  readonly html: string;
  readonly texto: string;
}

function base(asunto: string, html: string): string {
  return documento_papel(asunto, `${html}${pie_links()}`);
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
  const asunto = `Stock negativo después de sincronizar: ${filas.slice(0, 80)}`;
  return {
    tipo: "sistema_operacion",
    dedupeKey,
    idempotencyKey: `${dedupeKey}:email`,
    asunto,
    html: base(
      asunto,
      `<p>Stock negativo después de sincronizar (${escapar(args.dispositivo)} · ${escapar(args.usuario)}).</p>` +
        tabla(filasHtml) +
        cta("{{sync_url}}", "Revisar y corregir"),
    ),
    texto: `Stock negativo después de sincronizar (${args.dispositivo} · ${args.usuario}):\n${args.items.map((i) => `- ${i.nombre}: ${i.stock}`).join("\n")}\n[Revisar y corregir]\nBaja: {{baja_url}}`,
  };
}

// NE6.3: cierre automático fallido. El email avisa, no cierra.
export function describir_cierre_fallido(args: { jornada: string }): EventoEmail {
  const dedupeKey = `cierre_fallido:${args.jornada}`;
  const asunto = `Cierre automático fallido: jornada ${args.jornada}`;
  return {
    tipo: "sistema_operacion",
    dedupeKey,
    idempotencyKey: `${dedupeKey}:email`,
    asunto,
    html: base(asunto, `<p>La jornada ${escapar(args.jornada)} con movimientos quedó sin cerrar.</p>` + cta("{{caja_url}}", "Ver caja")),
    texto: `La jornada ${args.jornada} con movimientos quedó sin cerrar.\n[Ver caja]\nBaja: {{baja_url}}`,
  };
}

// NE6.4: Gmail/Fotos vencida o revocada.
export function describir_conexion_vencida(args: { servicio: "gmail" | "fotos"; fecha: string }): EventoEmail {
  const dedupeKey = `conexion_vencida:${args.servicio}:${args.fecha}`;
  const que = args.servicio === "gmail" ? "No vamos a poder leer las facturas de servicios de tu Gmail" : "Se venció la conexión con Google Photos";
  const asunto = `Conexión vencida: ${args.servicio}`;
  return {
    tipo: "sistema_operacion",
    dedupeKey,
    idempotencyKey: `${dedupeKey}:email`,
    asunto,
    html: base(asunto, `<p>${escapar(que)}.</p>` + cta("{{config_url}}", "Volver a conectar")),
    texto: `${que}.\n[Volver a conectar]\nBaja: {{baja_url}}`,
  };
}

// NE6.1: dispositivo sin sincronizar hace más de 24 h.
export function describir_sync_pendiente(args: { dispositivo: string; fecha: string }): EventoEmail {
  const dedupeKey = `sync_pendiente:${args.dispositivo}:${args.fecha}`;
  const asunto = `${args.dispositivo} no sincroniza hace más de 24 h`;
  return {
    tipo: "sistema_operacion",
    dedupeKey,
    idempotencyKey: `${dedupeKey}:email`,
    asunto,
    html: base(
      asunto,
      `<p>${escapar(args.dispositivo)} tiene movimientos pendientes hace más de 24 h.</p>` + cta("{{sync_url}}", "Ver sincronización"),
    ),
    texto: `${args.dispositivo} tiene movimientos pendientes hace más de 24 h.\n[Ver sincronización]\nBaja: {{baja_url}}`,
  };
}

export function ejemplo_monto(n: bigint): string {
  return formatear_pesos(n);
}
