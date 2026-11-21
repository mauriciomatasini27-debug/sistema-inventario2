// Nunca lanza ni bloquea la ruta: sin credenciales no hace nada, con
// credenciales envía por Cloud API y traga errores. Si WA no pudo (sin
// destinos, no habilitado o fallo) y hay email verificado, cae a email
// (Resend si hay clave, si no no-op). La decisión pura vive en
// modules/auth/bot.ts y modules/auth/segundo-canal.ts.

import { control } from "./store.js";
import { membershipActiva } from "./control.js";
import {
  armarTextoAlertaSeguridad,
  decidirAlertaSeguridad,
  type EventoAlertaSeguridad,
} from "../modules/auth/bot.js";
import {
  armarEmailSeguridad,
  elegirCanal,
} from "../modules/auth/segundo-canal.js";
import { construir_texto } from "../modules/whatsapp/envio.js";
import { enviar_whatsapp } from "../modules/whatsapp/cliente-cloud.js";

function credenciales(): { phoneNumberId: string; token: string } | null {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID ?? "";
  const token = process.env.WHATSAPP_TOKEN ?? "";
  if (!phoneNumberId || !token) return null;
  return { phoneNumberId, token };
}

function rolDe(tenantId: string | null, googleSub: string): { rol: "dueno" | "empleado"; puedeUsarBot?: boolean | undefined } {
  if (tenantId) {
    const m = membershipActiva(tenantId, googleSub);
    if (m) return { rol: m.rol === "dueno" ? "dueno" : "empleado", puedeUsarBot: m.puedeUsarBot };
  }
  for (const m of control.memberships.values()) {
    if (m.googleSub === googleSub && m.estado === "activo") {
      return { rol: m.rol === "dueno" ? "dueno" : "empleado", puedeUsarBot: m.puedeUsarBot };
    }
  }
  return { rol: "empleado" };
}

export async function notificarAlertaSeguridad(opts: {
  evento: EventoAlertaSeguridad;
  tenantId: string | null;
  googleSubDestino: string;
  comercio?: string | undefined;
  detalle?: string | undefined;
  enviarEmail?: ((args: { para: string; asunto: string; texto: string }) => Promise<unknown>) | undefined;
}): Promise<void> {
  try {
    const cred = credenciales();
    const tenant = opts.tenantId ? control.tenants.get(opts.tenantId) : undefined;
    const comercio = opts.comercio ?? (tenant as { nombreComercio?: string } | undefined)?.nombreComercio ?? "tu comercio";
    const owner = (tenant as { ownerGoogleSub?: string } | undefined)?.ownerGoogleSub;
    const numeros: Array<{ numero: string; googleSub: string }> = [];
    for (const [numero, l] of control.botLinks.entries()) {
      if (l.estado !== "verificado") continue;
      if (l.googleSub === opts.googleSubDestino && (opts.tenantId === null || l.tenantId === opts.tenantId)) {
        numeros.push({ numero, googleSub: l.googleSub });
      } else if (owner && l.googleSub === owner && l.tenantId === opts.tenantId && opts.googleSubDestino !== owner) {
        numeros.push({ numero, googleSub: l.googleSub });
      }
    }
    const usuario = control.users.get(opts.googleSubDestino);
    const email = usuario?.email;
    const emailVerificado = usuario?.emailVerificado === true;
    let waHabilitado = false;
    for (const n of numeros) {
      const r = rolDe(opts.tenantId ?? control.botLinks.get(n.numero)?.tenantId ?? null, n.googleSub);
      if (r.rol === "dueno" || r.puedeUsarBot !== false) waHabilitado = true;
    }
    if (elegirCanal({ vinculadoWA: numeros.length > 0, waHabilitado, emailVerificado }) === "ninguno") return;
    const texto = armarTextoAlertaSeguridad({ evento: opts.evento, comercio, detalle: opts.detalle });
    let waOk = false;
    if (cred) {
      for (const n of numeros) {
        const r = rolDe(opts.tenantId ?? control.botLinks.get(n.numero)?.tenantId ?? null, n.googleSub);
        const d = decidirAlertaSeguridad({ evento: opts.evento, rolDestino: r.rol, vinculado: true, puedeUsarBot: r.puedeUsarBot });
        if (!d.enviar) continue;
        try {
          const res = await enviar_whatsapp({ phoneNumberId: cred.phoneNumberId, token: cred.token, toE164: n.numero, payload: construir_texto(texto) });
          if (res.ok) waOk = true;
        } catch {
        }
      }
    }
    if (waOk) return;
    if (!email || !emailVerificado) return;
    const mail = armarEmailSeguridad({ evento: opts.evento, comercio, detalle: opts.detalle });
    try {
      if (opts.enviarEmail) {
        await opts.enviarEmail({ para: email, asunto: mail.asunto, texto: mail.texto });
      } else {
        await enviarEmailResend(email, mail.asunto, mail.texto);
      }
    } catch {
    }
  } catch {
  }
}

async function enviarEmailResend(para: string, asunto: string, texto: string): Promise<void> {
  const key = process.env.RESEND_API_KEY ?? "";
  if (!key) return;
  const from = process.env.EMAIL_FROM ?? "Inventario <seguridad@local>";
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 5000);
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [para], subject: asunto, text: texto }),
      signal: ctrl.signal,
    });
  } finally {
    clearTimeout(t);
  }
}
