import type { APIRoute } from "astro";
import { pricePreviewSchema } from "../../../lib/validation.js";
import { previsualizarAjuste } from "../../../modules/pricing/precios.js";

export const prerender = false;

// POST /api/prices/preview — previa GP1 (no muta).
export const POST: APIRoute = async ({ request }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "json invalido" }, { status: 422 });
  }
  const parsed = pricePreviewSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 422 });
  const b = parsed.data;
  const previa = previsualizarAjuste(
    b.items.map((i) => ({ sku: i.sku, vigenteCentavos: BigInt(i.vigente_centavos), costoCentavos: BigInt(i.costo_centavos ?? 0) })),
    b.direccion,
    b.porcentaje,
    b.paso_centavos !== undefined ? BigInt(b.paso_centavos) : 1000n,
  );
  return Response.json({
    lineas: previa.map((l) => ({ sku: l.sku, nuevo_centavos: l.nuevoCentavos.toString() })),
  });
};
