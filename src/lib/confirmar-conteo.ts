import { z } from "zod";
import { BaseNoDisponible } from "./server-db.js";
import { confirmarConteo } from "./repos/stock.js";

const confirmarSchema = z.object({
  rol: z.enum(["empleado", "dueno"]),
  confirmado_por: z.string().min(1).max(128),
  motivo: z.string().max(280).optional(),
});

// Via unica CAT-S6 para PATCH /api/counts?id= y POST /api/counts/:id/confirmar.
// Empleado => listo_revisar (sin mover stock); dueño => confirmado + AJUSTE_CONTEO
// con motivo obligatorio. Mapea a 200 / 404 / 422 / 503.
export async function manejarConfirmarConteo(request: Request, id: string): Promise<Response> {
  if (!id) return Response.json({ error: "falta id" }, { status: 422 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "json invalido" }, { status: 422 });
  }
  const parsed = confirmarSchema.safeParse(body);
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
}
