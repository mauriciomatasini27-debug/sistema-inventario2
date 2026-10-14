import type { APIRoute } from "astro";
import { z } from "zod";
import { BaseNoDisponible } from "../../lib/server-db.js";
import { confirmarConteo, crearConteo } from "../../lib/repos/stock.js";

export const prerender = false;

const lineaSchema = z.object({ sku: z.string().min(1).max(64), fisico: z.number().int().min(0).max(9999) });

// POST /api/counts — CAT-S6 crea conteo en_curso con líneas offline.
// PERS2-S23: el conteo va por el repo de stock. En multi sin base el repo
// propaga BaseNoDisponible (503).
export const POST: APIRoute = async ({ request }) => {
  const key = request.headers.get("Idempotency-Key") ?? crypto.randomUUID();
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "json invalido" }, { status: 422 });
  }
  const parsed = z.object({ contado_por: z.string().min(1).max(128), lineas: z.array(lineaSchema).min(1).max(500) }).safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 422 });
  let r: Awaited<ReturnType<typeof crearConteo>>;
  try {
    r = await crearConteo({ key, contadoPor: parsed.data.contado_por, lineas: parsed.data.lineas });
  } catch (e) {
    if (e instanceof BaseNoDisponible) return Response.json({ error: "base_no_disponible" }, { status: 503 });
    throw e;
  }
  if (!r.ok) {
    return Response.json({ error: "duplicado", original: r.original }, { status: 409 });
  }
  return Response.json({ id: r.id, estado: "en_curso", diferencias: r.diferencias }, { status: 201 });
};

// PATCH /api/counts?id= — confirmar: empleado => listo revisar, dueño => confirmado + ajuste_conteo.
export const PATCH: APIRoute = async ({ request, url }) => {
  const id = url.searchParams.get("id") ?? "";
  if (!id) return Response.json({ error: "falta id" }, { status: 422 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "json invalido" }, { status: 422 });
  }
  const parsed = z.object({ rol: z.enum(["empleado", "dueno"]), confirmado_por: z.string().min(1).max(128), motivo: z.string().max(280).optional() }).safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 422 });
  let r: Awaited<ReturnType<typeof confirmarConteo>>;
  try {
    r = await confirmarConteo({
      id,
      rol: parsed.data.rol,
      confirmadoPor: parsed.data.confirmado_por,
      ...(parsed.data.motivo !== undefined ? { motivo: parsed.data.motivo } : {}),
    });
  } catch (e) {
    if (e instanceof BaseNoDisponible) return Response.json({ error: "base_no_disponible" }, { status: 503 });
    throw e;
  }
  if (!r.ok) {
    if (r.codigo === "DESCONOCIDO") return Response.json({ error: "desconocido" }, { status: 404 });
    return Response.json({ error: "confirmar exige motivo" }, { status: 422 });
  }
  if (r.estado === "listo_revisar") return Response.json({ id, estado: "listo_revisar" });
  return Response.json({ id, estado: "confirmado", motivo: parsed.data.motivo });
};
