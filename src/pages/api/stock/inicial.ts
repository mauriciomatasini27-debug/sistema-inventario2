import type { APIRoute } from "astro";
import { z } from "zod";
import { control } from "../../../lib/store.js";
import { jsonError, membershipActiva, resolverSesion, type ContextoAuth } from "../../../lib/control.js";
import { BaseNoDisponible } from "../../../lib/server-db.js";
import { cargarStockInicial, listarPendientesStockInicial } from "../../../lib/repos/stock-inicial.js";

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
    return { ok: false, respuesta: jsonError("Solo el Dueño puede cargar el stock inicial.", 403) };
  }
  return { ok: true, tenantId };
}

const cargaSchema = z.object({
  sku: z.string().trim().min(1).max(120),
  cantidad: z.number().int().min(0).max(99999),
});

export const GET: APIRoute = async ({ request }) => {
  const auth = exigirDueno(request);
  if (!auth.ok) return auth.respuesta;
  try {
    return Response.json(await listarPendientesStockInicial({ ahora: new Date() }));
  } catch (e) {
    if (e instanceof BaseNoDisponible) return Response.json({ error: "base_no_disponible" }, { status: 503 });
    throw e;
  }
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
  const parsed = cargaSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 422 });
  try {
    const r = await cargarStockInicial(parsed.data.sku, parsed.data.cantidad);
    if (!r.ok) {
      const status = r.codigo === "NO_PENDIENTE" ? 409 : 422;
      return Response.json({ error: r.codigo }, { status });
    }
    return Response.json({ ok: true });
  } catch (e) {
    if (e instanceof BaseNoDisponible) return Response.json({ error: "base_no_disponible" }, { status: 503 });
    throw e;
  }
};
