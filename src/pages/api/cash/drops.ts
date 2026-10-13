import type { APIRoute } from "astro";
import { dropSchema } from "../../../lib/validation.js";
import { store } from "../../../lib/store.js";
import { registrar_drop } from "../../../modules/cash/turnos.js";

export const prerender = false;

// POST /api/cash/drops — retiro parcial a caja fuerte + conteo sorpresa (C17).
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
  const r = registrar_drop({
    idempotencyKey: key,
    fechaJornada: b.fecha_jornada,
    montoCentavos: BigInt(b.monto_centavos),
    ...(b.motivo !== undefined ? { motivo: b.motivo } : {}),
    creadoPor: b.creado_por,
    sorpresa: b.sorpresa,
    drops: store.drops,
    vistos: store.dropVistos,
  });
  if (r.status !== 201) return Response.json({ error: r.error }, { status: r.status });
  return Response.json({ drop_id: r.drop.id, sorpresa: r.drop.sorpresa }, { status: 201 });
};
