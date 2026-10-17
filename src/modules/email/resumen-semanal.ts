// Núcleo puro NE3: resumen semanal del viernes. Sin IO.
// Mismo cálculo para WA+email (NE3.1); email agrega detalle y pedido.

import { formatear_pesos } from "./plantilla-cierre.js";
import { cta, documento_papel, pie_links, tabla } from "./papel.js";

export interface VentaSemana {
  readonly sku: string;
  readonly nombre: string;
  readonly unidades: number;
  readonly importeCentavos: bigint;
  readonly costoCentavos?: bigint | undefined;
}

export interface FaltanteSemana {
  readonly sku: string;
  readonly nombre: string;
  readonly stock: number;
  readonly umbral: number;
  readonly proveedor: string | null;
}

export interface PedidoProveedor {
  readonly proveedor: string;
  readonly items: ReadonlyArray<{ sku: string; nombre: string; sugerido: number }>;
  readonly unidades: number;
}

export interface CalculoSemanal {
  readonly unidades: number;
  readonly ventasCentavos: bigint;
  readonly gananciaCentavos: bigint | null;
  readonly top10: VentaSemana[];
  readonly faltantes: number;
  readonly sinStock: number;
  readonly pedidoPorProveedor: PedidoProveedor[];
}

export function clave_semanal(tenantId: string, semanaISO: string): string {
  return `resumen_semanal:${tenantId}:${semanaISO}`;
}

export function calcular_semanal(args: {
  ventas: ReadonlyArray<VentaSemana>;
  faltantes: ReadonlyArray<FaltanteSemana>;
}): CalculoSemanal {
  let unidades = 0;
  let ventas = 0n;
  let ganancia: bigint | null = null;
  let conCosto = true;
  for (const v of args.ventas) {
    unidades += v.unidades;
    ventas += v.importeCentavos;
    if (v.costoCentavos == null) conCosto = false;
    else ganancia = (ganancia ?? 0n) + (v.importeCentavos - v.costoCentavos * BigInt(v.unidades));
  }
  const top10 = [...args.ventas].sort((a, b) => b.unidades - a.unidades).slice(0, 10);
  const porProv = new Map<string, { items: Array<{ sku: string; nombre: string; sugerido: number }>; unidades: number }>();
  for (const f of args.faltantes) {
    const k = f.proveedor ?? "Sin proveedor";
    const e = porProv.get(k) ?? { items: [], unidades: 0 };
    const sugerido = Math.max(f.umbral - f.stock, 0) + Math.ceil(f.umbral / 2);
    e.items.push({ sku: f.sku, nombre: f.nombre, sugerido });
    e.unidades += sugerido;
    porProv.set(k, e);
  }
  const pedidoPorProveedor: PedidoProveedor[] = [...porProv.entries()].map(([proveedor, e]) => ({
    proveedor,
    items: e.items,
    unidades: e.unidades,
  }));
  return {
    unidades,
    ventasCentavos: ventas,
    gananciaCentavos: conCosto && args.ventas.length > 0 ? (ganancia ?? 0n) : null,
    top10,
    faltantes: args.faltantes.length,
    sinStock: args.faltantes.filter((f) => f.stock <= 0).length,
    pedidoPorProveedor,
  };
}

export interface PlantillaSemanal {
  readonly asunto: string;
  readonly html: string;
  readonly texto: string;
  readonly waTexto: string;
}

function escapar(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function armar_semanal(args: {
  nombreComercio: string;
  semana: string;
  calculo: CalculoSemanal;
}): PlantillaSemanal {
  const c = args.calculo;
  const conVentas = c.unidades > 0;
  const asunto = `${args.nombreComercio}: resumen semanal ${args.semana} — ${c.unidades} u. ${formatear_pesos(c.ventasCentavos)}`;
  const topHtml = c.top10.map((v) => `<tr><td style="padding:6px 0;border-bottom:1px solid #e7e2d9;">${escapar(v.nombre)}</td><td align="right">${v.unidades} u. · ${formatear_pesos(v.importeCentavos)}</td></tr>`).join("");
  const pedidoHtml = c.pedidoPorProveedor
    .map((p) => `<h2 style="font-size:16px;">${escapar(p.proveedor)} — ${p.unidades} u. sugeridas</h2>` + p.items.map((i) => `<p style="margin:4px 0;font-size:14px;">${escapar(i.nombre)}: ${i.sugerido}</p>`).join(""))
    .join("");
  const cuerpoHtml = conVentas
    ? `<p>Vendiste ${c.unidades} unidades por ${formatear_pesos(c.ventasCentavos)}${c.gananciaCentavos != null ? ` (ganancia ${formatear_pesos(c.gananciaCentavos)})` : ""}.</p>` + tabla(topHtml)
    : `<p>No hay ventas registradas esta semana.</p>`;
  const html = documento_papel(
    asunto,
    `${cuerpoHtml}` +
      `<p>Faltantes: ${c.faltantes} (${c.sinStock} sin stock).</p>${pedidoHtml}` +
      cta("{{pedidos_url}}", "Revisar pedido sugerido") +
      `<p><a href="{{programar_url}}">Programar para el lunes</a> · <a href="{{resumen_url}}">Ver resumen completo</a></p>` +
      pie_links(),
  );
  const texto =
    (conVentas ? `Vendiste ${c.unidades} unidades por ${formatear_pesos(c.ventasCentavos)}.\n` : `No hay ventas registradas esta semana.\n`) +
    `Top: ${c.top10.map((v) => `${v.nombre} x${v.unidades}`).join(", ") || "—"}\n` +
    `Faltantes: ${c.faltantes} (${c.sinStock} sin stock).\n` +
    `[Revisar pedido sugerido]\nBaja: {{baja_url}}`;
  const waTexto = conVentas
    ? `Resumen semanal: ${c.unidades} u. ${formatear_pesos(c.ventasCentavos)}. Faltantes ${c.faltantes}. Ver email.`
    : `Resumen semanal: sin ventas. Faltantes ${c.faltantes}. Ver email.`;
  return { asunto, html, texto, waTexto };
}
