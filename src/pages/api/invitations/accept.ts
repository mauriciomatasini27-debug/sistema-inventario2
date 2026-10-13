import type { APIRoute } from "astro";
import { acceptInvitationSchema } from "../../../lib/validation.js";
import { control } from "../../../lib/store.js";
import { contarMiembrosActivos, jsonError, resolverSesion } from "../../../lib/control.js";
import { decidirAceptacion, hashToken } from "../../../modules/tenants/invitaciones.js";
import { PERMISOS_EMPLEADO_DEFAULT } from "../../../modules/auth/modelo.js";
import { crearSesion } from "../../../modules/auth/sesiones.js";

export const prerender = false;

// POST /api/invitations/accept — acepta con la sesión de Google (AU6).
// Email distinto rechaza sin revelar datos del comercio; vencida/cancelada/
// usada devuelven 410; miembro duplicado 409.
export const POST: APIRoute = async ({ request, cookies }) => {
  const ctx = resolverSesion(request);
  if (!ctx) return jsonError("Iniciá sesión con Google para continuar.", 403);
  const user = control.users.get(ctx.googleSub);
  if (!user) return jsonError("Iniciá sesión con Google para continuar.", 403);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("El cuerpo no es JSON válido.", 422);
  }
  const parsed = acceptInvitationSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError("Falta el token de invitación.", 422);
  }

  const inv = control.invitations.get(hashToken(parsed.data.token));
  // Por qué 403 genérico si no existe: no revelar invitaciones ajenas (AU6.5).
  if (!inv) return jsonError("Esta invitación no es válida.", 403);
  const tenant = control.tenants.get(inv.tenantId);
  if (!tenant) return jsonError("Esta invitación no es válida.", 403);

  const yaEs = [...control.memberships.values()].some(
    (m) => m.tenantId === inv.tenantId && m.googleSub === ctx.googleSub && m.estado === "activo",
  );
  const miembros = contarMiembrosActivos(inv.tenantId);
  const d = decidirAceptacion({
    invitacion: {
      tokenHash: inv.tokenHash,
      tenantId: inv.tenantId,
      email: inv.email,
      rol: inv.rol,
      permisos: inv.permisos,
      estado: inv.estado,
      expiraAt: inv.expiraAt,
    },
    emailSesion: user.email,
    emailVerificado: user.emailVerificado,
    ahora: new Date(),
    miembrosActivos: miembros,
    plan: tenant.plan,
    yaEsMiembro: yaEs,
  });
  if (!d.acepta) {
    switch (d.motivo) {
      case "email_distinto":
      case "no_verificado":
        return jsonError(
          "Esta invitación es para otro email. Entrá con esa cuenta o pedile al dueño que te invite con este email.",
          403,
        );
      case "vencida":
      case "cancelada":
      case "usada":
        return jsonError("Esta invitación venció o ya fue usada. Pedile al dueño que te la reenvíe.", 410);
      case "miembro_duplicado":
        return jsonError("Ya sos miembro de este comercio.", 409);
      case "cupo_plan":
        return jsonError("Este comercio llegó al límite de usuarios de su plan.", 403);
      default:
        return jsonError("Esta invitación no es válida.", 403);
    }
  }

  inv.estado = "aceptada";
  inv.aceptadaPor = ctx.googleSub;
  const id = crypto.randomUUID();
  control.memberships.set(id, {
    id,
    tenantId: inv.tenantId,
    googleSub: ctx.googleSub,
    rol: inv.rol,
    permisos: inv.permisos.length > 0 ? inv.permisos : [...PERMISOS_EMPLEADO_DEFAULT],
    estado: "activo",
  });
  control.events.push({ tenantId: inv.tenantId, tipo: "invitacion_aceptada", actor: ctx.googleSub });

  // Rotación al cambiar de rol/tenant (AU8.5): la sesión vieja se revoca.
  const vieja = control.sessions.get(ctx.sesion.idHash);
  if (vieja) {
    vieja.revocadaAt = new Date().toISOString();
    vieja.motivo = "rotacion_rol";
  }
  const nueva = crearSesion({ googleSub: ctx.googleSub, tenantId: inv.tenantId });
  control.sessions.set(nueva.registro.idHash, {
    idHash: nueva.registro.idHash,
    googleSub: ctx.googleSub,
    tenantId: inv.tenantId,
    expiraAt: nueva.registro.expiraAt,
    expiraAbsoluta: nueva.registro.expiraAbsoluta,
    lastSeenAt: new Date().toISOString(),
    // La sesión nace de un login/invitación con Google: reauth fresca.
    reauthAt: new Date().toISOString(),
  });
  cookies.set("__Host-sesion", nueva.idPlano, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 30 * 24 * 3600,
  });
  return Response.json({ membership_id: id, tenant_id: inv.tenantId, rol: inv.rol }, { status: 201 });
};
