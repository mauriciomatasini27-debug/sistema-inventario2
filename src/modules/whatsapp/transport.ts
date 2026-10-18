import { descargar_media, enviar_whatsapp, marcar_leido, type FetchEnvio, type ResultadoEnvio } from "./cliente-cloud.js";
import { construir_texto, type PayloadEnvio } from "./envio.js";
import type { ImagenOcr } from "../ocr/imagen.js";

// Interfaz WhatsAppTransport (ADR-0042, PRD-BOT-02 BOT2-S5). Toda entrada y
// salida del bot pasa por acá: el núcleo puro nunca importa adaptadores.
// Adaptadores: cloud (productivo, ADR-0041) y fake (tests y dev, sin red).

export interface MensajeWA {
  readonly wamid: string;
  readonly remitenteE164: string;
  readonly texto: string;
  readonly timestampMs: number;
}

// Adjunto entrante (image/document de la Cloud API). El mensaje trae el id de
// media de Meta; los bytes los baja `descargarMedia` (ADR-0005).
export interface MensajeAdjuntoWA {
  readonly wamid: string;
  readonly remitenteE164: string;
  readonly timestampMs: number;
  readonly adjunto: { readonly idMedia: string; readonly mimeType: string; readonly nombreArchivo: string | null };
}

export type ResultadoEnvioTransporte = ResultadoEnvio;

export interface EstadoTransporte {
  readonly nombre: "cloud" | "fake";
  readonly disponible: boolean;
}

export interface WhatsAppTransport {
  enviar(toE164: string, texto: string): Promise<ResultadoEnvioTransporte>;
  enviarPayload(toE164: string, payload: PayloadEnvio): Promise<ResultadoEnvioTransporte>;
  recibir(payload: unknown): MensajeWA | null;
  descargarMedia(idMedia: string): Promise<ImagenOcr | null>;
  estado(): EstadoTransporte;
}

interface MensajeCrudo {
  readonly id?: string;
  readonly from?: string;
  readonly timestamp?: string;
  readonly type?: string;
  readonly text?: { readonly body?: string };
  readonly image?: { readonly id?: string; readonly mime_type?: string };
  readonly document?: { readonly id?: string; readonly mime_type?: string; readonly filename?: string };
}

// Primer mensaje del webhook de la Cloud API (con o sin texto).
function mensajeCrudo(payload: unknown): MensajeCrudo | null {
  try {
    const b = payload as {
      readonly entry?: ReadonlyArray<{
        readonly changes?: ReadonlyArray<{
          readonly value?: { readonly messages?: ReadonlyArray<MensajeCrudo> };
        }>;
      }>;
    };
    return b.entry?.[0]?.changes?.[0]?.value?.messages?.[0] ?? null;
  } catch {
    return null;
  }
}

function remitenteDe(from: string): string {
  return from.startsWith("+") ? from : `+${from}`;
}

// Normaliza el payload de la Cloud API al mensaje interno. Misma forma para
// ambos adaptadores: el fake genera cargas con forma cloud en los tests.
export function normalizarEntrada(payload: unknown): MensajeWA | null {
  const msg = mensajeCrudo(payload);
  if (!msg?.text?.body || !msg.from || !msg.id) return null;
  return {
    wamid: msg.id,
    remitenteE164: remitenteDe(msg.from),
    texto: msg.text.body,
    timestampMs: msg.timestamp ? Number(msg.timestamp) * 1000 : Date.now(),
  };
}

// Adjunto de imagen o documento: mismo sobre que el mensaje de texto, con el
// id de media y el mime_type del payload. El resto de los tipos (audio, voz,
// ubicación, stickers) sigue sin mensaje, como antes.
export function normalizarAdjuntoEntrada(payload: unknown): MensajeAdjuntoWA | null {
  const msg = mensajeCrudo(payload);
  if (!msg?.from || !msg.id) return null;
  const medio = msg.type === "image" ? msg.image : msg.type === "document" ? msg.document : undefined;
  if (!medio?.id) return null;
  return {
    wamid: msg.id,
    remitenteE164: remitenteDe(msg.from),
    timestampMs: msg.timestamp ? Number(msg.timestamp) * 1000 : Date.now(),
    adjunto: {
      idMedia: medio.id,
      mimeType: medio.mime_type ?? "",
      nombreArchivo: msg.type === "document" ? (msg.document?.filename ?? null) : null,
    },
  };
}

export class TransporteFake implements WhatsAppTransport {
  readonly enviados: Array<{ to: string; texto: string }> = [];
  readonly enviadosPayload: Array<{ to: string; payload: PayloadEnvio }> = [];
  private n = 0;

  async enviar(toE164: string, texto: string): Promise<ResultadoEnvioTransporte> {
    this.n += 1;
    this.enviados.push({ to: toE164, texto });
    return { ok: true, wamid: `fake-${this.n}` };
  }

  async enviarPayload(toE164: string, payload: PayloadEnvio): Promise<ResultadoEnvioTransporte> {
    this.n += 1;
    this.enviadosPayload.push({ to: toE164, payload });
    return { ok: true, wamid: `fake-${this.n}` };
  }

  recibir(payload: unknown): MensajeWA | null {
    return normalizarEntrada(payload);
  }

  async descargarMedia(_idMedia: string): Promise<ImagenOcr | null> {
    return { bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xe0]), mimeType: "image/jpeg" };
  }

  estado(): EstadoTransporte {
    return { nombre: "fake", disponible: true };
  }
}

export function crearTransporteCloud(opts: {
  phoneNumberId: string;
  token: string;
  fetchFn?: FetchEnvio | undefined;
  apiVersion?: string | undefined;
}): WhatsAppTransport {
  const disponible = opts.phoneNumberId.length > 0 && opts.token.length > 0;
  const enviar = (toE164: string, payload: PayloadEnvio): Promise<ResultadoEnvioTransporte> => {
    if (!disponible) return Promise.resolve({ ok: false, codigo: "rechazado" });
    return enviar_whatsapp({
      phoneNumberId: opts.phoneNumberId,
      token: opts.token,
      toE164,
      payload,
      fetchFn: opts.fetchFn,
    });
  };
  return {
    async enviar(toE164: string, texto: string): Promise<ResultadoEnvioTransporte> {
      return enviar(toE164, construir_texto(texto));
    },
    async enviarPayload(toE164: string, payload: PayloadEnvio): Promise<ResultadoEnvioTransporte> {
      return enviar(toE164, payload);
    },
    recibir(payload: unknown): MensajeWA | null {
      return normalizarEntrada(payload);
    },
    async descargarMedia(idMedia: string): Promise<ImagenOcr | null> {
      if (!disponible) return null;
      return descargar_media({ idMedia, token: opts.token, ...(opts.apiVersion ? { apiVersion: opts.apiVersion } : {}) });
    },
    estado(): EstadoTransporte {
      return { nombre: "cloud", disponible };
    },
  };
}

// Marca leído best-effort del adaptador cloud (no bloquea la respuesta).
export async function marcarLeidoCloud(opts: {
  phoneNumberId: string;
  token: string;
  wamidEntrante: string;
  fetchFn?: FetchEnvio | undefined;
}): Promise<void> {
  await marcar_leido({ ...opts });
}
