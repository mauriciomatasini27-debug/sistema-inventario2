import type { APIRoute } from "astro";
import { discountPreviewSchema } from "../../../lib/validation.js";
import { aplicar_descuentos } from "../../../modules/sales/descuentos.js";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "json invalido" }, { status: 422 });
  }
  const parsed = discountPreviewSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 422 });
  const b = parsed.data;
  const r = aplicar_descuentos({
    lineas: b.lineas.map((l) => ({ sku: l.product_id, cantidad: l.qty, precioCentavos: BigInt(l.precio_centavos) })),
    ...(b.descuentos_linea !== undefined
      ? {
          descuentosLinea: b.descuentos_linea.map((d) =>
            d == null
              ? null
              : d.tipo === "monto"
                ? { tipo: "monto" as const, montoCentavos: BigInt(d.monto_centavos) }
                : { tipo: "porcentaje" as const, porcentajeBp: d.porcentaje_bp },
          ),
        }
      : {}),
    ...(b.descuento_ticket !== undefined
      ? {
          descuentoTicket:
            b.descuento_ticket.tipo === "monto"
              ? { tipo: "monto" as const, montoCentavos: BigInt(b.descuento_ticket.monto_centavos) }
              : { tipo: "porcentaje" as const, porcentajeBp: b.descuento_ticket.porcentaje_bp },
        }
      : {}),
  });
  if (!r.ok) return Response.json({ error: "DESCUENTO_INVALIDO" }, { status: 422 });
  return Response.json({
    total_bruto_centavos: r.calculo.totalBrutoCentavos.toString(),
    total_descuento_centavos: r.calculo.totalDescuentoCentavos.toString(),
    total_neto_centavos: r.calculo.totalNetoCentavos.toString(),
  });
};
