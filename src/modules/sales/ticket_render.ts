// Worker B — Ticket salida TV10 (render puro, sin dependencias).
//
// Puro: sin IO, sin Drizzle, sin store, sin fetch. Entrada TicketEmitido +
// líneas con descuento congelado -> salida { html, text, qrPayload }.
// No elige lib pesada: el QR es una URL (qrPayload) y el HTML la muestra con
// una <img> contra API pública (ver docs). La opción P1 con lib
// (pdfkit/qrcode) queda para después, no acá.
//
// Respeto TV2/TV7: sin costos en ningún campo; leyenda obligatoria verificada.
// Dinero: bigint centavos, formateo ARS es-AR.

import { esCantidadValida } from "../../lib/cantidades.js";
import { descripcionLineaPeso, subtotalPorPeso } from "./linea_peso.js";

export const LEYENDA_NO_FISCAL = "DOCUMENTO NO VÁLIDO COMO FACTURA" as const;

export type Medio = "Efectivo" | "Debito" | "Mercado Pago" | "QR" | "Transferencia";

/** Subconjunto mínimo de TicketEmitido (vender_mostrador.ts) que el render necesita. */
export type TicketEmitidoRender =
  | {
      readonly kind: "online";
      readonly definitivo: string;
      readonly provisorio: string;
      readonly totalCentavos: bigint;
      readonly medio: Medio;
      readonly leyenda: typeof LEYENDA_NO_FISCAL;
      readonly pago?: "Pago: A cuenta" | undefined;
    }
  | {
      readonly kind: "offline";
      readonly definitivo: null;
      readonly provisorio: string;
      readonly totalCentavos: bigint;
      readonly medio: Medio;
      readonly leyenda: typeof LEYENDA_NO_FISCAL;
      readonly pago?: "Pago: A cuenta" | undefined;
    };

/** Snapshot por línea (compatible con LineaConDescuento de descuentos.ts). Sin costos. */
export interface LineaTicketRender {
  readonly sku: string;
  readonly cantidad: number;
  readonly brutoCentavos: bigint;
  readonly descLineaCentavos: bigint;
  readonly descTicketCentavos: bigint;
  readonly netoCentavos: bigint;
  readonly porPeso?: boolean | undefined;
  readonly precioCentavos?: bigint | undefined;
}

export interface TicketRenderInput {
  readonly comercio: string;
  readonly ticket: TicketEmitidoRender;
  readonly lineas: ReadonlyArray<LineaTicketRender>;
  /** Link público TV9 (ej. https://.../t/<token>). Va al QR sin modificar. */
  readonly linkPublico: string;
  /** ISO con offset (doble hora TV17: se muestra tal cual). */
  readonly fechaIso: string;
}

export interface TicketRenderOutput {
  readonly html: string;
  readonly text: string;
  /** URL del link público, tal cual, para codificar en el QR. */
  readonly qrPayload: string;
}

