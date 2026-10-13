// Núcleo puro NE10: desuscripción en un clic por categoría. Sin IO.
// Token HMAC (comercio+usuario+categoría), no vence, no inicia sesión.
// Solo corta el email de esa categoría; el WhatsApp sigue (NE10.4).

import { createHmac, timingSafeEqual } from "node:crypto";
import { CATALOGO, type TipoEmail } from "./catalogo.js";
import type { PrefsEmail } from "./preferencias.js";

export interface BajaDatos {
  readonly tenantId: string;
  readonly sub: string;
  readonly categoria: TipoEmail;
}

function b64url_de(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj), "utf8").toString("base64url");
}

function b64url_a<T>(s: string): T | null {
  try {
    return JSON.parse(Buffer.from(s, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}

export function firmar_baja(secret: string, datos: BajaDatos): string {
  if (!CATALOGO[datos.categoria].desactivable) throw new Error("categoria no desactivable");
  const cuerpo = b64url_de({ t: datos.tenantId, s: datos.sub, c: datos.categoria });
  const firma = createHmac("sha256", secret).update(cuerpo, "utf8").digest("hex");
  return `${cuerpo}.${firma}`;
}

export function verificar_baja(
  secret: string,
  token: string,
): { ok: true; datos: BajaDatos } | { ok: false; error: string } {
  const punto = token.indexOf(".");
  if (punto <= 0) return { ok: false, error: "token invalido" };
  const cuerpo = token.slice(0, punto);
  const firma = token.slice(punto + 1);
  const esperada = createHmac("sha256", secret).update(cuerpo, "utf8").digest("hex");
  const a = Buffer.from(esperada, "utf8");
  const b = Buffer.from(firma, "utf8");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, error: "token invalido" };
  const crudo = b64url_a<{ t: unknown; s: unknown; c: unknown }>(cuerpo);
  if (!crudo || typeof crudo.t !== "string" || typeof crudo.s !== "string" || typeof crudo.c !== "string") {
    return { ok: false, error: "token invalido" };
  }
  const categoria = crudo.c as TipoEmail;
  if (!CATALOGO[categoria]) return { ok: false, error: "token invalido" };
  return { ok: true, datos: { tenantId: crudo.t, sub: crudo.s, categoria } };
}

// Aplica la baja: desactiva solo el email de la categoría. El adaptador
// registra origen link_baja en audit_log y notification_preferences.
export function aplicar_baja(
  prefs: PrefsEmail,
  categoria: TipoEmail,
): { ok: true; prefs: PrefsEmail } | { ok: false; error: string } {
  if (!CATALOGO[categoria].desactivable) return { ok: false, error: "categoria no desactivable" };
  return {
    ok: true,
    prefs: {
      ...prefs,
      porTipo: { ...prefs.porTipo, [categoria]: { ...prefs.porTipo[categoria], activo: false } },
    },
  };
}

// Cabeceras RFC 8058 solo para categorías desactivables (NE7.4: seguridad
// y cuenta no llevan List-Unsubscribe; el adaptador no llama acá para ellas).
export function cabeceras_baja(baseUrl: string, token: string, categoria: TipoEmail): Record<string, string> | null {
  if (!CATALOGO[categoria].desactivable) return null;
  const sinBarra = baseUrl.replace(/\/$/, "");
  return {
    "List-Unsubscribe": `<${sinBarra}/api/email/u/${token}>, <mailto:baja@${dominio_de(baseUrl)}?subject=${token}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}

function dominio_de(baseUrl: string): string {
  try {
    return new URL(baseUrl).hostname;
  } catch {
    return "avisos.local";
  }
}

export function url_baja(baseUrl: string, token: string): string {
  return `${baseUrl.replace(/\/$/, "")}/api/email/u/${token}`;
}
