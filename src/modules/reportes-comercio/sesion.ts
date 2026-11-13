import { jsonError, membershipActiva, resolverSesion, type ContextoAuth } from "../../lib/control.js";
import { control } from "../../lib/store.js";

export function tenantActivoDesdeSesion(ctx: ContextoAuth): string | null {
  if (ctx.tenantId && control.tenants.has(ctx.tenantId)) return ctx.tenantId;
  const activas = [...control.memberships.values()].filter(
    (m) => m.googleSub === ctx.googleSub && m.estado === "activo" && control.tenants.has(m.tenantId),
  );
  return activas.length === 1 ? activas[0]!.tenantId : null;
}

export function exigirMiembroComercio(request: Request):
  | { ok: true; ctx: ContextoAuth; tenantId: string }
  | { ok: false; respuesta: Response } {
  const ctx = resolverSesion(request);
  if (!ctx) return { ok: false, respuesta: jsonError("Iniciá sesión con Google para continuar.", 403) };
  const tenantId = tenantActivoDesdeSesion(ctx);
  if (!tenantId) return { ok: false, respuesta: jsonError("No tenés permiso en este comercio.", 403) };
  if (!membershipActiva(tenantId, ctx.googleSub)) {
    return { ok: false, respuesta: jsonError("No tenés permiso en este comercio.", 403) };
  }
  return { ok: true, ctx, tenantId };
}
