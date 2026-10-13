import type { APIRoute } from "astro";
import { mediumCorrectionSchema } from "../../../lib/validation.js";
import { store } from "../../../lib/store.js";
import { intentarPersistir } from "../../../lib/server-db.js";
import { ticketPaymentCorrections } from "../../../db/schema-tickets.js";
import { corregir_medio } from "../../../modules/sales/correccion_medio.js";

export const prerender = false;

// POST /api/sales/medium-corrections — TV14, registro nuevo auditado (nunca UPDATE).
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
  const venta = [...store.idempotency.values()].find((t) => t.sale_id === b.sale_id);
  if (!venta) return Response.json({ error: "venta inexistente" }, { status: 404 });
  const r = corregir_medio({
    idempotencyKey: key,
    saleId: b.sale_id,
    medioOriginal: venta.medio,
    medioNuevo: b.medio_nuevo,
    motivo: b.motivo,
    actor: b.actor,
    vistos: store.correcciones,
  });
  if (r.status !== 201) return Response.json({ error: r.error }, { status: r.status });
  store.correcciones.set(key, r);
  // PERS-S4 best-effort (TV14: documento vinculado, nunca UPDATE): con DB viva
  // deja copia durable; sin DB resuelve false y la memoria sigue mandando.
  void intentarPersistir((db) =>
    db
      .insert(ticketPaymentCorrections)
      .values({
        idempotencyKey: key,
        saleId: b.sale_id,
        medioOriginal: venta.medio,
        medioNuevo: b.medio_nuevo,
        motivo: b.motivo,
        actor: b.actor,
      })
      .onConflictDoNothing({ target: ticketPaymentCorrections.idempotencyKey }),
  );
  return Response.json({ correccion_id: r.correccion.id, antes: r.correccion.medioOriginal, despues: r.correccion.medioNuevo }, { status: 201 });
};
