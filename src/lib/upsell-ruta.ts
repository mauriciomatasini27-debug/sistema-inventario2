import { control } from "./store.js";
import { membershipActiva, resolverSesion, type ContextoAuth } from "./control.js";
import { leerCatalogo, leerSuscripcionActiva } from "./repos/planes.js";
import { accesoSuperficie, type AccesoSuperficie, type SuperficieUpsell } from "./panel-upsell.js";
import { conTenant } from "./tenant-mode.js";

function tenantDeSesion(ctx: ContextoAuth): string | null {
  if (ctx.tenantId && control.tenants.has(ctx.tenantId)) return ctx.tenantId;
  const activas = [...control.memberships.values()].filter(
    (m) => m.googleSub === ctx.googleSub && m.estado === "activo" && control.tenants.has(m.tenantId),
  );
  return activas.length === 1 ? activas[0]!.tenantId : null;
}

// PLAN-S9: la página y la ruta leen el mismo acceso. Sin sesión no hay pantalla.
// conTenant hace falta en la página: /panel/* no pasa por el middleware de datos.
export async function accesoUpsellDeRequest(
  request: Request,
  superficie: SuperficieUpsell,
): Promise<AccesoSuperficie | null> {
  const ctx = resolverSesion(request);
  if (!ctx) return null;
  const tenantId = tenantDeSesion(ctx);
  if (!tenantId) return null;
  const m = membershipActiva(tenantId, ctx.googleSub);
  if (!m) return null;
  return conTenant(tenantId, async () => {
    const activa = await leerSuscripcionActiva(tenantId);
    return accesoSuperficie({
      superficie,
      planId: activa?.planId ?? null,
      rol: m.rol,
      catalogo: await leerCatalogo(),
    });
  });
}
