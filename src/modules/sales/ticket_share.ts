// ticket_share.ts — Slice C puro (TV11 wa.me gratis default + TV12 central P1).
// Núcleo puro: sin IO, sin red, sin env, sin Drizzle. Estilo del repo:
// snake_case, bigint centavos, tipos readonly, fallos tipados (no throw en
// dominio).
//
// Ley 25.326 mínimo: el resumen solo lleva número de ticket, total, medio,
// comercio y link público. Nada de PII extra (sin nombre/DNI/tel en el cuerpo).

export const LIMITE_TEXTO_WA = 4096 as const;
export const COSTO_PLANTILLA_CENTAVOS = 2600n as const;
export const LEYENDA_NO_FISCAL = "DOCUMENTO NO VÁLIDO COMO FACTURA" as const;

export interface ResumenTicketInput {
  readonly definitivo: string | null;
  readonly provisorio: string;
  readonly totalCentavos: bigint;
  readonly medio: string;
  readonly comercio: string;
  readonly linkPublico?: string | undefined;
}

export type ValidacionE164 =
  | { readonly ok: true; readonly e164: string; readonly sinMas: string }
  | { readonly ok: false; readonly codigo: "telefono_invalido" };

// E.164 estricto: `+` + 8..15 dígitos, primero no cero (ITU-T E.164).
const RE_E164 = /^\+[1-9]\d{7,14}$/;

export function validar_e164(telefono: string): ValidacionE164 {
  const t = telefono.trim();
  if (!RE_E164.test(t)) return { ok: false, codigo: "telefono_invalido" };
  return { ok: true, e164: t, sinMas: t.slice(1) };
}

// Trunca sin romper surrogate (misma semántica que truncar_titulo en
// src/modules/whatsapp/envio.ts; copiado para mantener el módulo
// autocontenido y puro).
export function truncar_seguro(s: string, max: number): string {
  const chars = [...s];
  if (chars.length <= max) return s;
  return `${chars.slice(0, max - 1).join("")}…`;
}

function formato_ars(totalCentavos: bigint): string {
  const negativo = totalCentavos < 0n ? "-" : "";
  const abs = totalCentavos < 0n ? -totalCentavos : totalCentavos;
  const ent = abs / 100n;
  const dec = abs % 100n;
  return `${negativo}$${ent.toString()}.${dec.toString().padStart(2, "0")}`;
}

// TV2/TV7: contenido sin costos + leyenda no fiscal. Sin PII (Ley 25.326).
export function construir_resumen_ticket(input: ResumenTicketInput): string {
  const numero = input.definitivo ?? input.provisorio;
  const lineas = [
    `Ticket ${numero} — ${input.comercio}`,
    `Total ${formato_ars(input.totalCentavos)} (${input.medio})`,
    LEYENDA_NO_FISCAL,
  ];
  if (input.linkPublico) lineas.push(`Ver ticket: ${input.linkPublico}`);
  return truncar_seguro(lineas.join("\n"), LIMITE_TEXTO_WA);
}

export type WaMeResult =
  | { readonly ok: true; readonly url: string; readonly e164: string }
  | { readonly ok: false; readonly codigo: "telefono_invalido" };

// TV11: builder wa.me gratis default. Sin costo, sin plantilla, sin IO:
// devuelve la URL; la apertura la hace el navegador del usuario.
export function construir_wa_me_url(opts: {
  readonly toE164: string;
  readonly resumen: string;
}): WaMeResult {
  const v = validar_e164(opts.toE164);
  if (!v.ok) return { ok: false, codigo: "telefono_invalido" };
  const texto = truncar_seguro(opts.resumen, LIMITE_TEXTO_WA);
  const url = `https://wa.me/${v.sinMas}?text=${encodeURIComponent(texto)}`;
  return { ok: true, url, e164: v.e164 };
}

export type ModoEnvioCentral = "libre" | "requiere_plantilla" | "bloqueado_optin";

export interface DecisionCentral {
  readonly modo: ModoEnvioCentral;
  readonly costoPlantillaCentavos: bigint | null;
  readonly payloadPreviewUrlFalse: true;
}

// TV12 P1: espeja decidir_modo() de envio.ts (libre dentro de ventana 24h,
// plantilla fuera) + gate de opt-in de optin.ts (puede_enviar_whatsapp).
// Recibe snapshots puros; el adaptador lee ventana/opt-in reales.
export function decidir_envio_central(opts: {
  readonly dentroVentana24h: boolean;
  readonly optIn: boolean;
  readonly pausadoHastaMs?: number | null | undefined;
  readonly ahoraMs: number;
}): DecisionCentral {
  const pausado =
    opts.pausadoHastaMs != null && opts.ahoraMs < opts.pausadoHastaMs;
  if (!opts.optIn || pausado) {
    return { modo: "bloqueado_optin", costoPlantillaCentavos: null, payloadPreviewUrlFalse: true };
  }
  if (opts.dentroVentana24h) {
    return { modo: "libre", costoPlantillaCentavos: null, payloadPreviewUrlFalse: true };
  }
  return { modo: "requiere_plantilla", costoPlantillaCentavos: COSTO_PLANTILLA_CENTAVOS, payloadPreviewUrlFalse: true };
}

// Payload texto libre Cloud API con preview_url false (igual que
// construir_texto() de envio.ts). Fuera de ventana el adaptador NO usa esto:
// dispara plantilla aprobada (contenido fuera del slice).
export function construir_payload_texto_central(resumen: string): {
  readonly type: "text";
  readonly text: { readonly body: string; readonly preview_url: false };
} {
  return { type: "text", text: { body: truncar_seguro(resumen, LIMITE_TEXTO_WA), preview_url: false } };
}

// Idempotency-Key / no duplicar envío: el adaptador guarda key = op_id del
// ticket (mismo de POST /api/sales) en notification_events y chequea antes
// de encolar/enviar. Helper puro para ese chequeo.
export function ya_enviado(
  vistos: ReadonlyMap<string, unknown> | ReadonlySet<string>,
  idempotencyKey: string,
): boolean {
  if (typeof (vistos as ReadonlyMap<string, unknown>).has === "function") {
    return (vistos as ReadonlyMap<string, unknown>).has(idempotencyKey);
  }
  return false;
}
