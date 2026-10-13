import type { APIRoute } from "astro";
import { payeeSchema } from "../../lib/validation.js";
import { crear_payee } from "../../modules/payments/beneficiarios.js";
import { store } from "../../lib/store.js";

export const prerender = false;

// POST /api/payees — alta de beneficiario (OP6, anti-duplicado alias/CBU/CUIT).
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
  const r = crear_payee({
    id: crypto.randomUUID(),
    nombre: b.nombre,
    tipo: b.tipo,
    medioPreferido: b.medio_preferido,
    ...(b.alias !== undefined ? { alias: b.alias } : {}),
    ...(b.cbu !== undefined ? { cbu: b.cbu } : {}),
    ...(b.cuit !== undefined ? { cuit: b.cuit } : {}),
    ...(b.link_pago_url !== undefined ? { linkPagoUrl: b.link_pago_url } : {}),
    existentes: [...store.payees.values()],
  });
  if (!r.ok) return Response.json({ error: r.error }, { status: r.status });
  store.payees.set(r.payee.id, r.payee);
  return Response.json({ payee_id: r.payee.id, nombre: r.payee.nombre }, { status: 201 });
};
