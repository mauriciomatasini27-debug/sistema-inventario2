// Núcleo puro Email: proveedor + gate de envío (PRD Email NE9/NE11).
// Sin IO: el adaptador (Resend en P1) implementa EmailProvider con fetch.

export interface EmailEnvio {
  readonly para: string;
  readonly asunto: string;
  readonly html: string;
  readonly texto: string;
  readonly idempotencyKey: string;
  readonly categoria: string;
  readonly plantilla: string;
}

export type EnvioResultado =
  | { readonly ok: true; readonly providerMessageId: string }
  | { readonly ok: false; readonly motivo: string };

export interface EmailProvider {
  send(envio: EmailEnvio): Promise<EnvioResultado>;
}

// Fake en memoria para el slice: idempotente por idempotencyKey.
// El Resend real vive en el adaptador (P1); la forma del envío es la misma.
export class ProveedorFake implements EmailProvider {
  readonly enviados: EmailEnvio[] = [];
  private vistos = new Map<string, string>();

  async send(envio: EmailEnvio): Promise<EnvioResultado> {
    const previo = this.vistos.get(envio.idempotencyKey);
    if (previo) return { ok: true, providerMessageId: previo };
    const id = `fake-${this.enviados.length + 1}`;
    this.vistos.set(envio.idempotencyKey, id);
    this.enviados.push(envio);
    return { ok: true, providerMessageId: id };
  }
}

// NE9: qué/frecuencia + pausa. El silencio 23:00-07:30 y la frecuencia
// viven en el orquestador (P1); el slice solo cubre opt + pausa.
export interface PreferenciasEmail {
  readonly resumenCierre: boolean;
  readonly pausadoHastaMs: number | null;
}

export function puede_enviar_email(prefs: PreferenciasEmail, ahoraMs: number): boolean {
  if (!prefs.resumenCierre) return false;
  if (prefs.pausadoHastaMs != null && ahoraMs < prefs.pausadoHastaMs) return false;
  return true;
}
