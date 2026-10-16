import type { APIRoute } from "astro";
import { z } from "zod";
import { control } from "../../lib/store.js";
import { jsonError, membershipActiva, resolverSesion, type ContextoAuth } from "../../lib/control.js";
import { MODULOS_BOT, rubrosAvanzadosHabilitados } from "../../modules/bot/modulos-rubro.js";
import { cambiarModuloBot, leerModulosBot } from "../../lib/repos/bot-modulos.js";

export const prerender = false;

// BOT-S1 (ADR-0039): GET lista los módulos del bot del tenant; PATCH prende o
// apaga uno. El tenant y el rol salen de la sesión + membership activa, nunca
// del body: solo el Dueño puede tocar el interruptor.

function tenantDeSesion(ctx: ContextoAuth): string | null {
  if (ctx.tenantId && control.tenants.has(ctx.tenantId)) return ctx.tenantId;
  const activas = [...control.memberships.values()].filter(
    (m) => m.googleSub === ctx.googleSub && m.estado === "activo" && control.tenants.has(m.tenantId),
  );
  return activas.length === 1 ? activas[0]!.tenantId : null;
}

export const GET: APIRoute = async ({ request }) => {
  const ctx = resolverSesion(request);
  if (!ctx) return jsonError("Iniciá sesión con Google para continuar.", 403);
  const tenantId = tenantDeSesion(ctx);
  if (!tenantId) return jsonError("No tenés permiso en este comercio.", 403);
  const m = membershipActiva(tenantId, ctx.googleSub);
  if (!m) return jsonError("No tenés permiso en este comercio.", 403);
  return Response.json({
    tenant_id: tenantId,
    modulos: MODULOS_BOT,
    activos: await leerModulosBot(tenantId),
    puede_editar: m.rol === "dueno",
    rubros_avanzados: rubrosAvanzadosHabilitados(),
  });
};

const patchSchema = z.object({
  modulo: z.enum(MODULOS_BOT),
  activo: z.boolean(),
});

export const PATCH: APIRoute = async ({ request }) => {
  const ctx = resolverSesion(request);
  if (!ctx) return jsonError("Iniciá sesión con Google para continuar.", 403);
  const tenantId = tenantDeSesion(ctx);
  if (!tenantId) return jsonError("No tenés permiso en este comercio.", 403);
  const m = membershipActiva(tenantId, ctx.googleSub);
  if (!m || m.rol !== "dueno") return jsonError("Solo el Dueño puede cambiar los módulos del bot.", 403);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("El cuerpo no es JSON válido.", 422);
  }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? "Datos inválidos.", 422);
  const activos = await cambiarModuloBot(tenantId, parsed.data.modulo, parsed.data.activo);
  control.events.push({
    tenantId,
    tipo: parsed.data.activo ? "bot_modulo_activado" : "bot_modulo_desactivado",
    actor: ctx.googleSub,
    detalle: { modulo: parsed.data.modulo },
    creadoEn: new Date().toISOString(),
  });
  return Response.json({ tenant_id: tenantId, activos }, { status: 200 });
};
