import { control } from "./store.js";
import { esDueno, jsonError, membershipActiva, resolverSesion, type ContextoAuth } from "./control.js";
import { esModoAisladoPorTenant, esModoMulti, esModoShared, tenantPorDefecto } from "./tenant.js";

export { esModoAisladoPorTenant, esModoMulti, esModoShared, tenantPorDefecto };

export type TenantResuelto = { ok: true; tenantId: string } | { ok: false; respuesta: Response };

export type JobResuelto =
  | { ok: true; tenantId: string }
  | { ok: true; tenantIds: string[] }
  | { ok: false; respuesta: Response };

export type DuenoResuelto =
  | { ok: true; ctx: ContextoAuth; tenantId: string }
  | { ok: false; respuesta: Response };

// Rutas "solo Dueño": sesión válida + tenant del servidor + membership dueño activa.
export function exigirDuenoDeRequest(request: Request): DuenoResuelto {
  const ctx = resolverSesion(request);
  if (!ctx) return { ok: false, respuesta: jsonError("Iniciá sesión con Google para continuar.", 403) };
  const t = tenantDeRequest(request);
  if (!t.ok) return { ok: false, respuesta: t.respuesta };
  if (!esDueno(t.tenantId, ctx.googleSub)) {
    return { ok: false, respuesta: jsonError("Solo el dueño del comercio puede hacer esto.", 403) };
  }
  return { ok: true, ctx, tenantId: t.tenantId };
}

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
  "/api/payment-orders",
  "/api/payees",
  "/api/counts",
  "/api/stock",
  "/api/service-accounts",
  "/api/utility-bills",
  "/api/email-drafts",
  "/api/ocr",
  // DASH-S8: resumen read-only de /panel/plan; el middleware fija el tenant
  // para que los repos de planes usen la base del comercio (ADR-0051).
  "/api/plan",
  // DASH-S12: el índice de /panel lee las features del plan del tenant.
  "/api/panel",
  // IA-S4: lee plan y escribe ai_usage en la base del tenant.
  "/api/asistente",
  // P10-19: snapshots y promos escriben en la base del tenant.
  "/api/analytics",
  // ADR-0102: las rutas de integraciones escriben en la base del comercio.
  "/api/integrations",
  // Disparo manual del watch de Gmail: solo Dueño, tenant de la sesión.
  "/api/gmail/watch",
  // DASH-S6: historial de alertas lee notification_events del comercio.
  "/api/alertas",
  // DASH-S2: historial del bot lee bot_turnos del comercio de la sesión.
  "/api/whatsapp/historial",
];

export function esRutaDatos(path: string): boolean {
  return PREFIJOS_DATOS.some((p) => path === p || path.startsWith(`${p}/`));
}

// Por qué null fuera de datos: el middleware conserva su comportamiento para
// el resto de rutas; en single resuelve como hoy (tenant por defecto).
// CP-S7: suspendido queda en solo lectura. Lee igual (conserva datos), pero
// cualquier escritura del plano de datos corta 403 antes de tocar la base.
export function gateTenantDatos(request: Request, path: string): TenantResuelto | null {
  if (!esRutaDatos(path)) return null;
  const t = tenantDeRequest(request);
  if (!t.ok || request.method === "GET" || request.method === "HEAD") return t;
  const tenant = control.tenants.get(t.tenantId);
  if (tenant?.estado === "suspendido") {
    const mensaje = tenant.suspensionTipo === "mora" ? MENSAJE_SUSPENDIDO : MENSAJE_SUSPENDIDO_NEUTRO;
    return { ok: false, respuesta: jsonError(mensaje, 403) };
  }
  return t;
}

// Abuso o tipo desconocido (proceso reiniciado): texto neutro, sin "falta de pago".
export const MENSAJE_SUSPENDIDO_NEUTRO =
  "Tu cuenta está suspendida. Podés ver tus datos, pero no cargar ni modificar nada. Escribinos para más información.";

export const MENSAJE_SUSPENDIDO =
  "Tu cuenta está suspendida por falta de pago. Podés ver tus datos, pero no cargar ni modificar nada hasta regularizar.";

// Por qué el job no usa sesión: actúa como Sistema con secreto compartido;
// en multi con comercio explícito corre solo ese si está activo o suspendido
// (PERS2-S3); sin comercio y bajo /api/jobs/* devuelve todos los elegibles
// para el fan-out (SEC4-S1, enmienda PERS2-S3).
// Single-tenant: un solo comercio, sin sesión ni fan-out. También decide si
// un job puede correr sin X-Job-Secret (CAJA-S3 review M1).
export function esSingle(): boolean {
  // ADR-0116: shared no es single. Si no, tenantDeRequest fija slice0.
  return !esModoAisladoPorTenant();
}

export function gateJob(request: Request): JobResuelto | null {
  const secreto = process.env.JOBS_SECRET;
  if (!secreto || request.headers.get("X-Job-Secret") !== secreto) return null;
  if (esSingle()) return { ok: true, tenantId: tenantPorDefecto() };
  const pedido = request.headers.get("X-Tenant-Id");
  if (!pedido) {
    if (!new URL(request.url).pathname.startsWith("/api/jobs/")) {
      return { ok: false, respuesta: jsonError("No tenés permiso para ver este comercio.", 403) };
    }
    const ids = [...control.tenants.values()]
      .filter((t) => t.estado === "activo" || t.estado === "suspendido")
      .map((t) => t.id)
      .sort();
    return { ok: true, tenantIds: ids };
  }
  const tenant = control.tenants.get(pedido);
  if (!tenant || (tenant.estado !== "activo" && tenant.estado !== "suspendido")) {
    return { ok: false, respuesta: jsonError("No tenés permiso para ver este comercio.", 403) };
  }
  return { ok: true, tenantId: pedido };
}

// Por qué el servidor resuelve el tenant: el cliente solo elige entre sus
// memberships con X-Tenant-Id (ADR-0050). En single no hay sesión y vale hoy.
export function tenantDeRequest(request: Request): TenantResuelto {
  if (esSingle()) return { ok: true, tenantId: tenantPorDefecto() };
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
