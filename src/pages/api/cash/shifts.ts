import type { APIRoute } from "astro";
import { postShiftSchema } from "../../../lib/validation.js";
import { store } from "../../../lib/store.js";
import type { Turno } from "../../../modules/cash/turnos.js";

export const prerender = false;

// POST /api/cash/shifts — apertura de turno pendiente (C17).
// Borde fino: valida, exige Idempotency-Key (409 con original), crea Turno
// pendiente sin exponer esperado al que cuenta (conteo a ciegas en conciliar).
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

  const previoId = store.shiftKeys.get(key);
  if (previoId) {
    const previo = store.turnos.get(previoId);
    if (previo) return Response.json({ error: "idempotency-key repetida", original: { turno_id: previo.id } }, { status: 409 });
  }
  const turnoId = crypto.randomUUID();
  const turno: Turno = {
    id: turnoId,
    fechaJornada: b.fecha_jornada,
    turno: b.turno,
    entregadoPor: b.entregado_por,
    esperadoCentavos: BigInt(b.esperado_centavos),
    estado: "pendiente",
  };
  store.turnos.set(turnoId, turno);
  store.shiftKeys.set(key, turnoId);
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
