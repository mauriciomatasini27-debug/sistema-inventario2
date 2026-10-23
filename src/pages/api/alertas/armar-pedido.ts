import type { APIRoute } from "astro";
import { z } from "zod";
import { resolverSesion, membershipActiva } from "../../../lib/control.js";
import { BaseNoDisponible } from "../../../lib/server-db.js";
import { armarPedidoDeAlerta } from "../../../lib/repos/armar-pedido.js";

export const prerender = false;

const bodySchema = z
  .object({
    sku: z.string().min(1).max(64),
    fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  })
  .strict();

function statusDe(codigo: string): number {
  if (codigo === "ALERTA_INEXISTENTE") return 404;
  if (codigo === "YA_CERRADA") return 409;
  return 422;
}

export const POST: APIRoute = async ({ request }) => {
  const ctx = resolverSesion(request);
  if (!ctx?.tenantId) {
    return Response.json({ ok: false, error: "Iniciá sesión para armar pedidos." }, { status: 401 });
  }
  const m = membershipActiva(ctx.tenantId, ctx.googleSub);
  if (!m || m.rol !== "dueno") {
    return Response.json({ ok: false, error: "Solo el dueño puede armar pedidos desde alertas." }, { status: 403 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "JSON inválido." }, { status: 422 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ ok: false, error: "Pedí con sku y fecha solamente." }, { status: 422 });
  }
  let r: Awaited<ReturnType<typeof armarPedidoDeAlerta>>;
  try {
    r = await armarPedidoDeAlerta({
      tenantId: ctx.tenantId,
      creadoPor: ctx.googleSub,
      sku: parsed.data.sku,
      fecha: parsed.data.fecha,
      ahoraIso: new Date().toISOString(),
    });
  } catch (e) {
    if (e instanceof BaseNoDisponible) {
      return Response.json({ ok: false, error: "Base no disponible." }, { status: 503 });
    }
    throw e;
  }
  if (!r.ok) {
    return Response.json({ ok: false, error: r.error }, { status: statusDe(r.codigo) });
  }
  return Response.json(
    {
      ok: true,
      reusado: r.reusado,
      destino: r.destino,
      order_id: r.orderId,
      ver_en: r.verEn,
      texto: r.texto,
    },
    { status: r.reusado ? 200 : 201 },
  );
};
