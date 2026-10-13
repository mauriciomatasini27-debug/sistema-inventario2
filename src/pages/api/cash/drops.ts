import type { APIRoute } from "astro";
import { dropSchema } from "../../../lib/validation.js";
import { BaseNoDisponible } from "../../../lib/server-db.js";
import { registrarRetiro } from "../../../lib/repos/caja.js";

export const prerender = false;

// POST /api/cash/drops — retiro parcial a caja fuerte + conteo sorpresa (C17).
// PERS2-S13: el repo caja persiste en cash_drawer_drops del tenant con DB viva.
export const POST: APIRoute = async ({ request }) => {
  const key = request.headers.get("Idempotency-Key") ?? "";
  if (!key) return Response.json({ error: "falta Idempotency-Key" }, { status: 422 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "json invalido" }, { status: 422 });
  }
  const parsed = dropSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 422 });
  const b = parsed.data;
  let r: Awaited<ReturnType<typeof registrarRetiro>>;
  try {
    r = await registrarRetiro({
      key,
      fechaJornada: b.fecha_jornada,
      montoCentavos: BigInt(b.monto_centavos),
      ...(b.motivo !== undefined ? { motivo: b.motivo } : {}),
      creadoPor: b.creado_por,
      sorpresa: b.sorpresa,
    });
  } catch (e) {
    if (e instanceof BaseNoDisponible) return Response.json({ error: "base_no_disponible" }, { status: 503 });
    throw e;
  }
  if (r.status !== 201) return Response.json({ error: r.error }, { status: r.status });
  return Response.json({ drop_id: r.drop.id, sorpresa: r.drop.sorpresa }, { status: 201 });
};
