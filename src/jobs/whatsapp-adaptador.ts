
import { prefsDe } from "../lib/repos/alerta-prefs.js";
import { linksBotVivos } from "../lib/repos/whatsapp.js";
import { encolarEnvio, existeEnvio } from "../lib/repos/email.js";
import { construir_texto, puede_disparar_envio, type PayloadEnvio } from "../modules/whatsapp/envio.js";
import { enviar_whatsapp } from "../modules/whatsapp/cliente-cloud.js";
import type { Preferencias } from "../modules/whatsapp/optin.js";
import type { EmailProvider, EnvioResultado } from "../modules/email/proveedor.js";
import { armar_email_proveedor } from "../modules/whatsapp/envio-proveedor.js";

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

export interface EncolarEmailSimpleDeps {
  readonly proveedor: EmailProvider | null;
  readonly replyToComercio: string;
  readonly nombreComercio?: string | undefined;
  readonly tenantId?: string | undefined;
}

// P10-30 [tenant]: el envío lo hace el proveedor inyectado (Resend en prod,
// fake en tests) y el resultado queda en email_outbox; antes se marcaba
// "enviado" en el mapa del slice-0 sin mandar nada. El reply_to del comercio
// no tiene columna (sin migración): viaja en el sobre, no en la fila.
export async function encolar_email_simple(
  idempotencyKey: string,
  destinatario: string,
  asunto: string,
  texto: string,
  deps: EncolarEmailSimpleDeps,
): Promise<boolean> {
  if (await existeEnvio(idempotencyKey, deps.tenantId)) return true;
  const sobre = armar_email_proveedor({
    para: destinatario,
    replyToComercio: deps.replyToComercio,
    comercio: deps.nombreComercio ?? asunto,
    texto,
  });
  const asuntoFinal = asunto || sobre.asunto;
  const html = `<p>${texto}</p>`;
  let res: EnvioResultado | null = null;
  if (deps.proveedor) {
    try {
      res = await deps.proveedor.send({
        para: sobre.para,
        asunto: asuntoFinal,
        html,
        texto: sobre.texto,
        idempotencyKey,
        categoria: "aviso_wa",
        plantilla: "aviso_simple_v1",
        replyTo: sobre.replyTo,
      });
    } catch {
      res = { ok: false, motivo: "error" };
    }
  }
  await encolarEnvio({
    key: idempotencyKey,
    stream: "aviso_wa",
    to: sobre.para,
    plantilla: "aviso_simple_v1",
    vars: {},
    asunto: asuntoFinal,
    html,
    texto: sobre.texto,
    // P10-30 [tenant]: sin proveedor queda pendiente para el job; con fallo
    // también, para que reintente con el backoff de P10-92.
    estado: res?.ok ? "enviado" : "pendiente",
    providerMessageId: res?.ok ? res.providerMessageId : null,
    tenantId: deps.tenantId,
  });
  // P10-36 [tenant]: sin proveedor o con fallo la fila queda pendiente para P10-92; no es un envío confirmado.
  return res?.ok === true;
}
