import type { APIRoute } from "astro";
import { z } from "zod";
import { BaseNoDisponible } from "../../lib/server-db.js";
import { altaUbicacion, listarUbicaciones, renombrarUbicacion } from "../../lib/repos/catalogo.js";
import { leerSembradasPorRubro } from "../../lib/repos/siembra-ubicaciones.js";

export const prerender = false;

// GET /api/locations — CAT-S5 lista (sin mover stock).
// PERS2-S23: lee por el repo de catálogo. En multi sin base el repo propaga
// BaseNoDisponible (503).
export const GET: APIRoute = async () => {
  try {
    return Response.json({
      ubicaciones: await listarUbicaciones(),
      sembradas_por_rubro: await leerSembradasPorRubro(),
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

// PATCH /api/locations — ON4.5 renombrar. 409 nombre duplicado (sin contar
// la propia), 404 si el id es desconocido.
export const PATCH: APIRoute = async ({ request }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "json invalido" }, { status: 422 });
  }
  const parsed = z.object({ id: z.string().uuid(), nombre: z.string().trim().min(1).max(80) }).safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 422 });
  let r: Awaited<ReturnType<typeof renombrarUbicacion>>;
  try {
    r = await renombrarUbicacion(parsed.data.id, parsed.data.nombre);
  } catch (e) {
    if (e instanceof BaseNoDisponible) return Response.json({ error: "base_no_disponible" }, { status: 503 });
    throw e;
  }
  if (!r.ok) {
    if (r.codigo === "DESCONOCIDA") return Response.json({ error: "ubicacion desconocida" }, { status: 404 });
    return Response.json({ error: "ubicacion duplicada" }, { status: 409 });
  }
  return Response.json(r.ubicacion);
};
