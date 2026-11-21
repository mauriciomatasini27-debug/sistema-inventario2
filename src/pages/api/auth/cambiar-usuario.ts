import type { APIRoute } from "astro";
import { control } from "../../../lib/store.js";
import { jsonError, resolverSesion } from "../../../lib/control.js";
import { cookieBorrarSesion, extraerSesionDeCookie, sha256Hex } from "../../../modules/auth/sesiones.js";
import { persistirAuthEvent, revocarSesionDb } from "../../../lib/control-db.js";

export const prerender = false;

// prompt=select_account para que la siguiente persona elija su cuenta.
// No es un logout silencioso: queda auditado como cambio_usuario.
export const POST: APIRoute = async ({ request }) => {
  const ctx = resolverSesion(request);
  if (!ctx) return jsonError("Iniciá sesión con Google para continuar.", 403);
  const idPlano = extraerSesionDeCookie(request.headers.get("cookie"));
  const ahora = new Date().toISOString();
  if (idPlano) {
    const s = control.sessions.get(sha256Hex(idPlano));
    if (s && !s.revocadaAt) {
      s.revocadaAt = ahora;
      s.motivo = "cambio_usuario";
      void revocarSesionDb(s.idHash, "cambio_usuario");
    }
  }
  control.events.push({ tenantId: ctx.tenantId, tipo: "cambio_usuario", actor: ctx.googleSub, creadoEn: ahora });
  void persistirAuthEvent({ tenantId: ctx.tenantId, tipo: "cambio_usuario", actor: ctx.googleSub });
  return new Response(JSON.stringify({ login_url: "/api/auth/login?prompt=select_account" }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": cookieBorrarSesion(),
    },
  });
};
