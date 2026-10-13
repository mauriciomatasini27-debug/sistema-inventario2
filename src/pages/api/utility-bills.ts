import type { APIRoute } from "astro";
import { facturaSchema, registrar_factura } from "../../modules/utilities/facturas_servicios.js";
import { store } from "../../lib/store.js";

export const prerender = false;

// POST /api/utility-bills — registra factura de servicio (CS9.1, message-id UNIQUE).
export const POST: APIRoute = async ({ request }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "json invalido" }, { status: 422 });
  }
  const parsed = facturaSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 422 });
  const b = parsed.data;
  const r = registrar_factura(
    {
      accountId: b.account_id,
      messageId: b.message_id,
      periodo: b.periodo,
      vencimiento: b.vencimiento,
      montoCentavos: BigInt(b.monto_centavos),
      necesitaRevision: b.necesita_revision,
      origen: b.origen,
      confianzaMonto: b.confianza_monto,
      confianzaVencimiento: b.confianza_vencimiento,
    },
    store.utilityBillsByMessage,
  );
  if (r.status !== 201) return Response.json({ error: r.error }, { status: r.status });
  store.utilityBills.set(r.factura.id, r.factura);
  store.utilityBillsByMessage.set(r.factura.messageId, r.factura);
  return Response.json(
    { bill_id: r.factura.id, advertencias: r.advertencias },
    { status: 201 },
  );
};
