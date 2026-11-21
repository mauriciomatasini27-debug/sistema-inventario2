import type { APIRoute } from "astro";
import { cookieBorrarSesion, extraerSesionDeCookie, sha256Hex } from "../../../modules/auth/sesiones.js";
import { control } from "../../../lib/store.js";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const idPlano = extraerSesionDeCookie(request.headers.get("cookie"));
  if (idPlano) {
    const s = control.sessions.get(sha256Hex(idPlano));
    if (s && !s.revocadaAt) {
      s.revocadaAt = new Date().toISOString();
      s.motivo = "logout";
      control.events.push({ tenantId: s.tenantId, tipo: "logout", actor: s.googleSub });
    }
  }
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": cookieBorrarSesion(),
    },
  });
};
