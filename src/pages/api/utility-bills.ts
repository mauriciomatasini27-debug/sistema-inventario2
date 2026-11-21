import type { APIRoute } from "astro";
import { facturaSchema } from "../../modules/utilities/facturas_servicios.js";
import { BaseNoDisponible } from "../../lib/server-db.js";
import { registrarFactura } from "../../lib/repos/servicios.js";

export const prerender = false;

// PERS2-S16: persiste via repo de servicios (DB del tenant; memoria solo en single sin base).
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
  let r: Awaited<ReturnType<typeof registrarFactura>>;
  try {
    r = await registrarFactura({
      accountId: b.account_id,
      messageId: b.message_id,
      periodo: b.periodo,
      vencimiento: b.vencimiento,
      montoCentavos: BigInt(b.monto_centavos),
      necesitaRevision: b.necesita_revision,
      origen: b.origen,
      confianzaMonto: b.confianza_monto,
      confianzaVencimiento: b.confianza_vencimiento,
    });
  } catch (e) {
    if (e instanceof BaseNoDisponible) return Response.json({ error: "base_no_disponible" }, { status: 503 });
    throw e;
  }
  if (!r.ok) {
    if (r.codigo === "MENSAJE_REPETIDO") return Response.json({ error: r.error }, { status: 409 });
    return Response.json({ error: r.error }, { status: r.status });
  }
  if (r.fuente === "db") {
    return Response.json({ bill_id: r.factura.id, advertencias: r.advertencias, fuente: "db" }, { status: 201 });
  }
  return Response.json(
    { bill_id: r.factura.id, advertencias: r.advertencias },
    { status: 201 },
  );
};
