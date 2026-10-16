import { enviar_whatsapp, marcar_leido, type FetchEnvio, type ResultadoEnvio } from "./cliente-cloud.js";
import { construir_texto } from "./envio.js";

// Interfaz WhatsAppTransport (ADR-0042, PRD-BOT-02 BOT2-S5). Toda entrada y
// salida del bot pasa por acá: el núcleo puro nunca importa adaptadores.
// Adaptadores: cloud (productivo, ADR-0041) y fake (tests y dev, sin red).

export interface MensajeWA {
  readonly wamid: string;
  readonly remitenteE164: string;
  readonly texto: string;
  readonly timestampMs: number;
}

export type ResultadoEnvioTransporte = ResultadoEnvio;

export interface EstadoTransporte {
  readonly nombre: "cloud" | "fake";
  readonly disponible: boolean;
}

export interface WhatsAppTransport {
  enviar(toE164: string, texto: string): Promise<ResultadoEnvioTransporte>;
  recibir(payload: unknown): MensajeWA | null;
  estado(): EstadoTransporte;
}

// Normaliza el payload de la Cloud API al mensaje interno. Misma forma para
// ambos adaptadores: el fake genera cargas con forma cloud en los tests.
export function normalizarEntrada(payload: unknown): MensajeWA | null {
  try {
    const b = payload as {
      readonly entry?: ReadonlyArray<{
        readonly changes?: ReadonlyArray<{
          readonly value?: {
            readonly messages?: ReadonlyArray<{
              readonly id?: string;
              readonly from?: string;
              readonly timestamp?: string;
              readonly text?: { readonly body?: string };
            }>;
          };
        }>;
      }>;
    };
    const msg = b.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!msg?.text?.body || !msg.from || !msg.id) return null;
    return {
      wamid: msg.id,
      remitenteE164: msg.from.startsWith("+") ? msg.from : `+${msg.from}`,
      texto: msg.text.body,
      timestampMs: msg.timestamp ? Number(msg.timestamp) * 1000 : Date.now(),
    };
  } catch {
    return null;
  }
}

export class TransporteFake implements WhatsAppTransport {
  readonly enviados: Array<{ to: string; texto: string }> = [];
  private n = 0;

  async enviar(toE164: string, texto: string): Promise<ResultadoEnvioTransporte> {
    this.n += 1;
    this.enviados.push({ to: toE164, texto });
    return { ok: true, wamid: `fake-${this.n}` };
  }

  recibir(payload: unknown): MensajeWA | null {
    return normalizarEntrada(payload);
  }

  estado(): EstadoTransporte {
    return { nombre: "fake", disponible: true };
  }
}

export function crearTransporteCloud(opts: {
  phoneNumberId: string;
  token: string;
  fetchFn?: FetchEnvio | undefined;
}): WhatsAppTransport {
  const disponible = opts.phoneNumberId.length > 0 && opts.token.length > 0;
  return {
    async enviar(toE164: string, texto: string): Promise<ResultadoEnvioTransporte> {
      if (!disponible) return { ok: false, codigo: "rechazado" };
      return enviar_whatsapp({
        phoneNumberId: opts.phoneNumberId,
        token: opts.token,
        toE164,
        payload: construir_texto(texto),
        fetchFn: opts.fetchFn,
      });
    },
    recibir(payload: unknown): MensajeWA | null {
      return normalizarEntrada(payload);
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
