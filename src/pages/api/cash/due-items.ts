import type { APIRoute } from "astro";
import { z } from "zod";
import { store } from "../../../lib/store.js";
import { intentarPersistir } from "../../../lib/server-db.js";
import { cashDueItems, cashMovements } from "../../../db/schema.js";

export const prerender = false;

// GET /api/cash/due-items — CAJA-S3 lista + aviso 3d.
export const GET: APIRoute = async () => {
  const ahora = Date.now();
  const lista = [...store.vencimientosCaja.values()].map((d) => ({
    ...d,
    avisa: new Date(d.venceEl).getTime() - ahora <= 3 * 86400_000 && d.estado === "pendiente",
  }));
  return Response.json({ vencimientos: lista });
};

// POST /api/cash/due-items — alta vencimiento caja.
export const POST: APIRoute = async ({ request }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "json invalido" }, { status: 422 });
  }
  const parsed = z.object({ concepto: z.string().min(1).max(200), vence_el: z.string().datetime(), monto_centavos: z.number().int().min(1) }).safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 422 });
  const id = crypto.randomUUID();
  const d = { id, concepto: parsed.data.concepto, venceEl: parsed.data.vence_el, montoCentavos: String(parsed.data.monto_centavos), estado: "pendiente" };
  store.vencimientosCaja.set(id, d);
  void intentarPersistir((db) =>
    db.insert(cashDueItems).values({ concepto: d.concepto, venceEl: new Date(d.venceEl), montoCentavos: BigInt(d.montoCentavos) }).onConflictDoNothing(),
  );
  return Response.json(d, { status: 201 });
};

// PATCH /api/cash/due-items?id= — Registrar pago: crea egreso + marca Pagada.
export const PATCH: APIRoute = async ({ request, url }) => {
  const id = url.searchParams.get("id") ?? "";
  if (!id) return Response.json({ error: "falta id" }, { status: 422 });
  const d = store.vencimientosCaja.get(id);
  if (!d) return Response.json({ error: "desconocido" }, { status: 404 });
  if (d.estado === "pagada") return Response.json({ error: "ya pagada" }, { status: 409 });
  const key = request.headers.get("Idempotency-Key") ?? crypto.randomUUID();
  d.estado = "pagada";
  store.vencimientosCaja.set(id, d);
  const mov = { id: crypto.randomUUID(), tipo: "egreso" as const, metodo: "Efectivo" as const, monto_centavos: d.montoCentavos, origen: `vencimiento:${id}`, idempotency_key: key };
  store.movements.push(mov);
  void intentarPersistir((db) =>
    db.insert(cashMovements).values({ saleId: null, idempotencyKey: key, tipo: "egreso", metodo: "Efectivo", categoriaId: "vencimiento", origen: `vencimiento:${id}`, montoCentavos: BigInt(d.montoCentavos) }).onConflictDoNothing(),
  );
  return Response.json({ id, estado: "pagada", egreso_id: mov.id });
};
