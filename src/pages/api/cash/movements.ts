import type { APIRoute } from "astro";
import { resolverRolEfectivo, resolverSesion } from "../../../lib/control.js";
import { cashMovementSchema } from "../../../lib/validation.js";
import { puede_registrar } from "../../../modules/cash/caja.js";
import { registrar_movimiento_db_first } from "../../../modules/cash/registro_movimiento.js";

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
  const parsed = cashMovementSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 422 });
  const b = parsed.data;
  // P10-27 [rol]: el rol y el actor salen de sesión + membership, nunca del body.
  const rolEfectivo = resolverRolEfectivo(request);
  if (rolEfectivo.estado === "sin_permiso") {
    return Response.json({ error: "No tenés permiso en este comercio." }, { status: 403 });
  }
  const rol = rolEfectivo.estado === "sesion" ? rolEfectivo.rol : "dueno";
  if (!puede_registrar({ origen: b.origen, categoria_id: b.categoria_id, rol })) {
    return Response.json({ error: "No tenés permiso para este movimiento." }, { status: 403 });
  }
  const actor = resolverSesion(request)?.googleSub ?? "legado";
  const reg = await registrar_movimiento_db_first({
    key,
    tipo: b.tipo,
    metodo: b.metodo,
    categoria_id: b.categoria_id,
    origen: b.origen,
    sale_id: b.sale_id,
    monto_centavos: b.monto_centavos,
    nota: b.nota,
    rol,
    actor,
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
