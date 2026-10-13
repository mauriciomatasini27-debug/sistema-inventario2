import { control } from "./store.js";
import { jsonError, membershipActiva, resolverSesion } from "./control.js";
import { esModoMulti, tenantPorDefecto } from "./tenant-mode.js";

export { esModoMulti, tenantPorDefecto };

export type TenantResuelto = { ok: true; tenantId: string } | { ok: false; respuesta: Response };

// Por qué registro central: el middleware corta 403 antes de tocar memoria o
// base; toda ruta con acceso a base debe caer bajo un prefijo (PRD-ISO-02).
export const PREFIJOS_DATOS = [
  "/api/sales",
  "/api/cash",
  "/api/credit",
  "/api/purchase-orders",
  "/api/supplier-invoices",
  "/api/suppliers",
  "/api/prices",
  "/api/sync",
  "/api/tickets",
  "/api/products",
  "/api/lots",
  "/api/locations",
  "/api/returns",
  "/api/fiscal",
  "/api/whatsapp/consult",
  "/api/email/close-summary",
];

export function esRutaDatos(path: string): boolean {
  return PREFIJOS_DATOS.some((p) => path === p || path.startsWith(`${p}/`));
}

// Por qué null fuera de datos: el middleware conserva su comportamiento para
// el resto de rutas; en single resuelve como hoy (tenant por defecto).
export function gateTenantDatos(request: Request, path: string): TenantResuelto | null {
  if (!esRutaDatos(path)) return null;
  return tenantDeRequest(request);
}

// Por qué el job no usa sesión: actúa como Sistema con secreto compartido;
// en multi exige comercio explícito activo o suspendido (PERS2-S3).
export function gateJob(request: Request): TenantResuelto | null {
  const secreto = process.env.JOBS_SECRET;
  if (!secreto || request.headers.get("X-Job-Secret") !== secreto) return null;
  if (!esModoMulti()) return { ok: true, tenantId: tenantPorDefecto() };
  const pedido = request.headers.get("X-Tenant-Id");
  if (!pedido) return { ok: false, respuesta: jsonError("No tenés permiso para ver este comercio.", 403) };
  const tenant = control.tenants.get(pedido);
  if (!tenant || (tenant.estado !== "activo" && tenant.estado !== "suspendido")) {
    return { ok: false, respuesta: jsonError("No tenés permiso para ver este comercio.", 403) };
  }
  return { ok: true, tenantId: pedido };
}

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
