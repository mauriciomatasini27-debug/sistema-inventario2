import type { APIRoute } from "astro";
import { z } from "zod";
import { membershipSchema } from "../../../../lib/validation.js";
import { control } from "../../../../lib/store.js";
import { esDueno, exigirReauthReciente, jsonError, membershipActiva, resolverSesion } from "../../../../lib/control.js";
import { actualizarBotFlagDb } from "../../../../lib/control-db.js";

export const prerender = false;

// POST /api/tenants/:tenant_id/memberships — el Dueño da de alta una
// membership (ADR-0001). E5: ante tenant ajeno o inexistente se responde 403
// genérico sin revelar si el tenant existe.
export const POST: APIRoute = async ({ request, params }) => {
  const ctx = resolverSesion(request);
  if (!ctx) return jsonError("Iniciá sesión con Google para continuar.", 403);
  const tenantId = params.id ?? "";
  const tenant = control.tenants.get(tenantId);
  // Por qué el mismo 403 para inexistente y ajeno: no revelar existencia (E5).
  if (!tenant || !esDueno(tenantId, ctx.googleSub)) {
    return jsonError("No tenés permiso para invitar usuarios en este comercio.", 403);
  }
  if (tenant.estado === "suspendido") {
    return jsonError("El comercio está suspendido. Regularizá la suscripción para invitar.", 403);
  }
  // AU10.1: invitar/cambiar permisos exige reauth reciente del Dueño.
  const reauth = exigirReauthReciente(ctx);
  if (reauth) return reauth;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("El cuerpo no es JSON válido.", 422);
  }
  const parsed = membershipSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? "Datos de membership inválidos.", 422);
  }
  const b = parsed.data;

  if (b.invitation_token_hash) {
    const inv = control.invitations.get(b.invitation_token_hash);
    if (!inv || inv.tenantId !== tenantId || inv.estado !== "pendiente") {
      return jsonError("El token de invitación está vencido o es inválido.", 422);
    }
  }

  const previa = membershipActiva(tenantId, b.google_sub);
  if (previa) {
    return Response.json(
      { error: "Ese usuario ya es miembro activo del comercio.", membership_id: previa.id },
      { status: 409 },
    );
  }

  const id = crypto.randomUUID();
  control.memberships.set(id, {
    id,
    tenantId,
    googleSub: b.google_sub,
    rol: b.rol,
    permisos: b.permisos,
    estado: "activo",
    // AU11.3: el bot arranca habilitado; el Dueño lo cambia con PATCH.
    puedeUsarBot: true,
  });
  control.events.push({
    tenantId,
    tipo: "membership_otorgada",
    actor: ctx.googleSub,
    detalle: { google_sub: b.google_sub, rol: b.rol },
    creadoEn: new Date().toISOString(),
  });
  // Evento hacia el panel (solo contadores, nunca negocio).
  control.opsOutbox.push({
    tipo: "membership_otorgada",
    payload: {
      tenant_id: tenantId,
      membership_id: id,
      google_sub: b.google_sub,
      rol: b.rol,
      otorgado_por: ctx.googleSub,
      occurred_at: new Date().toISOString(),
    },
  });
  return Response.json({ membership_id: id, tenant_id: tenantId, rol: b.rol }, { status: 201 });
};

const patchSchema = z.object({
  google_sub: z.string().min(1).max(128),
  puede_usar_bot: z.boolean(),
});

// PATCH /api/tenants/:tenant_id/memberships — el Dueño prende/apaga el
// interruptor "Puede usar el bot" de un miembro (AU11.3, con reauth AU10.1).
export const PATCH: APIRoute = async ({ request, params }) => {
  const ctx = resolverSesion(request);
  if (!ctx) return jsonError("Iniciá sesión con Google para continuar.", 403);
  const tenantId = params.id ?? "";
  const tenant = control.tenants.get(tenantId);
  if (!tenant || !esDueno(tenantId, ctx.googleSub)) {
    return jsonError("No tenés permiso en este comercio.", 403);
  }
  const reauth = exigirReauthReciente(ctx);
  if (reauth) return reauth;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("El cuerpo no es JSON válido.", 422);
  }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? "Datos inválidos.", 422);
  }
  const m = membershipActiva(tenantId, parsed.data.google_sub);
  if (!m) return jsonError("Ese usuario no es miembro activo del comercio.", 404);
  m.puedeUsarBot = parsed.data.puede_usar_bot;
  void actualizarBotFlagDb(m.id, parsed.data.puede_usar_bot);
  control.events.push({
    tenantId,
    tipo: parsed.data.puede_usar_bot ? "bot_habilitado" : "bot_deshabilitado",
    actor: ctx.googleSub,
    detalle: { google_sub: parsed.data.google_sub },
    creadoEn: new Date().toISOString(),
  });
  return Response.json({ membership_id: m.id, puede_usar_bot: m.puedeUsarBot }, { status: 200 });
};
