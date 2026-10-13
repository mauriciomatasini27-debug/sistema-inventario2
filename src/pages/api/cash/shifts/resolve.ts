import type { APIRoute } from "astro";
import { resolveShiftSchema } from "../../../../lib/validation.js";
import { store } from "../../../../lib/store.js";
import { resolver_disputa } from "../../../../modules/cash/turnos.js";

export const prerender = false;

// POST /api/cash/shifts/resolve — solo Dueño cierra disputas (C17).
export const POST: APIRoute = async ({ request }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "json invalido" }, { status: 422 });
  }
  const parsed = resolveShiftSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 422 });
  const b = parsed.data;
  const r = resolver_disputa({
    turnoId: b.turno_id,
    nota: b.nota,
    rol: b.rol,
    resueltoPor: b.resuelto_por,
    turnos: store.turnos,
  });
  if (r.status !== 200) return Response.json({ error: r.error }, { status: r.status });
  return Response.json({ turno_id: r.turno.id, estado: r.turno.estado }, { status: 200 });
};
