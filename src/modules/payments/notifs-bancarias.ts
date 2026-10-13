// OP10 detección de notificaciones bancarias P2 (Lane payments).
//
// Núcleo puro: parsea el texto de una notificación bancaria (monto,
// fecha, banco, referencia) y la matchea contra órdenes de pago en
// estado preparada|vencida. Determinista, sin IA, sin red, sin saldos:
// la plata NUNCA se mueve acá. El único camino a "pagada" sigue siendo
// el toque explícito `Ya pagué` (confirmar_pago, OP9.1).
//
// Reglas de matching (las dos a la vez):
// - monto EXACTO en centavos (bigint, sin tolerancia: el banco no
//   redondea) + orden en preparada|vencida;
// - |fecha_notif - venceEl| <= ventana (defecto 2 días).
// Orden de candidatos: mismo día primero, después por cercanía.
// Si el texto parece traer una credencial se rechaza (nunca se guarda).

import { contiene_secreto } from "./beneficiarios.js";
import { parsear_fecha_ar, parsear_monto_ar } from "../utilities/facturas_servicios.js";
import { DIA_MS, type PaymentOrder } from "./ordenes.js";

export interface NotifBancaria {
  readonly banco: string | null;
  readonly montoCentavos: bigint;
  readonly fechaIso: string;
  readonly referencia: string | null;
}

export type ParsearNotifResult =
  | { readonly ok: true; readonly notif: NotifBancaria }
  | { readonly ok: false; readonly error: string };

const BANCOS: ReadonlyArray<string> = [
  "galicia",
  "santander",
  "nacion",
  "provincia",
  "bbva",
  "macro",
  "patagonia",
  "hsbc",
  "ciudad",
  "supervielle",
  "comafi",
  "mercado pago",
  "mercadopago",
  "uala",
  "brubank",
  "naranja x",
  "personal pay",
  "modo",
];

function detectar_banco(texto: string): string | null {
  const t = texto.toLowerCase();
  for (const b of BANCOS) {
    if (t.includes(b)) return b;
  }
  return null;
}

// Primer monto con $; si no hay $, primer monto parseable. Las fechas
// dd/mm/aaaa se tapan antes para no confundirlas con montos.
function extraer_monto(texto: string): bigint | null {
  const sinFechas = texto.replace(/\d{1,2}[/\-.]\d{1,2}[/\-.]\d{4}/g, " ");
  const conSigno = /\$\s*([\d.,]+)/.exec(sinFechas);
  const candidatos = conSigno?.[1] !== undefined ? [conSigno[1]] : [];
  const generico = /(\d[\d.,]*)/.exec(sinFechas);
  if (generico?.[1] !== undefined) candidatos.push(generico[1]);
  for (const c of candidatos) {
    try {
      return parsear_monto_ar(c);
    } catch {
      continue;
    }
  }
  return null;
}

function iso_mas_dias(hoyIso: string, dias: number): string {
  const ms = Date.parse(`${hoyIso}T00:00:00Z`) + dias * DIA_MS;
  return new Date(ms).toISOString().slice(0, 10);
}

function extraer_fecha(texto: string, hoyIso: string): string | null {
  const t = texto.toLowerCase();
  if (/\bhoy\b/.test(t)) return hoyIso;
  if (/\bayer\b/.test(t)) return iso_mas_dias(hoyIso, -1);
  const m = /(\d{1,2}[/\-.]\d{1,2}[/\-.]\d{4}|\d{4}-\d{2}-\d{2})/.exec(texto);
  if (!m?.[1]) return null;
  try {
    return parsear_fecha_ar(m[1]);
  } catch {
    return null;
  }
}

// Referencia informativa (nunca decide el match): primera corrida de
// 4+ dígitos —o token alfanumérico— después de una palabra clave con
// borde (\b evita cazar la "n" de "transferencia"). Los 16 dígitos ya
// se rechazaron como posible secreto antes de llegar acá.
function extraer_referencia(texto: string): string | null {
  const k = /\bn[°º]\b|\bnro\b|\breferencia\b|\bcomprobante\b|\boperaci[óo]n\b/i.exec(texto);
  if (!k) return null;
  const resto = texto.slice(k.index + k[0].length);
  const num = /\b\d{4,32}\b/.exec(resto);
  if (num) return num[0];
  const tok = /\b[A-Za-z][A-Za-z0-9\-]{3,31}\b/.exec(resto);
  return tok?.[0] ?? null;
}

export function parsear_notif_bancaria(texto: string, hoyIso: string): ParsearNotifResult {
  const t = texto.trim().slice(0, 2000);
  if (!t) return { ok: false, error: "texto vacío" };
  if (contiene_secreto(t)) {
    return { ok: false, error: "el texto parece contener una credencial; no se procesa" };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(hoyIso)) return { ok: false, error: "hoy_iso YYYY-MM-DD" };
  const monto = extraer_monto(t);
  if (monto === null || monto <= 0n) return { ok: false, error: "sin monto detectable" };
  const fecha = extraer_fecha(t, hoyIso);
  if (fecha === null) return { ok: false, error: "sin fecha detectable (dd/mm/aaaa o hoy/ayer)" };
  return { ok: true, notif: { banco: detectar_banco(t), montoCentavos: monto, fechaIso: fecha, referencia: extraer_referencia(t) } };
}

export interface CandidatoNotif {
  readonly orderId: string;
  readonly numero: string;
  readonly concepto: string;
  readonly montoCentavos: string;
  readonly venceEl: string;
  readonly motivo: string;
}

export interface MatchearNotifResult {
  readonly candidatos: ReadonlyArray<CandidatoNotif>;
  readonly evaluadas: number;
}

function iso_de_vencimiento(venceElMs: number): string {
  return new Date(venceElMs).toISOString().slice(0, 10);
}

function diff_dias(aIso: string, bIso: string): number {
  return Math.round((Date.parse(`${aIso}T00:00:00Z`) - Date.parse(`${bIso}T00:00:00Z`)) / DIA_MS);
}

export function matchear_notif(
  notif: NotifBancaria,
  ordenes: ReadonlyArray<PaymentOrder>,
  ventanaDias = 2,
): MatchearNotifResult {
  const candidatos: Array<CandidatoNotif & { dist: number }> = [];
  let evaluadas = 0;
  for (const o of ordenes) {
    if (o.estado !== "preparada" && o.estado !== "vencida") continue;
    evaluadas++;
    if (o.montoCentavos !== notif.montoCentavos) continue;
    const venceIso = iso_de_vencimiento(o.venceElMs);
    const dist = Math.abs(diff_dias(notif.fechaIso, venceIso));
    if (dist > ventanaDias) continue;
    candidatos.push({
      orderId: o.id,
      numero: o.numero,
      concepto: o.concepto,
      montoCentavos: o.montoCentavos.toString(),
      venceEl: venceIso,
      motivo: dist === 0 ? "monto exacto + vence el mismo día" : `monto exacto + vence a ${dist} día${dist === 1 ? "" : "s"}`,
      dist,
    });
  }
  candidatos.sort((a, b) => a.dist - b.dist);
  return {
    candidatos: candidatos.map((c) => ({
      orderId: c.orderId,
      numero: c.numero,
      concepto: c.concepto,
      montoCentavos: c.montoCentavos,
      venceEl: c.venceEl,
      motivo: c.motivo,
    })),
    evaluadas,
  };
}
