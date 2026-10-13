import type { APIRoute } from "astro";
import { z } from "zod";
import { store } from "../../lib/store.js";
import { intentarPersistir } from "../../lib/server-db.js";
import { locations } from "../../db/schema.js";

export const prerender = false;

// GET /api/locations — CAT-S5 lista (sin mover stock).
export const GET: APIRoute = async () => {
  return Response.json({ ubicaciones: [...store.ubicaciones.values()] });
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
  const nombre = parsed.data.nombre.trim();
  for (const u of store.ubicaciones.values()) {
    if (u.nombre.toLowerCase() === nombre.toLowerCase() && !u.archivada) {
      return Response.json({ error: "ubicacion duplicada" }, { status: 409 });
    }
  }
  const u = { id: crypto.randomUUID(), nombre, archivada: false };
  store.ubicaciones.set(u.id, u);
  void intentarPersistir((db) => db.insert(locations).values({ nombre }).onConflictDoNothing());
  return Response.json(u, { status: 201 });
};
