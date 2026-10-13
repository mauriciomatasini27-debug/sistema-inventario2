import type { APIRoute } from "astro";
import { control } from "../../../lib/store.js";
import { resolverSesion } from "../../../lib/control.js";
import { enmascararEmail, etiquetaAtendiendo, TEXTO_AYUDA_CUENTAS } from "../../../modules/auth/auditoria.js";

export const prerender = false;

// GET /api/auth/sesion-actual — fuente de verdad para la barra superior de
// la app (AU13.1, "Atendiendo: Juan" + "Cambiar de usuario"). Sin sesión
// responde logueado:false para mostrar el botón de ingreso.
export const GET: APIRoute = async ({ request }) => {
  const ctx = resolverSesion(request);
  if (!ctx) return Response.json({ logueado: false }, { status: 200 });
  const u = control.users.get(ctx.googleSub);
  const nombre = u?.nombre?.trim() || (u?.email ? enmascararEmail(u.email) : "Miembro");
  return Response.json(
    {
      logueado: true,
      nombre,
      etiqueta: etiquetaAtendiendo(nombre),
      cambiar_usuario_url: "/api/auth/login?prompt=select_account",
      ayuda: TEXTO_AYUDA_CUENTAS,
    },
    { status: 200 },
  );
};
