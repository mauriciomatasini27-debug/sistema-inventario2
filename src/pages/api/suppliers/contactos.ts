import type { APIRoute } from "astro";
import { control } from "../../../lib/store.js";
import { exigirDuenoDeRequest } from "../../../lib/tenant-context.js";

export const prerender = false;

// GET /api/suppliers/contactos (PROV-S4, solo Dueño): contactos de proveedor
// del comercio del Dueño. El tenant sale de la sesión, nunca del query.
export const GET: APIRoute = async ({ request }) => {
  const dueno = exigirDuenoDeRequest(request);
  if (!dueno.ok) return dueno.respuesta;
  const items = [...control.proveedorContactos.values()].filter((c) => c.tenantId === dueno.tenantId);
  return Response.json({ items });
};
