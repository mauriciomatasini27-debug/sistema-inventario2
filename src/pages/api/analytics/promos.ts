import type { APIRoute } from "astro";
import { promoConfirmSchema, promoPreviewSchema } from "../../../lib/validation-analytics.js";
import { resolverSesion, membershipActiva } from "../../../lib/control.js";
import { confirmar_promo, sugerir_promo } from "../../../modules/analytics/promociones.js";
import { puede_marcar_promo } from "../../../modules/analytics/permisos.js";
import type { SkuRot } from "../../../modules/analytics/tipos.js";

export const prerender = false;

const vistos = new Map<string, string>();

// POST /api/analytics/promos — RT9. Body {pct, skus} => preview con piso;
// body {pct, skus, confirmado:true, idempotency_key} + header Idempotency-Key
// => confirma. Solo Dueño. P0 usa costo 0 (ganancia incompleta); con catálogo
// (P1) el piso se calcula con costo vigente.
export const POST: APIRoute = async ({ request }) => {
  const key = request.headers.get("Idempotency-Key") ?? "";
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "json invalido" }, { status: 422 });
  }
  const preview = promoPreviewSchema.safeParse(body);
  const confirm = promoConfirmSchema.safeParse(body);
  const ctx = resolverSesion(request);
  if (ctx?.tenantId) {
    const m = membershipActiva(ctx.tenantId, ctx.googleSub);
    if (!m || m.rol !== "dueno" || !puede_marcar_promo({ rol: "dueno", permisos: [] })) {
      return Response.json({ error: "No tenés permiso para crear descuentos." }, { status: 403 });
    }
  }
  if (confirm.success) {
    if (!key) return Response.json({ error: "falta Idempotency-Key" }, { status: 422 });
    const b = confirm.data;
    const sku = b.skus[0] as SkuRot | undefined;
    if (!sku) return Response.json({ error: "sin productos" }, { status: 422 });
    // P0: vigente y costo provienen del catálogo (acá 0 por slice-0); el piso
    // se recalcula igual y queda auditado. Con costo 0 todo es viable.
    const r = confirmar_promo({
      sku,
      pct: b.pct,
      vigenteCentavos: 0n,
      costoCentavos: 0n,
      markupMinBp: 0,
      confirmado: true,
      vistos,
      idempotencyKey: key,
    });
    if (!r.ok) {
      const status = r.codigo === "YA_VISTA" ? 409 : 422;
      return Response.json({ error: r.codigo }, { status });
    }
    vistos.set(key, sku);
    return Response.json({ sku: r.valor.sku, pct: r.valor.pct }, { status: 201 });
  }
  if (!preview.success) return Response.json({ error: "descuento inválido" }, { status: 422 });
  const b = preview.data;
  const sugs = sugerir_promo({ vigenteCentavos: 0n, costoCentavos: 0n, markupMinBp: 0 });
  const s = sugs.find((x) => x.pct === b.pct);
  if (!s) return Response.json({ error: "descuento inválido" }, { status: 422 });
  return Response.json(
    {
      pct: s.pct,
      precio_promo_centavos: s.precioPromoCentavos.toString(),
      piso_centavos: s.pisoCentavos.toString(),
      viable: s.viable,
      nota: "Confirmá para crear el descuento. Nada se aplica solo.",
    },
    { status: 200 },
  );
};
