import type { APIRoute } from "astro";
import { serviceBillPaySchema } from "../../../lib/validation.js";
import { pagar_servicio } from "../../../modules/utilities/facturas_servicios.js";
import { store } from "../../../lib/store.js";

export const prerender = false;

// POST /api/utility-bills/pay — paga servicio (CS5.1, egreso gasto_operativo).
export const POST: APIRoute = async ({ request }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "json invalido" }, { status: 422 });
  }
  const parsed = serviceBillPaySchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 422 });
  const b = parsed.data;
  const factura = store.utilityBills.get(b.bill_id);
  if (!factura) return Response.json({ error: "factura inexistente" }, { status: 404 });
  const r = pagar_servicio(factura, {
    servicio: b.servicio,
    proveedor: b.proveedor,
    numeroCuenta: b.numero_cuenta ?? null,
    medio: b.medio,
    ...(b.nota_extra !== undefined ? { notaExtra: b.nota_extra } : {}),
  });
  if (r.status !== 200) return Response.json({ error: r.error }, { status: r.status });
  store.utilityBills.set(b.bill_id, r.factura);
  store.utilityBillsByMessage.set(r.factura.messageId, r.factura);
  store.movements.push({
    id: crypto.randomUUID(),
    tipo: r.egreso.tipo,
    metodo: r.egreso.metodo,
    monto_centavos: r.egreso.monto_centavos.toString(),
    origen: r.egreso.origen,
    idempotency_key: crypto.randomUUID(),
  });
  return Response.json({ bill_id: r.factura.id, estado: r.factura.estado });
};
