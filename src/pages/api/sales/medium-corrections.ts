import type { APIRoute } from "astro";
import { mediumCorrectionSchema } from "../../../lib/validation.js";
import { BaseNoDisponible } from "../../../lib/server-db.js";
import { registrarCorreccion } from "../../../lib/repos/ventas.js";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const key = request.headers.get("Idempotency-Key") ?? "";
  if (!key) return Response.json({ error: "falta Idempotency-Key" }, { status: 422 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "json invalido" }, { status: 422 });
  }
  const parsed = mediumCorrectionSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 422 });
  const b = parsed.data;
  let r: Awaited<ReturnType<typeof registrarCorreccion>>;
  try {
    r = await registrarCorreccion({
      key,
      saleId: b.sale_id,
      medioNuevo: b.medio_nuevo,
      motivo: b.motivo,
      actor: b.actor,
    });
  } catch (e) {
    if (e instanceof BaseNoDisponible) return Response.json({ error: "base_no_disponible" }, { status: 503 });
    throw e;
  }
  if (!r.ok) return Response.json({ error: r.error }, { status: r.status });
  return Response.json({ correccion_id: r.correccion.correccion.id, antes: r.correccion.correccion.medioOriginal, despues: r.correccion.correccion.medioNuevo }, { status: 201 });
};
