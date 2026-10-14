import type { APIRoute } from "astro";
import { cuentaSchema } from "../../modules/utilities/cuentas.js";
import { BaseNoDisponible } from "../../lib/server-db.js";
import { altaCuenta, listarCuentasDetalle } from "../../lib/repos/servicios.js";

export const prerender = false;

// POST /api/service-accounts — alta de cuenta de servicio (CS8, anti-duplicada).
// PERS2-S24: DB-first en el repo de servicios. En multi sin base el repo
// propaga BaseNoDisponible y la ruta responde 503.
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
  let r: Awaited<ReturnType<typeof altaCuenta>>;
  try {
    r = await altaCuenta({
      servicio: b.servicio,
      proveedor: b.proveedor,
      titular: b.titular,
      ...(b.numero_cuenta !== undefined ? { numeroCuenta: b.numero_cuenta } : {}),
      ...(b.alias !== undefined ? { alias: b.alias } : {}),
      ...(b.vencimiento_tipico_dia !== undefined ? { vencimientoTipicoDia: b.vencimiento_tipico_dia } : {}),
      ...(b.email_origen !== undefined ? { emailOrigen: b.email_origen } : {}),
      ...(b.medio_habitual !== undefined ? { medioHabitual: b.medio_habitual } : {}),
      debitoAutomatico: b.debito_automatico,
    });
  } catch (e) {
    if (e instanceof BaseNoDisponible) return Response.json({ error: "base_no_disponible" }, { status: 503 });
    throw e;
  }
  if (!r.ok) return Response.json({ error: r.error }, { status: r.status });
  if (r.fuente === "db") return Response.json({ account_id: r.accountId, servicio: r.servicio, fuente: "db" }, { status: 201 });
  return Response.json({ account_id: r.accountId, servicio: r.servicio }, { status: 201 });
};

// GET /api/service-accounts — lista de cuentas para el panel CS7.
// Sin emails de origen (no los necesita el panel); sin montos (las
// cuentas nunca guardan dinero, solo las facturas).
export const GET: APIRoute = async () => {
  try {
    return Response.json({ items: await listarCuentasDetalle() });
  } catch (e) {
    if (e instanceof BaseNoDisponible) return Response.json({ error: "base_no_disponible" }, { status: 503 });
    throw e;
  }
};