/** ARS: centavos bigint -> "$ 3.700,00". Miles es-AR, decimales exactos sin float. */
export function formatARS(centavos: bigint): string {
  const negativo = centavos < 0n;
  const abs = negativo ? -centavos : centavos;
  const pesos = abs / 100n;
  const resto = abs % 100n;
  const miles = new Intl.NumberFormat("es-AR").format(Number(pesos));
  return `$ ${negativo ? "-" : ""}${miles},${resto.toString().padStart(2, "0")}`;
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function numeroVisible(t: TicketEmitidoRender): string {
  return t.kind === "online" ? t.definitivo : `PROV ${t.provisorio} (offline)`;
}

function descripcionLinea(l: LineaTicketRender): string {
  if (l.porPeso === true && l.precioCentavos !== undefined) {
    return `${l.sku} — ${descripcionLineaPeso(l.cantidad, Number(l.precioCentavos))}`;
  }
  return `${l.sku} x${l.cantidad}`;
}

function partirEnAncho(texto: string, ancho: number): string[] {
  const partes: string[] = [];
  let actual = "";
  for (const palabra of texto.split(" ")) {
    if (actual === "") actual = palabra;
    else if (actual.length + 1 + palabra.length <= ancho) actual += " " + palabra;
    else {
      partes.push(actual);
      actual = palabra;
    }
  }
  if (actual !== "") partes.push(actual);
  return partes;
}

/** Invariantes: leyenda exacta, 1..50 líneas, suma netos == total, bruto-desc == total. */
function verificar(input: TicketRenderInput): {
  bruto: bigint;
  desc: bigint;
} {
  if (input.ticket.leyenda !== LEYENDA_NO_FISCAL) throw new Error("leyenda obligatoria ausente");
  if (input.lineas.length < 1 || input.lineas.length > 50) throw new Error("lineas fuera de rango 1..50");
  if (!input.linkPublico || !/^https?:\/\//.test(input.linkPublico)) throw new Error("linkPublico inválido");
  let bruto = 0n;
  let desc = 0n;
  let neto = 0n;
  for (const l of input.lineas) {
    if (!l.sku || !esCantidadValida(l.cantidad, l.porPeso)) {
      throw new Error(`linea inválida: ${l.sku}`);
    }
    if (l.porPeso === true) {
      if (l.precioCentavos === undefined || l.precioCentavos < 0n) {
        throw new Error(`precio por kg inválido: ${l.sku}`);
      }
      if (l.brutoCentavos !== subtotalPorPeso(l.cantidad, l.precioCentavos)) {
        throw new Error(`subtotal por peso no cuadra: ${l.sku}`);
      }
    }
    if (l.brutoCentavos < 0n || l.descLineaCentavos < 0n || l.descTicketCentavos < 0n || l.netoCentavos < 0n) {
      throw new Error(`linea con monto negativo: ${l.sku}`);
    }
    if (l.brutoCentavos - l.descLineaCentavos - l.descTicketCentavos !== l.netoCentavos) {
      throw new Error(`linea no cuadra: ${l.sku}`);
    }
    bruto += l.brutoCentavos;
    desc += l.descLineaCentavos + l.descTicketCentavos;
    neto += l.netoCentavos;
  }
  if (neto !== input.ticket.totalCentavos) throw new Error("total no cuadra con suma de netos");
  if (bruto - desc !== input.ticket.totalCentavos) throw new Error("bruto - descuentos no cuadra con total");
  return { bruto, desc };
}

export function renderTicketText(input: TicketRenderInput): string {
  const { bruto, desc } = verificar(input);
  const t = input.ticket;
  const w = 32;
  const sep = "-".repeat(w);
  const row = (a: string, b: string): string => {
    const sp = Math.max(1, w - a.length - b.length);
    return a + " ".repeat(sp) + b;
  };
  const L: string[] = [];
  L.push(input.comercio.slice(0, w));
  L.push(t.kind === "online" ? `Ticket ${t.definitivo}` : `Ticket PROV ${t.provisorio}`);
  if (t.kind === "online") L.push(`Provisorio: ${t.provisorio}`);
  L.push(`Fecha: ${input.fechaIso}`);
  L.push(sep);
  for (const l of input.lineas) {
    if (l.porPeso === true && l.precioCentavos !== undefined) {
      for (const parte of partirEnAncho(descripcionLinea(l), w)) L.push(parte);
    } else {
      L.push(`${l.cantidad}x ${l.sku}`.slice(0, w));
    }
    L.push(row(`  bruto ${formatARS(l.brutoCentavos)}`, `neto ${formatARS(l.netoCentavos)}`));
    const d = l.descLineaCentavos + l.descTicketCentavos;
    if (d > 0n) L.push(row("  desc", `-${formatARS(d)}`));
  }
  L.push(sep);
  L.push(row("BRUTO", formatARS(bruto)));
  if (desc > 0n) L.push(row("DESCUENTO", `-${formatARS(desc)}`));
  L.push(row("TOTAL", formatARS(t.totalCentavos)));
  L.push(row("Medio", t.pago ?? t.medio));
  L.push(LEYENDA_NO_FISCAL);
  L.push(`Ver: ${input.linkPublico}`);
  return L.join("\n");
}

export function renderTicketHtml(input: TicketRenderInput): string {
  const { bruto, desc } = verificar(input);
  const t = input.ticket;
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(input.linkPublico)}`;
  const filas = input.lineas
    .map((l) => {
      const d = l.descLineaCentavos + l.descTicketCentavos;
      return `      <tr><td>${esc(descripcionLinea(l))}</td><td class="r">${esc(formatARS(l.brutoCentavos))}</td><td class="r">${d > 0n ? "-" + esc(formatARS(d)) : "—"}</td><td class="r">${esc(formatARS(l.netoCentavos))}</td></tr>`;
    })
    .join("\n");
  return `<!doctype html>
<html lang="es">
<head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Ticket ${esc(numeroVisible(t))}</title>
<style>
  body{margin:0;font-family:ui-monospace,monospace;background:#fff;color:#111}
  .t{width:58mm;max-width:100%;margin:0 auto;padding:8px;font-size:12px;line-height:1.45}
  h1{font-size:14px;margin:0 0 4px} table{width:100%;border-collapse:collapse}
  td,th{padding:2px 0;vertical-align:top} .r{text-align:right;white-space:nowrap}
  .tot{font-weight:bold;font-size:14px} .ley{border:1px solid #111;padding:4px;margin:8px 0;text-align:center;font-weight:bold}
  .c{text-align:center} img.qr{width:160px;height:160px} @media print{.t{width:58mm;padding:0}}
</style></head>
<body><div class="t">
  <h1 class="c">${esc(input.comercio)}</h1>
  <div class="c">Ticket ${esc(numeroVisible(t))}</div>
  ${t.kind === "online" ? `<div class="c">Provisorio: ${esc(t.provisorio)}</div>` : ""}
  <div class="c">${esc(input.fechaIso)}</div>
  <table><thead><tr><th>Item</th><th class="r">Bruto</th><th class="r">Desc</th><th class="r">Neto</th></tr></thead>
  <tbody>
${filas}
  </tbody></table>
  <div>Bruto: ${esc(formatARS(bruto))}</div>
  ${desc > 0n ? `<div>Descuento: -${esc(formatARS(desc))}</div>` : ""}
  <div class="tot">TOTAL: ${esc(formatARS(t.totalCentavos))}</div>
  <div>Medio: ${esc(t.pago ?? t.medio)}</div>
  <div class="ley">${LEYENDA_NO_FISCAL}</div>
  <div class="c"><img class="qr" alt="QR ticket" src="${esc(qrSrc)}" /><div><a href="${esc(input.linkPublico)}">Ver ticket</a></div></div>
</div></body></html>`;
}

export function buildTicketRender(input: TicketRenderInput): TicketRenderOutput {
  return {
    html: renderTicketHtml(input),
    text: renderTicketText(input),
    qrPayload: input.linkPublico,
  };
}
