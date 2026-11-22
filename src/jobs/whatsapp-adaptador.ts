
import { store } from "../lib/store.js";
import { prefsDe } from "../lib/repos/alerta-prefs.js";
import { linksBotVivos } from "../lib/repos/whatsapp.js";
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
export async function prefs_wa_de(tenantId: string, googleSub: string): Promise<Preferencias> {
  const p = await prefsDe(tenantId, googleSub);
  return {
    optIn: p.optIn,
    avisoHora: p.avisoHora,
    pausadoHastaMs: p.pausadoHastaMs,
  };
}

export async function comercios_con_bot(): Promise<ComercioWa[]> {
  const links = await linksBotVivos();
  const out: ComercioWa[] = [];
  for (const [numero, l] of links) {
    if (l.estado !== "verificado") continue;
    if (l.estadoTenant !== "activo" && l.estadoTenant !== "suspendido") continue;
    out.push({
      tenantId: l.tenantId,
      nombreComercio: l.nombreComercio,
      googleSub: l.googleSub,
      numero,
      prefs: await prefs_wa_de(l.tenantId, l.googleSub),
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

export function id_plantilla_aprobada(nombre: string): string | null {
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
  readonly dentroVentana24h?: boolean | undefined;
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

export async function enviar_texto_wa(
  toE164: string,
  texto: string,
  opts?: OpcionesEnvioJobWa,
): Promise<boolean> {
  return enviar_payload_wa(toE164, construir_texto(texto), opts);
}

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
