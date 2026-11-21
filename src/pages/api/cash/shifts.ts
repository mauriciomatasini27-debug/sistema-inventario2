import type { APIRoute } from "astro";
import { postShiftSchema } from "../../../lib/validation.js";
import { BaseNoDisponible } from "../../../lib/server-db.js";
import { abrirTurno } from "../../../lib/repos/caja.js";

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
  const parsed = postShiftSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 422 });
  const b = parsed.data;
  let r: Awaited<ReturnType<typeof abrirTurno>>;
  try {
    r = await abrirTurno({
      key,
      fechaJornada: b.fecha_jornada,
      turno: b.turno,
      entregadoPor: b.entregado_por,
      esperadoCentavos: BigInt(b.esperado_centavos),
    });
  } catch (e) {
    if (e instanceof BaseNoDisponible) return Response.json({ error: "base_no_disponible" }, { status: 503 });
    throw e;
  }
  if (r.status !== 201) return Response.json({ error: r.error, original: r.original }, { status: 409 });
  const turno = r.turno;
  return Response.json(
    {
      turno_id: turno.id,
      fecha_jornada: turno.fechaJornada,
      turno: turno.turno,
      entregado_por: turno.entregadoPor,
      estado: turno.estado,
      idempotency_key: key,
    },
    { status: 201 },
  );
};
