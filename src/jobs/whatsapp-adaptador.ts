// Adaptador compartido de los jobs WA (B5/B9/B14). Sin Drizzle todavía:
// lee control/store en memoria con la misma forma que las lecturas Drizzle
// en prod. El envío real va por Cloud API con las credenciales del servidor;
// sin credenciales el envío falla (se registra) pero el job no revienta.

import { control, store } from "../lib/store.js";
import { construir_texto, type PayloadEnvio } from "../modules/whatsapp/envio.js";
import { enviar_whatsapp } from "../modules/whatsapp/cliente-cloud.js";
import type { Preferencias } from "../modules/whatsapp/optin.js";

export interface ComercioWa {
  readonly tenantId: string;
  readonly nombreComercio: string;
  readonly googleSub: string;
  readonly numero: string;
  readonly prefs: Preferencias;
}

// B2: ausente => optIn false (sin opt-in no sale ninguna plantilla).
export function prefs_wa_de(tenantId: string, googleSub: string): Preferencias {
  const p = control.waPrefs.get(`${tenantId}:${googleSub}`);
  return {
    optIn: p?.optIn ?? false,
    avisoHora: p?.avisoHora ?? "08:00",
    pausadoHastaMs: p?.pausadoHastaMs ?? null,
  };
}

// Comercios con número verificado y tenant activo o suspendido (B1.10: el
// suspendido recibe avisos de solo lectura, pero no envía pedidos).
export function comercios_con_bot(): ComercioWa[] {
  const out: ComercioWa[] = [];
  for (const [numero, l] of control.botLinks) {
    if (l.estado !== "verificado") continue;
    const t = control.tenants.get(l.tenantId);
    if (!t || (t.estado !== "activo" && t.estado !== "suspendido")) continue;
    out.push({
      tenantId: l.tenantId,
      nombreComercio: t.nombreComercio,
      googleSub: l.googleSub,
      numero,
      prefs: prefs_wa_de(l.tenantId, l.googleSub),
    });
  }
  return out;
}

export function cred_wa(): { readonly phoneNumberId: string; readonly token: string } | null {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID ?? "";
  const token = process.env.WHATSAPP_TOKEN ?? "";
  if (!phoneNumberId || !token) return null;
  return { phoneNumberId, token };
}

// Envía texto libre por Cloud API. Nunca lanza: false si no hay
// credenciales o el envío falla (el job lo registra por canal).
export async function enviar_texto_wa(toE164: string, texto: string): Promise<boolean> {
  return enviar_payload_wa(toE164, construir_texto(texto));
}

// BOT-S8: mismo envío, con payload interactivo (botones de acciones). Nunca
// lanza: false si no hay credenciales o el envío falla.
export async function enviar_payload_wa(toE164: string, payload: PayloadEnvio): Promise<boolean> {
  const c = cred_wa();
  if (!c) return false;
  const r = await enviar_whatsapp({ ...c, toE164, payload });
  return r.ok;
}

// Email slice-0: se encola como enviado en el outbox en memoria (prod:
// proveedor transaccional con Reply-To del comercio).
export function encolar_email_simple(idempotencyKey: string, destinatario: string, asunto: string, texto: string): boolean {
  if (store.emailOutbox.has(idempotencyKey)) return true;
  store.emailOutbox.set(idempotencyKey, {
    idempotencyKey,
    destinatario,
    asunto,
    html: `<p>${texto}</p>`,
    texto,
    estado: "enviado",
    intentos: 0,
    providerMessageId: null,
  });
  return true;
}
