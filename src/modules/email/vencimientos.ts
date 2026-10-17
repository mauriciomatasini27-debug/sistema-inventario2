// Núcleo puro NE8: vencimientos y consumos (email). Sin IO.
// Nunca ejecuta un pago desde el email (NE8.1): solo [Revisar y pagar].

import { formatear_pesos } from "./plantilla-cierre.js";
import type { TipoEmail } from "./catalogo.js";

export interface Vencimiento {
  readonly id: string;
  readonly concepto: string;
  readonly beneficiario: string;
  readonly montoCentavos: bigint;
  readonly vence: string;
  readonly estado: "pendiente" | "pagado" | "cancelado";
  /** Si tiene orden de pago se usa el de la orden (misma regla OP11.1). */
  readonly ordenId?: string | undefined;
}

export interface EventoEmail {
  readonly tipo: TipoEmail;
  readonly dedupeKey: string;
  readonly idempotencyKey: string;
  readonly asunto: string;
  readonly html: string;
  readonly texto: string;
}

export function clave_vencimiento(id: string, fecha: string): string {
  return `venc:${id}:${fecha}`;
}

function escapar(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// El caller pasa items ya deduplicados por orden (NE8.3) y excluye
// Pagados/Cancelados. Acá solo se filtra por estado y se arma el email.
export function describir_vencimientos(args: {
  items: ReadonlyArray<Vencimiento>;
  fecha: string;
  modo: "diaria" | "semanal";
}): EventoEmail | null {
  const pendientes = args.items.filter((i) => i.estado === "pendiente");
  if (pendientes.length === 0) return null;
  const vistos = new Set<string>();
  const unicos: Vencimiento[] = [];
  for (const i of pendientes) {
    const k = i.ordenId ?? i.id;
    if (vistos.has(k)) continue;
    vistos.add(k);
    unicos.push(i);
  }
  const total = unicos.reduce((acc, i) => acc + i.montoCentavos, 0n);
  const titulo = args.modo === "semanal" ? "Pagos de la semana" : `Vencimientos ${args.fecha}`;
  const filasHtml = unicos
    .map(
      (i) =>
        `<tr><td style="padding:6px 0;border-bottom:1px solid #e7e2d9;">${escapar(i.concepto)} — ${escapar(i.beneficiario)} · vence ${escapar(i.vence)}</td>` +
        `<td align="right">${formatear_pesos(i.montoCentavos)}</td></tr>`,
    )
    .join("");
  return {
    tipo: "vencimientos",
    dedupeKey: `vencimientos:${args.fecha}:${args.modo}`,
    idempotencyKey: `vencimientos:${args.fecha}:${args.modo}:email`,
    asunto: `${titulo}: ${unicos.length} pagos · ${formatear_pesos(total)}`,
    html:
      `<div style="max-width:600px;margin:0 auto;background:#f7f5f2;font-family:sans-serif;">` +
      `<div style="padding:24px 20px;"><h1 style="font-size:20px;">${escapar(titulo)} — ${formatear_pesos(total)}</h1>` +
      `<table width="100%">${filasHtml}</table>` +
      `<a href="{{pagos_url}}" style="display:block;margin:20px 0;padding:14px;background:#bf360c;color:#fff;text-align:center;border-radius:12px;text-decoration:none;font-weight:bold;">Revisar y pagar</a>` +
      `<p style="font-size:12px;color:#6b6259;">Preferencias: {{preferencias_url}} · Baja: {{baja_url}}</p></div></div>`,
    texto:
      `${titulo} — ${formatear_pesos(total)}\n` +
      unicos.map((i) => `- ${i.concepto} — ${i.beneficiario} · vence ${i.vence}: ${formatear_pesos(i.montoCentavos)}`).join("\n") +
      `\n[Revisar y pagar]\nBaja: {{baja_url}}`,
  };
}
