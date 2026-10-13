import type { APIRoute } from "astro";
import { conciliateShiftSchema } from "../../../../lib/validation.js";
import { BaseNoDisponible } from "../../../../lib/server-db.js";
import { conciliarCaja } from "../../../../lib/repos/caja.js";

export const prerender = false;

// POST /api/cash/shifts/conciliate — conteo a ciegas (C17).
// El que cuenta no ve el esperado; si |contado-esperado| > $500 abre disputa.
// PERS2-S13: el repo caja concilia en shift_handovers del tenant con DB viva.
export const POST: APIRoute = async ({ request }) => {
  const key = request.headers.get("Idempotency-Key") ?? "";
  if (!key) return Response.json({ error: "falta Idempotency-Key" }, { status: 422 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "json invalido" }, { status: 422 });
  }
  const parsed = conciliateShiftSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 422 });
  const b = parsed.data;
  let r: Awaited<ReturnType<typeof conciliarCaja>>;
  try {
    r = await conciliarCaja({
      key,
      turnoId: b.turno_id,
      contadoCentavos: BigInt(b.contado_centavos),
      conteosPorMedio: b.conteos_por_medio.map((c) => ({ medio: c.medio, montoCentavos: BigInt(c.monto_centavos) })),
    });
  } catch (e) {
    if (e instanceof BaseNoDisponible) return Response.json({ error: "base_no_disponible" }, { status: 503 });
    throw e;
  }
  if (r.status === 404) return Response.json({ error: r.error }, { status: 404 });
  if (r.status === 409) {
    const orig = r.original
      ? { turno_id: r.original.turno.id, estado: r.original.turno.estado }
      : undefined;
    return Response.json({ error: r.error, original: orig }, { status: 409 });
  }
  if (r.status === 422) return Response.json({ error: r.error }, { status: 422 });
  return Response.json(
    {
      turno_id: r.turno.id,
      estado: r.turno.estado,
      contado_centavos: r.turno.contadoCentavos?.toString() ?? null,
      diferencia_centavos: r.turno.diferenciaCentavos?.toString() ?? null,
    },
    { status: 201 },
  );
};
