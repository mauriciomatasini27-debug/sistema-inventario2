import type { APIRoute } from "astro";
import { reversalSchema } from "../../../lib/validation.js";
import { store } from "../../../lib/store.js";
import { exigirOnlineParaSensible } from "../../../lib/offline-gate.js";
import { revertir_movimiento } from "../../../modules/cash/reversion.js";
import type { Movimiento } from "../../../modules/cash/caja.js";

export const prerender = false;

// POST /api/cash/reversals — compensatorio inmutable (C7). Nunca UPDATE.
// SYNC-S7: operación sensible, exige online. Con grant offline / cuarentena => 403.
export const POST: APIRoute = async ({ request }) => {
  const bloqueo = exigirOnlineParaSensible(request, "reversion");
  if (bloqueo) return bloqueo;
  const key = request.headers.get("Idempotency-Key") ?? "";
  if (!key) return Response.json({ error: "falta Idempotency-Key" }, { status: 422 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "json invalido" }, { status: 422 });
  }
  const parsed = reversalSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 422 });
  const b = parsed.data;
  const movs = new Map<string, Movimiento & { id: string }>(
    store.movements.map((m) => [
      m.id,
      { id: m.id, tipo: m.tipo, metodo: m.metodo, monto_centavos: BigInt(m.monto_centavos), origen: m.origen as Movimiento["origen"] },
    ]),
  );
  const r = revertir_movimiento({
    idempotencyKey: key,
    revierteA: b.revierte_a,
    ...(b.motivo !== undefined ? { motivo: b.motivo } : {}),
    actor: b.actor,
    movimientos: movs,
    reversiones: store.reversiones,
    vistos: store.reversionVistos,
    auditoria: store.auditoria,
  });
  if (r.status !== 201) return Response.json({ error: r.error }, { status: r.status });
  store.movements.push({
    id: r.movimiento.id,
    tipo: r.movimiento.tipo,
    metodo: r.movimiento.metodo,
    monto_centavos: r.movimiento.monto_centavos.toString(),
    origen: r.movimiento.origen,
    idempotency_key: key,
  });
  return Response.json({ movimiento_id: r.movimiento.id, revierte_a: r.movimiento.revierteA }, { status: 201 });
};
