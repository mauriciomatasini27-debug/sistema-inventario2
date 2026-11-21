import type { APIRoute } from "astro";
import { resolveShiftSchema } from "../../../../lib/validation.js";
import { resolverRolEfectivo } from "../../../../lib/control.js";
import { BaseNoDisponible } from "../../../../lib/server-db.js";
import { resolverCaja } from "../../../../lib/repos/caja.js";

export const prerender = false;

// PERS2-S13: el repo caja resuelve en shift_handovers del tenant con DB viva.
// P9-13: el rol sale de sesión + membership; el body `rol` se ignora.
// Sin sesión vale el default dueño (legado slice-0).
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
  const rolEfectivo = resolverRolEfectivo(request);
  if (rolEfectivo.estado === "sin_permiso") {
    return Response.json({ error: "No tenés permiso en este comercio." }, { status: 403 });
  }
  const rol = rolEfectivo.estado === "sesion" ? rolEfectivo.rol : "dueno";
  let r: Awaited<ReturnType<typeof resolverCaja>>;
  try {
    r = await resolverCaja({ turnoId: b.turno_id, nota: b.nota, rol, resueltoPor: b.resuelto_por });
  } catch (e) {
    if (e instanceof BaseNoDisponible) return Response.json({ error: "base_no_disponible" }, { status: 503 });
    throw e;
  }
  if (r.status !== 200) return Response.json({ error: r.error }, { status: r.status });
  return Response.json({ turno_id: r.turno.id, estado: r.turno.estado }, { status: 200 });
};
