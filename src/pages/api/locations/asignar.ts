import type { APIRoute } from "astro";
import { z } from "zod";
import { BaseNoDisponible } from "../../../lib/server-db.js";
import { asignarUbicacionMasiva } from "../../../lib/repos/catalogo.js";

export const prerender = false;

// POST /api/locations/asignar — CAT-S5 masiva auditada sin mover stock.
// Sub-recurso dedicado (no PATCH sobre /api/locations) para no mezclar el
// 409 de alta con la asignación. Body { location_id, skus }. Responde
// { asignados, no_encontrados }. Ubicación desconocida: 404.
export const POST: APIRoute = async ({ request }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "json invalido" }, { status: 422 });
  }
  const parsed = z
    .object({ location_id: z.string().uuid(), skus: z.array(z.string().min(1).max(64)).max(500) })
    .safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 422 });
  let r: Awaited<ReturnType<typeof asignarUbicacionMasiva>>;
  try {
    r = await asignarUbicacionMasiva({ locationId: parsed.data.location_id, skus: parsed.data.skus });
  } catch (e) {
    if (e instanceof BaseNoDisponible) return Response.json({ error: "base_no_disponible" }, { status: 503 });
    throw e;
  }
  if (!r.ok) return Response.json({ error: "ubicacion desconocida" }, { status: 404 });
  return Response.json({ asignados: r.asignados, no_encontrados: r.no_encontrados });
};
