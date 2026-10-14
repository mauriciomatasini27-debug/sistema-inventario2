import type { APIRoute } from "astro";
import { cashMovementSchema } from "../../../lib/validation.js";
import { registrar_movimiento_db_first } from "../../../modules/cash/registro_movimiento.js";

export const prerender = false;

// POST /api/cash/movements — usa el mismo Idempotency-Key de la venta (C8).
// PERS-S1 DB-first: el repo es dueño de duplicado → insert → espejo memoria.
export const POST: APIRoute = async ({ request }) => {
  const key = request.headers.get("Idempotency-Key") ?? "";
  if (!key) return Response.json({ error: "falta Idempotency-Key" }, { status: 422 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "json invalido" }, { status: 422 });
  }
  const parsed = cashMovementSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 422 });
  const b = parsed.data;
  const reg = await registrar_movimiento_db_first({
    key,
    tipo: b.tipo,
    metodo: b.metodo,
    categoria_id: b.categoria_id,
    origen: b.origen,
    sale_id: b.sale_id,
    monto_centavos: b.monto_centavos,
  });
  if (!reg.ok) {
    if (reg.codigo === "DUPLICADO") {
      return Response.json({ error: "duplicado", original: reg.original }, { status: 409 });
    }
    if (reg.codigo === "VENTA_EXIGE_SALE_ID") {
      return Response.json({ error: "venta exige sale_id" }, { status: 422 });
    }
    return Response.json({ error: "requiere dueno" }, { status: 403 });
  }
  return Response.json({ ...reg.mov, fuente: reg.fuente }, { status: 201 });
};
