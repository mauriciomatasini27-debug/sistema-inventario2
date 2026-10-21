import type { APIRoute } from "astro";
import { z } from "zod";
import { control } from "../../../lib/store.js";
import { jsonError, membershipActiva, resolverSesion, type ContextoAuth } from "../../../lib/control.js";
import { leerSiembraProductos, sembrarProductosRubro } from "../../../lib/repos/siembra-productos.js";
import {
  VERSION_PLANTILLAS_PRODUCTOS_RUBRO,
  plantilla_productos_rubro,
} from "../../../modules/onboarding/plantillas-productos-rubro.js";

export const prerender = false;

function tenantDeSesion(ctx: ContextoAuth): string | null {
  if (ctx.tenantId && control.tenants.has(ctx.tenantId)) return ctx.tenantId;
  const activas = [...control.memberships.values()].filter(
    (m) => m.googleSub === ctx.googleSub && m.estado === "activo" && control.tenants.has(m.tenantId),
  );
  return activas.length === 1 ? activas[0]!.tenantId : null;
}

type DuenoResuelto = { ok: true; tenantId: string } | { ok: false; respuesta: Response };

function exigirDueno(request: Request): DuenoResuelto {
  const ctx = resolverSesion(request);
  if (!ctx) return { ok: false, respuesta: jsonError("Iniciá sesión con Google para continuar.", 403) };
  const tenantId = tenantDeSesion(ctx);
  if (!tenantId) return { ok: false, respuesta: jsonError("No tenés permiso en este comercio.", 403) };
  const m = membershipActiva(tenantId, ctx.googleSub);
  if (!m || m.rol !== "dueno") {
    return { ok: false, respuesta: jsonError("Solo el Dueño puede elegir el catálogo sugerido.", 403) };
  }
  return { ok: true, tenantId };
}

const siembraSchema = z.object({
  nombres: z.array(z.string().trim().min(1).max(120)).max(100),
});

function rubroDelTenant(tenantId: string): string {
  return control.tenants.get(tenantId)?.rubro ?? "otro";
}

export const GET: APIRoute = async ({ request }) => {
  const auth = exigirDueno(request);
  if (!auth.ok) return auth.respuesta;
  const rubro = rubroDelTenant(auth.tenantId);
  return Response.json({
    rubro,
    version: VERSION_PLANTILLAS_PRODUCTOS_RUBRO,
    productos: plantilla_productos_rubro(rubro).productos,
    sembrado: await leerSiembraProductos(auth.tenantId),
  });
};

export const POST: APIRoute = async ({ request }) => {
  const auth = exigirDueno(request);
  if (!auth.ok) return auth.respuesta;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "json invalido" }, { status: 422 });
  }
  const parsed = siembraSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 422 });
  const r = await sembrarProductosRubro(auth.tenantId, rubroDelTenant(auth.tenantId), parsed.data.nombres);
  if (!r.ok) {
    const status = r.codigo === "YA_SEMBRADO" ? 409 : 422;
    return Response.json({ error: r.codigo }, { status });
  }
  return Response.json({ ok: true, cantidad: r.cantidad });
};
