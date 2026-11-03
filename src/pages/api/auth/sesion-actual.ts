import type { APIRoute } from "astro";
import { control } from "../../../lib/store.js";
import { resolverSesion } from "../../../lib/control.js";
import { enmascararEmail, etiquetaAtendiendo, TEXTO_AYUDA_CUENTAS } from "../../../modules/auth/auditoria.js";
import { esAdminAllowlist, leerAllowlist } from "../../../modules/admin/guard.js";

export const prerender = false;

// GET /api/auth/sesion-actual — fuente de verdad para la barra superior de
// la app (AU13.1, "Atendiendo: Juan" + "Cambiar de usuario"). Sin sesión
// responde logueado:false para mostrar el botón de ingreso.
export const GET: APIRoute = async ({ request }) => {
  const ctx = resolverSesion(request);
  if (!ctx) return Response.json({ logueado: false }, { status: 200 });
  const u = control.users.get(ctx.googleSub);
  const nombre = u?.nombre?.trim() || (u?.email ? enmascararEmail(u.email) : "Miembro");
  // P1-25: es_admin + google_sub propios para el panel admin (allowlist en
  // Vercel) y para copiar el sub a ADMIN_ALLOWLIST_SUBS sin adivinar.
  const esAdmin = esAdminAllowlist(ctx.googleSub, leerAllowlist());
  // P1-35: el cliente (y el panel) necesitan saber qué comercio está activo.
  const tenantId = ctx.tenantId;
  const nombreComercio = tenantId
    ? (control.tenants.get(tenantId)?.nombreComercio ?? null)
    : null;
  return Response.json(
    {
      logueado: true,
      nombre,
      etiqueta: etiquetaAtendiendo(nombre),
      cambiar_usuario_url: "/api/auth/login?prompt=select_account",
      ayuda: TEXTO_AYUDA_CUENTAS,
      es_admin: esAdmin,
      google_sub: ctx.googleSub,
      tenant_id: tenantId,
      nombre_comercio: nombreComercio,
    },
    { status: 200 },
  );
};
