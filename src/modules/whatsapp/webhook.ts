import { createHmac, timingSafeEqual } from "node:crypto";

// Adaptador webhook Cloud API (PRD Bot 6.2/6.4): verifica firma,
// deduplica por wamid, orden secuencial por número.
// El núcleo no toca red ni DB: esta capa valida y encola.

export function verificar_firma_meta(args: { appSecret: string; rawBody: string; signatureHeader: string | null }): boolean {
  if (!args.signatureHeader) return false;
  const m = args.signatureHeader.match(/^sha256=(.+)$/);
  if (!m) return false;
  const esperado = createHmac("sha256", args.appSecret).update(args.rawBody, "utf8").digest("hex");
  const a = Buffer.from(esperado, "utf8");
  const b = Buffer.from(m[1]!, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

export interface MensajeEntrante {
  readonly wamid: string;
  readonly remitenteE164: string;
  readonly texto: string;
  readonly timestampMs: number;
}

// Deduplicación por wamid (Meta reintenta webhooks) + ventana 24h.
// El store real es whatsapp_usage (wamid UNIQUE); acá el chequeo en memoria
// para el adaptador en proceso (tests + single-instance).
export class DeduplicadorWamid {
  private vistos = new Map<string, number>();
  constructor(private readonly ventanaMs = 24 * 3600 * 1000) {}

  es_duplicado(m: MensajeEntrante, ahoraMs: number): boolean {
    for (const [k, v] of this.vistos) if (ahoraMs - v > this.ventanaMs) this.vistos.delete(k);
    if (this.vistos.has(m.wamid)) return true;
    this.vistos.set(m.wamid, ahoraMs);
    return false;
  }
}
