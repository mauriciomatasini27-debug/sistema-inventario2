import type { APIRoute } from "astro";
import { BaseNoDisponible } from "../../../lib/server-db.js";
import { filtrarTexto, listaQuerySchema, paginar } from "../../../lib/lista-paginada.js";
import { listarClientes } from "../../../lib/repos/fiado.js";

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
