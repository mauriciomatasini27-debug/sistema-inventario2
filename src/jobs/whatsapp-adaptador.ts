
import { control, store } from "../lib/store.js";
import { construir_texto, puede_disparar_envio, type PayloadEnvio } from "../modules/whatsapp/envio.js";
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

// WA-VENTANA: ids aprobados en Meta viven en WHATSAPP_PLANTILLAS_APROBADAS (JSON).
function id_plantilla_aprobada(nombre: string): string | null {
  const raw = process.env.WHATSAPP_PLANTILLAS_APROBADAS ?? "";
  if (!raw.trim()) return null;
  try {
    const mapa = JSON.parse(raw) as Record<string, unknown>;
    const v = mapa[nombre];
    return typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
  } catch {
    return null;
  }
}

export interface OpcionesEnvioJobWa {
  /** Por defecto false: los jobs proactivos salen fuera de la ventana 24h. */
  readonly dentroVentana24h?: boolean | undefined;
  /** Nombre lógico de plantilla (clave en WHATSAPP_PLANTILLAS_APROBADAS). */
  readonly nombrePlantilla?: string | undefined;
}

function resolver_guarda_ventana(opts: OpcionesEnvioJobWa | undefined): boolean {
  const dentroVentana24h = opts?.dentroVentana24h ?? false;
  const idPlantillaAprobada =
    opts?.nombrePlantilla != null && opts.nombrePlantilla.length > 0
      ? id_plantilla_aprobada(opts.nombrePlantilla)
      : null;
  return puede_disparar_envio({ dentroVentana24h, idPlantillaAprobada });
}

// Envía texto libre por Cloud API. Nunca lanza: false si no hay
// credenciales, ventana/plantilla no habilita envío, o el envío falla.
export async function enviar_texto_wa(
  toE164: string,
  texto: string,
  opts?: OpcionesEnvioJobWa,
): Promise<boolean> {
  return enviar_payload_wa(toE164, construir_texto(texto), opts);
}

// BOT-S8: mismo envío, con payload interactivo (botones de acciones). Nunca
// lanza: false si no hay credenciales, ventana/plantilla no habilita envío, o falla.
export async function enviar_payload_wa(
  toE164: string,
  payload: PayloadEnvio,
  opts?: OpcionesEnvioJobWa,
): Promise<boolean> {
  const c = cred_wa();
  if (!c) return false;
  if (!resolver_guarda_ventana(opts)) return false;
  const r = await enviar_whatsapp({ ...c, toE164, payload });
  return r.ok;
}

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
