// Núcleo puro NE2: aviso matutino de stock bajo. Sin IO.
// Un solo cálculo vivo para WA+email (NE2.5); sin novedades no sale nada.

import { cta, documento_papel, pie_links, tabla } from "./papel.js";

export interface ItemStock {
  readonly sku: string;
  readonly nombre: string;
  readonly stock: number;
  readonly umbral: number;
  readonly proveedor: string | null;
  readonly ubicacion?: string | null | undefined;
  readonly critico?: boolean | undefined;
  // ALR-S1: cantidad a reponer (products.reorder_qty); ausente = sin valor.
  readonly reorderQty?: number | null | undefined;
}

export interface AlertaStock {
  readonly sku: string;
  readonly nombre: string;
  readonly stock: number;
  readonly umbral: number;
  readonly proveedor: string | null;
  readonly ubicacion: string | null;
  readonly sugerido: number;
  readonly urgente: boolean;
}

export function clave_matutino(tenantId: string, fecha: string): string {
  return `stock_matutino:${tenantId}:${fecha}`;
}

function sugerido_para(stock: number, umbral: number, urgente: boolean): number {
  const base = Math.max(umbral - stock, 0);
  if (base > 0) return base + Math.ceil(umbral / 2);
  return urgente ? Math.max(umbral, 1) : 0;
}

// NE2.2: entra en alerta desde el aviso anterior y sigue, o urgente
// (stock 0, crítico o debajo de la mitad del umbral). Stock vivo al envío.
export function calcular_matutino(
  catalogo: ReadonlyArray<ItemStock>,
  enAlertaPrevia: ReadonlySet<string>,
): { enviar: boolean; alertas: AlertaStock[]; sinStock: number } {
  const alertas: AlertaStock[] = [];
  for (const it of catalogo) {
    if (it.stock > it.umbral) continue;
    const urgente = it.stock <= 0 || it.critico === true || it.stock < it.umbral / 2;
    const novedad = !enAlertaPrevia.has(it.sku) || urgente;
    if (!novedad) continue;
    alertas.push({
      sku: it.sku,
      nombre: it.nombre,
      stock: it.stock,
      umbral: it.umbral,
      proveedor: it.proveedor,
      ubicacion: it.ubicacion ?? null,
      sugerido: sugerido_para(it.stock, it.umbral, urgente),
      urgente,
    });
  }
  alertas.sort((a, b) => {
    if (a.urgente !== b.urgente) return a.urgente ? -1 : 1;
    if (a.stock !== b.stock) return a.stock - b.stock;
    return a.nombre < b.nombre ? -1 : 1;
  });
  return { enviar: alertas.length > 0, alertas, sinStock: alertas.filter((a) => a.stock <= 0).length };
}

export interface PlantillaMatutino {
  readonly asunto: string;
  readonly html: string;
  readonly texto: string;
  readonly waTexto: string;
}

function escapar(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function armar_matutino(args: {
  nombreComercio: string;
  fecha: string;
  alertas: ReadonlyArray<AlertaStock>;
  guardadosViernes?: number | undefined;
}): PlantillaMatutino {
  const n = args.alertas.length;
  const sin = args.alertas.filter((a) => a.stock <= 0).length;
  const asunto = `${args.nombreComercio}: ${n} productos con stock bajo (${sin} sin stock)`;
  const grupos = new Map<string, AlertaStock[]>();
  for (const a of args.alertas) {
    const k = a.proveedor ?? "Sin proveedor";
    const arr = grupos.get(k);
    if (arr) arr.push(a);
    else grupos.set(k, [a]);
  }
  const bloquesHtml: string[] = [];
  const bloquesTexto: string[] = [];
  for (const [prov, items] of grupos) {
    const pedidoUrl = `{{pedidos_url}}?prov=${encodeURIComponent(prov)}`;
    bloquesHtml.push(
      `<h2 style="font-size:16px;margin:16px 0 8px;">${escapar(prov)} (${items.length}) — ` +
        `<a href="${pedidoUrl}">Armar pedido</a></h2>` +
        tabla(
          items
            .map(
              (a) =>
                `<tr><td style="padding:6px 0;border-bottom:1px solid #e7e2d9;">${escapar(a.nombre)} — quedan ${a.stock} (umbral ${a.umbral}) — sugerido: ${a.sugerido}` +
                (a.ubicacion ? ` — ${escapar(a.ubicacion)}` : "") +
                (a.urgente ? ` <strong>URGENTE</strong>` : "") +
                `</td></tr>`,
            )
            .join(""),
        ),
    );
    bloquesTexto.push(
      `${prov} (${items.length}) — [Armar pedido]\n` +
        items.map((a) => `  • ${a.nombre} — quedan ${a.stock} (umbral ${a.umbral}) — sugerido: ${a.sugerido}${a.urgente ? " URGENTE" : ""}`).join("\n"),
    );
  }
  const guardados = args.guardadosViernes ?? 0;
  const guardHtml = guardados > 0 ? `<p>Guardados para el viernes: ${guardados} productos — <a href="{{viernes_url}}">Ver lista del viernes</a></p>` : "";
  const guardTxt = guardados > 0 ? `\nGuardados para el viernes: ${guardados} productos — [Ver lista del viernes]` : "";
  const html = documento_papel(
    asunto,
    `<p class="ne-mute" style="margin:0 0 8px;font-size:14px;color:#6b6259;">Buen día — esto es lo que se está acabando (${escapar(args.fecha)})</p>` +
      bloquesHtml.join("") +
      guardHtml +
      cta("{{alertas_url}}", "Ver todas las alertas en la app") +
      pie_links(),
  );
  const texto =
    `Buen día. Esto es lo que se está acabando (${args.fecha}):\n\n` +
    bloquesTexto.join("\n\n") +
    guardTxt +
    `\n\n[Ver todas las alertas en la app]\nBaja: {{baja_url}}`;
  const primeros = args.alertas.slice(0, 5).map((a) => `${a.nombre} (${a.stock})`).join(", ");
  const resto = n > 5 ? ` y ${n - 5} más` : "";
  const waTexto = `Stock bajo (${n}): ${primeros}${resto}. Ver email.`;
  return { asunto, html, texto, waTexto };
}
