import type { APIRoute } from "astro";
import { priceAdjustmentSchema } from "../../../lib/validation.js";
import { control } from "../../../lib/store.js";
import { esDueno, resolverSesion } from "../../../lib/control.js";
import { exigirOnlineParaSensible } from "../../../lib/offline-gate.js";
import { BaseNoDisponible } from "../../../lib/server-db.js";
import { registrarAjuste } from "../../../lib/repos/precios.js";

export const prerender = false;

// POST /api/prices/adjustments — GP1 idempotente, sensible exige online + confirmación.
// Solo el Dueño del comercio (sesión + membership dueño activa): el ajuste
// cambia precios de venta y no es operación de empleado.
// PERS2-S6: DB-first en el repo de precios (clave repetida responde 409 con
// relectura; ajuste + auditoría entran en 1 tx con espejo memoria). Sesión y
// dueño quedan en memoria hasta el slice de auth.

export const POST: APIRoute = async ({ request }) => {
  const key = request.headers.get("Idempotency-Key") ?? "";
  if (!key) return Response.json({ error: "falta Idempotency-Key" }, { status: 422 });
  const ctx = resolverSesion(request);
  if (!ctx) return Response.json({ error: "requiere sesión" }, { status: 403 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "json invalido" }, { status: 422 });
  }
  const parsed = priceAdjustmentSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 422 });
  const b = parsed.data;
  const tenantId = (body as { tenant_id?: string }).tenant_id ?? "";
  if (!tenantId || !control.tenants.has(tenantId) || !esDueno(tenantId, ctx.googleSub)) {
    return Response.json({ error: "solo el dueño puede ajustar precios" }, { status: 403 });
  }
  // El ajuste es sensible: online sale de las marcas offline del request
  // (grant, cuarentena, device), no de un valor fijo.
  const online = exigirOnlineParaSensible(request, "topes") === null;
  let r: Awaited<ReturnType<typeof registrarAjuste>>;
  try {
    r = await registrarAjuste({
      idempotencyKey: key,
      direccion: b.direccion,
      porcentaje: b.porcentaje,
      vigenciaTipo: b.vigencia_tipo,
      aplicaEn: b.aplica_en ?? null,
      confirmado: b.confirmado,
      online,
      creadoPor: b.creado_por,
      ahoraIso: new Date().toISOString(),
      ...(b.paso_centavos !== undefined ? { pasoCentavos: BigInt(b.paso_centavos) } : {}),
      items: b.items.map((i) => ({ sku: i.sku, vigenteCentavos: BigInt(i.vigente_centavos), costoCentavos: BigInt(i.costo_centavos ?? 0) })),
    });
  } catch (e) {
    if (e instanceof BaseNoDisponible) return Response.json({ error: "base_no_disponible" }, { status: 503 });
    throw e;
  }
  if (!r.ok) {
    if (r.codigo === "CLAVE_REPETIDA") return Response.json({ error: r.error }, { status: 409 });
    return Response.json({ error: r.error }, { status: r.status });
  }
  if (r.fuente === "db") return Response.json({ ajuste_id: r.ajusteId, fuente: "db" }, { status: 201 });
  return Response.json({ ajuste_id: r.ajusteId }, { status: 201 });
};
