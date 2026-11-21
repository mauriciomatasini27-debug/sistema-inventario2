import type { APIRoute } from "astro";
import { serviceBillPaySchema } from "../../../lib/validation.js";
import { BaseNoDisponible } from "../../../lib/server-db.js";
import { pagarFactura } from "../../../lib/repos/servicios.js";

export const prerender = false;

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
  let r: Awaited<ReturnType<typeof pagarFactura>>;
  try {
    r = await pagarFactura({
      billId: b.bill_id,
      servicio: b.servicio,
      proveedor: b.proveedor,
      numeroCuenta: b.numero_cuenta ?? null,
      medio: b.medio,
      ...(b.nota_extra !== undefined ? { notaExtra: b.nota_extra } : {}),
    });
  } catch (e) {
    if (e instanceof BaseNoDisponible) return Response.json({ error: "base_no_disponible" }, { status: 503 });
    throw e;
  }
  if (!r.ok) {
    if (r.codigo === "NO_ENCONTRADA") return Response.json({ error: r.error }, { status: 404 });
    if (r.codigo === "YA_PAGADA") return Response.json({ error: r.error }, { status: 409 });
    return Response.json({ error: r.error }, { status: r.status });
  }
  return Response.json({ bill_id: r.billId, estado: r.estado });
};
