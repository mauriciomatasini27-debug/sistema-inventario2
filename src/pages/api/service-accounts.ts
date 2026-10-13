import type { APIRoute } from "astro";
import { cuentaSchema, crear_cuenta } from "../../modules/utilities/cuentas.js";
import { store } from "../../lib/store.js";

export const prerender = false;

// POST /api/service-accounts — alta de cuenta de servicio (CS8, anti-duplicada).
export const POST: APIRoute = async ({ request }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "json invalido" }, { status: 422 });
  }
  const parsed = cuentaSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 422 });
  const b = parsed.data;
  const r = crear_cuenta(
    {
      servicio: b.servicio,
      proveedor: b.proveedor,
      titular: b.titular,
      ...(b.numero_cuenta !== undefined ? { numeroCuenta: b.numero_cuenta } : {}),
      ...(b.alias !== undefined ? { alias: b.alias } : {}),
      ...(b.vencimiento_tipico_dia !== undefined ? { vencimientoTipicoDia: b.vencimiento_tipico_dia } : {}),
      ...(b.email_origen !== undefined ? { emailOrigen: b.email_origen } : {}),
      ...(b.medio_habitual !== undefined ? { medioHabitual: b.medio_habitual } : {}),
      debitoAutomatico: b.debito_automatico,
    },
    [...store.serviceAccounts.values()].map((c) => ({
      servicio: c.servicio,
      proveedor: c.proveedor,
      titular: c.titular,
      numeroCuenta: c.numeroCuenta,
    })),
  );
  if (!r.ok) return Response.json({ error: r.error }, { status: r.status });
  store.serviceAccounts.set(r.cuenta.id, r.cuenta);
  return Response.json({ account_id: r.cuenta.id, servicio: r.cuenta.servicio }, { status: 201 });
};

// GET /api/service-accounts — lista de cuentas para el panel CS7.
// Sin emails de origen (no los necesita el panel); sin montos (las
// cuentas nunca guardan dinero, solo las facturas).
export const GET: APIRoute = async () => {
  return Response.json({
    items: [...store.serviceAccounts.values()].map((c) => ({
      account_id: c.id,
      servicio: c.servicio,
      proveedor: c.proveedor,
      titular: c.titular,
      alias: c.alias,
      activa: c.activa,
    })),
  });
};
