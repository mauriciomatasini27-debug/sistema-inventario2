// TV12 P1 — Adaptador plantilla `ticket_listo` es_AR (fuera de ventana 24h).
// Puro + fetch inyectable, mismo estilo que cliente-cloud (nunca lanza al
// dominio: fallos tipados). La plantilla se crea/aprueba en Meta Business
// Manager (ver docs del slice: cuerpo con leyenda no fiscal incluida,
// variables {{1}} número, {{2}} total ARS, {{3}} link 72h, sin PII).
//
// Se dispara SOLO cuando decidir_envio_central() devuelve
// { modo: "requiere_plantilla" }. Idempotencia: key = Idempotency-Key de
// POST /api/tickets/compartir en store.ticketEnviosCentral (chequear
// ya_enviado() ANTES del fetch, set solo tras ok:true).
// Costo: 2600n centavos ARS por envío exitoso (~USD 0,026).

import { API_VERSION_DEFECTO, COSTO_PLANTILLA_CENTAVOS } from "../whatsapp/envio.js";
import { ya_enviado } from "./ticket_share.js";

export const PLANTILLA_TICKET_LISTO = "ticket_listo" as const;
export const LOCALE_TICKET_LISTO = "es_AR" as const;

export interface VarsTicketListo {
  readonly numeroTicket: string; // {{1}} — definitivo ?? provisorio, ya truncado
  readonly totalArs: string; // {{2}} — formato_ars(bigint), ej. "$1.500,00"
  readonly linkPublico: string; // {{3}} — URL corta 72h, sin PII en query
}

export type FetchEnvio = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

function body_plantilla_ticket_listo(toE164: string, v: VarsTicketListo) {
  return {
    messaging_product: "whatsapp" as const,
    recipient_type: "individual" as const,
    to: toE164,
    type: "template" as const,
    template: {
      name: PLANTILLA_TICKET_LISTO,
      language: { code: LOCALE_TICKET_LISTO },
      components: [
        {
          type: "body" as const,
          parameters: [
            { type: "text" as const, text: v.numeroTicket },
            { type: "text" as const, text: v.totalArs },
            { type: "text" as const, text: v.linkPublico },
          ],
        },
      ],
    },
  };
}

// Cada llamada exitosa consume 2600n centavos ARS. El llamante lo imputa al
// registrar el envío.
export async function enviar_plantilla_ticket_listo(opts: {
  phoneNumberId: string;
  token: string;
  toE164: string;
  vars: VarsTicketListo;
  idempotencyKey: string;
  vistos: ReadonlyMap<string, unknown>; // store.ticketEnviosCentral
  marcarEnviado: (key: string, info: unknown) => void; // store.ticketEnviosCentral.set
  fetchFn?: FetchEnvio | undefined;
  apiVersion?: string | undefined;
  timeoutMs?: number | undefined;
}): Promise<
  | { readonly ok: true; readonly wamid: string; readonly costoCentavos: bigint }
  | { readonly ok: false; readonly codigo: "red" | "rechazado" | "respuesta_invalida" | "duplicado" }
> {
  if (ya_enviado(opts.vistos, opts.idempotencyKey)) return { ok: false, codigo: "duplicado" };
  const fetchFn = opts.fetchFn ?? (fetch as unknown as FetchEnvio);
  const url = `https://graph.facebook.com/${opts.apiVersion ?? API_VERSION_DEFECTO}/${opts.phoneNumberId}/messages`;
  const body = JSON.stringify(body_plantilla_ticket_listo(opts.toE164, opts.vars));
  const headers = { Authorization: `Bearer ${opts.token}`, "Content-Type": "application/json" };
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 5000);
  try {
    const res = await fetchFn(url, { method: "POST", headers, body, signal: ctrl.signal });
    if (!res.ok) return { ok: false, codigo: res.status >= 500 || res.status === 429 ? "red" : "rechazado" };
    const r = (await res.json().catch(() => null)) as { messages?: Array<{ id?: string }> } | null;
    const wamid = r?.messages?.[0]?.id;
    if (typeof wamid !== "string" || wamid.length === 0) return { ok: false, codigo: "respuesta_invalida" };
    opts.marcarEnviado(opts.idempotencyKey, { wamid, plantilla: PLANTILLA_TICKET_LISTO, cuando: new Date().toISOString() });
    return { ok: true, wamid, costoCentavos: COSTO_PLANTILLA_CENTAVOS };
  } catch {
    return { ok: false, codigo: "red" };
  } finally {
    clearTimeout(t);
  }
}
