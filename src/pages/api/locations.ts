import type { APIRoute } from "astro";
import { z } from "zod";
import { BaseNoDisponible } from "../../lib/server-db.js";
import { altaUbicacion, listarUbicaciones } from "../../lib/repos/catalogo.js";
import { ubicacionesSembradasPorRubro } from "../../lib/eventos-control.js";

export const prerender = false;

// GET /api/locations — CAT-S5 lista (sin mover stock).
// PERS2-S23: lee por el repo de catálogo. En multi sin base el repo propaga
// BaseNoDisponible (503).
export const GET: APIRoute = async () => {
  try {
    return Response.json({
      ubicaciones: await listarUbicaciones(),
      sembradas_por_rubro: ubicacionesSembradasPorRubro(),
    });
  } catch (e) {
    if (e instanceof BaseNoDisponible) return Response.json({ error: "base_no_disponible" }, { status: 503 });
    throw e;
  }
};

// POST /api/locations — CAT-S5 alta. 409 nombre duplicado.
export const POST: APIRoute = async ({ request }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "json invalido" }, { status: 422 });
  }
  const parsed = z.object({ nombre: z.string().min(1).max(80) }).safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 422 });
  let r: Awaited<ReturnType<typeof altaUbicacion>>;
  try {
    r = await altaUbicacion(parsed.data.nombre);
  } catch (e) {
    if (e instanceof BaseNoDisponible) return Response.json({ error: "base_no_disponible" }, { status: 503 });
    throw e;
  }
  if (!r.ok) return Response.json({ error: "ubicacion duplicada" }, { status: 409 });
  return Response.json(r.ubicacion, { status: 201 });
};
