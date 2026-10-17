// Núcleo puro NE5: resumen diario de ventas (lado inventario). Sin IO.
// Usa la misma forma que la pantalla de ventas (NE5.4); va con el cierre
// por defecto (NE1.5) o como email aparte a hora fija.

import { formatear_pesos } from "./plantilla-cierre.js";
import { documento_papel, pie_links, tabla } from "./papel.js";

export type OrigenVenta = "lector" | "camara" | "busqueda" | "bot";

export interface LineaVenta {
  readonly sku: string;
  readonly nombre: string;
  readonly cantidad: number;
  readonly importeCentavos: bigint;
  readonly costoCentavos?: bigint | undefined;
  readonly usuario?: string | undefined;
  readonly origen?: OrigenVenta | undefined;
}

export interface CalculoVentas {
  readonly totalCentavos: bigint;
  readonly tickets: number;
  readonly ticketPromedioCentavos: bigint;
  readonly unidades: number;
  readonly topUnidades: LineaVenta[];
  readonly topImporte: LineaVenta[];
  readonly gananciaCentavos: bigint | null;
  readonly devolucionesCentavos: bigint;
  readonly porUsuario: Record<string, bigint>;
  readonly porOrigen: Record<string, number>;
  readonly vacio: boolean;
}

export function clave_ventas(tenantId: string, fecha: string): string {
  return `ventas_diaria:${tenantId}:${fecha}`;
}

function agrupar(lineas: ReadonlyArray<LineaVenta>): Map<string, { nombre: string; cantidad: number; importe: bigint }> {
  const m = new Map<string, { nombre: string; cantidad: number; importe: bigint }>();
  for (const l of lineas) {
    const e = m.get(l.sku) ?? { nombre: l.nombre, cantidad: 0, importe: 0n };
    e.cantidad += l.cantidad;
    e.importe += l.importeCentavos;
    m.set(l.sku, e);
  }
  return m;
}

export function calcular_ventas(
  lineas: ReadonlyArray<LineaVenta>,
  args: { tickets: number; devolucionesCentavos?: bigint | undefined },
): CalculoVentas {
  let total = 0n;
  let unidades = 0;
  let ganancia: bigint | null = null;
  let conCosto = lineas.length > 0;
  const porUsuario: Record<string, bigint> = {};
  const porOrigen: Record<string, number> = {};
  for (const l of lineas) {
    total += l.importeCentavos;
    unidades += l.cantidad;
    if (l.costoCentavos == null) conCosto = false;
    else ganancia = (ganancia ?? 0n) + (l.importeCentavos - l.costoCentavos * BigInt(l.cantidad));
    if (l.usuario) porUsuario[l.usuario] = (porUsuario[l.usuario] ?? 0n) + l.importeCentavos;
    if (l.origen) porOrigen[l.origen] = (porOrigen[l.origen] ?? 0) + l.cantidad;
  }
  const tickets = args.tickets;
  const g = agrupar(lineas);
  const base: LineaVenta[] = [...g.entries()].map(([sku, e]) => ({ sku, nombre: e.nombre, cantidad: e.cantidad, importeCentavos: e.importe }));
  const topUnidades = [...base].sort((a, b) => b.cantidad - a.cantidad).slice(0, 10);
  const topImporte = [...base].sort((a, b) => (a.importeCentavos > b.importeCentavos ? -1 : 1)).slice(0, 10);
  return {
    totalCentavos: total,
    tickets,
    ticketPromedioCentavos: tickets > 0 ? total / BigInt(tickets) : 0n,
    unidades,
    topUnidades,
    topImporte,
    gananciaCentavos: conCosto ? (ganancia ?? 0n) : null,
    devolucionesCentavos: args.devolucionesCentavos ?? 0n,
    porUsuario,
    porOrigen,
    vacio: lineas.length === 0,
  };
}

function escapar(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Sección integrable al email de cierre (NE1.5).
export function seccion_ventas(c: CalculoVentas): { html: string; texto: string } {
  if (c.vacio) return { html: `<h2>Ventas del día</h2><p>Sin ventas hoy.</p>`, texto: `Ventas del día\nSin ventas hoy.` };
  const filas = c.topUnidades.map((v) => `<tr><td style="padding:6px 0;border-bottom:1px solid #e7e2d9;">${escapar(v.nombre)}</td><td align="right">${v.cantidad} u. · ${formatear_pesos(v.importeCentavos)}</td></tr>`).join("");
  return {
    html:
      `<h2 style="font-size:16px;">Ventas del día</h2>` +
      `<p>Total ${formatear_pesos(c.totalCentavos)} · ${c.tickets} tickets · ticket ${formatear_pesos(c.ticketPromedioCentavos)} · ${c.unidades} u.` +
      (c.gananciaCentavos != null ? ` · ganancia ${formatear_pesos(c.gananciaCentavos)}` : "") +
      `</p>` + tabla(filas),
    texto:
      `Ventas del día\nTotal ${formatear_pesos(c.totalCentavos)} · ${c.tickets} tickets · ${c.unidades} u.\n` +
      c.topUnidades.map((v) => `- ${v.nombre}: ${v.cantidad} u. ${formatear_pesos(v.importeCentavos)}`).join("\n"),
  };
}

export function armar_email_ventas(args: { nombreComercio: string; fecha: string; calculo: CalculoVentas }): {
  asunto: string;
  html: string;
  texto: string;
} {
  const s = seccion_ventas(args.calculo);
  const asunto = `${args.nombreComercio}: ventas ${args.fecha} — ${formatear_pesos(args.calculo.totalCentavos)}`;
  return {
    asunto,
    html: documento_papel(asunto, s.html + pie_links()),
    texto: `${s.texto}\nBaja: {{baja_url}}`,
  };
}
