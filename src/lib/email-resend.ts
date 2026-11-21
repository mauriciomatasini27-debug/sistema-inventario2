import type { EmailEnvio, EmailProvider, EnvioResultado } from "../modules/email/proveedor.js";

// P10-92: adaptador Resend del EmailProvider (el que ya usan alertas e
// invitaciones). La clave y el remitente salen de RESEND_API_KEY y EMAIL_FROM;
// sin las dos no hay proveedor y el job no toca la cola. Idempotency-Key hace
// que Resend no repita un envío reintentado dentro de sus 24 h.
// El motivo de falla es el código HTTP o "timeout", para clasificar_error.

type Fetch = (url: string, init: RequestInit) => Promise<Response>;

export class ProveedorResend implements EmailProvider {
  constructor(
    private readonly apiKey: string,
    private readonly remitente: string,
    private readonly hacerFetch: Fetch = (u, i) => fetch(u, i),
    private readonly timeoutMs = 10_000,
  ) {}

  async send(envio: EmailEnvio): Promise<EnvioResultado> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      const res = await this.hacerFetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": envio.idempotencyKey.slice(0, 256),
        },
        body: JSON.stringify({
          from: this.remitente,
          to: [envio.para],
          subject: envio.asunto,
          html: envio.html,
          text: envio.texto,
        }),
        signal: ctrl.signal,
      });
      if (!res.ok) return { ok: false, motivo: String(res.status) };
      const id = /"id"\s*:\s*"([^"]+)"/.exec(await res.text())?.[1];
      return { ok: true, providerMessageId: id ?? "resend" };
    } catch {
      return { ok: false, motivo: "timeout" };
    } finally {
      clearTimeout(timer);
    }
  }
}

export function proveedorEmailDesdeEnv(): EmailProvider | null {
  const clave = process.env.RESEND_API_KEY ?? "";
  const remitente = process.env.EMAIL_FROM ?? "";
  if (!clave || !remitente) return null;
  return new ProveedorResend(clave, remitente);
}
