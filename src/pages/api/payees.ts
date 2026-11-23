import type { APIRoute } from "astro";
import { payeeSchema } from "../../lib/validation.js";
import { BaseNoDisponible } from "../../lib/server-db.js";
import { exigirDuenoDeRequest } from "../../lib/tenant-context.js";
import { altaPayee, listarPayeesActivos } from "../../lib/repos/ordenes-pago.js";

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const dueno = exigirDuenoDeRequest(request);
  if (!dueno.ok) return dueno.respuesta;
  try {
    const items = (await listarPayeesActivos()).map((p) => ({
      payee_id: p.id,
      nombre: p.nombre,
      tipo: p.tipo,
      medio_preferido: p.medioPreferido,
      ...(p.alias !== undefined ? { alias: p.alias } : {}),
      ...(p.cbu !== undefined ? { cbu: p.cbu } : {}),
      ...(p.cuit !== undefined ? { cuit: p.cuit } : {}),
      ...(p.linkPagoUrl !== undefined ? { link_pago_url: p.linkPagoUrl } : {}),
    }));
    return Response.json({ items });
  } catch (e) {
    if (e instanceof BaseNoDisponible) return Response.json({ error: "base_no_disponible" }, { status: 503 });
    throw e;
  }
};

export const POST: APIRoute = async ({ request }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "json invalido" }, { status: 422 });
  }
  const parsed = payeeSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 422 });
  const b = parsed.data;
  let r: Awaited<ReturnType<typeof altaPayee>>;
  try {
    r = await altaPayee({
      id: crypto.randomUUID(),
      nombre: b.nombre,
      tipo: b.tipo,
      medioPreferido: b.medio_preferido,
      ...(b.alias !== undefined ? { alias: b.alias } : {}),
      ...(b.cbu !== undefined ? { cbu: b.cbu } : {}),
      ...(b.cuit !== undefined ? { cuit: b.cuit } : {}),
      ...(b.link_pago_url !== undefined ? { linkPagoUrl: b.link_pago_url } : {}),
    });
  } catch (e) {
    if (e instanceof BaseNoDisponible) return Response.json({ error: "base_no_disponible" }, { status: 503 });
    throw e;
  }
  if (!r.ok) return Response.json({ error: r.error }, { status: r.status });
  if (r.fuente === "db") return Response.json({ payee_id: r.payeeId, nombre: r.nombre, fuente: "db" }, { status: 201 });
  return Response.json({ payee_id: r.payeeId, nombre: r.nombre }, { status: 201 });
};
