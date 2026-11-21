import type { APIRoute } from "astro";
import { reversalSchema } from "../../../lib/validation.js";
import { BaseNoDisponible } from "../../../lib/server-db.js";
import { exigirOnlineParaSensible } from "../../../lib/offline-gate.js";
import { revertirCaja } from "../../../lib/repos/caja.js";

export const prerender = false;

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
  let r: Awaited<ReturnType<typeof revertirCaja>>;
  try {
    r = await revertirCaja({
      key,
      revierteA: b.revierte_a,
      ...(b.motivo !== undefined ? { motivo: b.motivo } : {}),
      actor: b.actor,
    });
  } catch (e) {
    if (e instanceof BaseNoDisponible) return Response.json({ error: "base_no_disponible" }, { status: 503 });
    throw e;
  }
  if (r.status !== 201) return Response.json({ error: r.error }, { status: r.status });
  return Response.json({ movimiento_id: r.movimiento.id, revierte_a: r.movimiento.revierteA }, { status: 201 });
};
