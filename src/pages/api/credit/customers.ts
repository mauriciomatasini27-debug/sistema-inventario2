import type { APIRoute } from "astro";
import { rolParaFiado, resolverRolEfectivo } from "../../../lib/control.js";
import { BaseNoDisponible } from "../../../lib/server-db.js";
import { filtrarTexto, listaQuerySchema, paginar } from "../../../lib/lista-paginada.js";
import { altaClienteRapida, listarClientes } from "../../../lib/repos/fiado.js";
import { altaRapidaClienteSchema } from "../../../modules/credit/clientes.js";

export const prerender = false;

// GET /api/credit/customers — listado read-only tenant-scoped (P3-7d,
// ADR-0020) para el picker de fiado. ?q= matchea nombre, id, teléfono o DNI a
// nivel servidor; el item devuelve solo customer_id y nombre.
// ?limit= (default 20, tope 50) y ?cursor= offset. DB primero (customers); en
// single sin base cae a memoria; en multi sin base BaseNoDisponible -> 503.
export const GET: APIRoute = async ({ url }) => {
  const parsed = listaQuerySchema.safeParse({
    q: url.searchParams.get("q") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
    cursor: url.searchParams.get("cursor") ?? undefined,
  });
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 422 });
  let leidos: Awaited<ReturnType<typeof listarClientes>>;
  try {
    leidos = await listarClientes();
  } catch (e) {
    if (e instanceof BaseNoDisponible) return Response.json({ error: "base_no_disponible" }, { status: 503 });
    throw e;
  }
  const filtrados = filtrarTexto(leidos.clientes, parsed.data.q, (c) => [c.nombre, c.customerId, c.telefono, c.dni]);
  const { items, next_cursor } = paginar(filtrados, parsed.data);
  return Response.json({
    items: items.map((c) => ({
      customer_id: c.customerId,
      nombre: c.nombre,
    })),
    next_cursor,
    fuente: leidos.fuente,
  });
};

// P1-64: mismo permiso que la venta a cuenta. El id sale de customers, no del body.
export const POST: APIRoute = async ({ request }) => {
  const acceso = rolParaFiado(resolverRolEfectivo(request));
  if (!acceso.ok) return Response.json({ error: acceso.error }, { status: 403 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "json invalido" }, { status: 422 });
  }
  const parsed = altaRapidaClienteSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 422 });

  try {
    const r = await altaClienteRapida({ nombre: parsed.data.nombre, telefono: parsed.data.telefono });
    if (!r.ok && r.codigo === "DUPLICADO") {
      return Response.json(
        {
          error: r.error,
          codigo: r.codigo,
          existente: { customer_id: r.existente.customerId, nombre: r.existente.nombre },
        },
        { status: r.status },
      );
    }
    if (!r.ok) return Response.json({ error: r.error }, { status: r.status });
    return Response.json({ customer_id: r.customerId, nombre: r.nombre }, { status: 201 });
  } catch (e) {
    if (e instanceof BaseNoDisponible) return Response.json({ error: "base_no_disponible" }, { status: 503 });
    throw e;
  }
};
