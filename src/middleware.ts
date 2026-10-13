import { defineMiddleware } from "astro:middleware";
import { control } from "./lib/store.js";
import { membershipActiva, resolverSesion } from "./lib/control.js";
import { gateTenantDatos } from "./lib/tenant-context.js";
import { conTenant } from "./lib/tenant-mode.js";

// Valida sesión + membership activa por request contra control (AU7.3).
// Solo cubre rutas Auth/tenants/invitations: las de Slice-0 (sales, cash, sync)
// siguen sin auth para no cambiar su comportamiento. Sin caché de autorización.
export const onRequest = defineMiddleware(async ({ request, url }, next) => {
  const path = url.pathname;

  // Por qué los jobs van por header y no por sesión: actúan como "Sistema" con
  // permisos mínimos, sin heredar los de ningún usuario (AU4.8).
  const jobSecret = process.env.JOBS_SECRET;
  if (jobSecret && request.headers.get("X-Job-Secret") === jobSecret) {
    return next();
  }

  // Por qué el gate corre por request: fija el tenant una vez para todo el
  // plano de datos y corta 403 antes de tocar memoria o base (ADR-0051).
  const gate = gateTenantDatos(request, path);
  if (gate) {
    if (!gate.ok) return gate.respuesta;
    return conTenant(gate.tenantId, () => next());
  }

  const protegida =
    path.startsWith("/api/tenants") ||
    path.startsWith("/api/invitations") ||
    path.startsWith("/api/admin") ||
    path.startsWith("/api/devices") ||
    path.startsWith("/api/auth/sesiones");
  if (!protegida) return next();

  const ctx = resolverSesion(request);
  if (!ctx) {
    return Response.json({ error: "Iniciá sesión con Google para continuar." }, { status: 403 });
  }

  const m = url.pathname.match(/^\/api\/tenants\/([^/]+)(?:\/|$)/);
  if (m?.[1]) {
    const tenantId = decodeURIComponent(m[1]);
    const tenant = control.tenants.get(tenantId);
    // E5: no revelar si el tenant existe.
    if (!tenant || !membershipActiva(tenantId, ctx.googleSub)) {
      control.events.push({ tenantId, tipo: "acceso_denegado", actor: ctx.googleSub });
      return Response.json({ error: "No tenés permiso para ver este comercio." }, { status: 403 });
    }
    // Suspendido por mora: bloquea escritura salvo regularizar (AU4.7).
    if (
      tenant.estado === "suspendido" &&
      request.method !== "GET" &&
      !path.includes("regularizar")
    ) {
      return Response.json(
        { error: "El comercio está suspendido. Regularizá la suscripción para seguir operando." },
        { status: 403 },
      );
    }
    if (tenant.estado !== "activo" && tenant.estado !== "suspendido") {
      return Response.json(
        { error: "Estamos preparando tu comercio, te avisamos en cuanto esté listo." },
        { status: 403 },
      );
    }
  }

  return next();
});
