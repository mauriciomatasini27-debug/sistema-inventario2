import { control } from "./store.js";
import { jsonError, membershipActiva, resolverSesion } from "./control.js";
import { esModoMulti, tenantPorDefecto } from "./tenant-mode.js";

export { esModoMulti, tenantPorDefecto };

export type TenantResuelto = { ok: true; tenantId: string } | { ok: false; respuesta: Response };

// Por qué el servidor resuelve el tenant: el cliente solo elige entre sus
// memberships con X-Tenant-Id (ADR-0050). En single no hay sesión y vale hoy.
export function tenantDeRequest(request: Request): TenantResuelto {
  if (!esModoMulti()) return { ok: true, tenantId: tenantPorDefecto() };
  const ctx = resolverSesion(request);
  const pedido = request.headers.get("X-Tenant-Id") ?? ctx?.sesion.tenantId ?? null;
  // Por qué E5 en ambos casos: no revelar si el tenant existe.
  if (!ctx || !pedido) return { ok: false, respuesta: jsonError("No tenés permiso para ver este comercio.", 403) };
  const tenant = control.tenants.get(pedido);
  if (!tenant || !membershipActiva(pedido, ctx.googleSub)) {
    control.events.push({ tenantId: pedido, tipo: "acceso_denegado", actor: ctx.googleSub });
    return { ok: false, respuesta: jsonError("No tenés permiso para ver este comercio.", 403) };
  }
  return { ok: true, tenantId: pedido };
}
