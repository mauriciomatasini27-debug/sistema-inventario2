import type { APIRoute } from "astro";
import { BaseNoDisponible } from "../../../lib/server-db.js";
import { estadoCuentaRepo } from "../../../lib/repos/facturas-proveedor.js";

export const prerender = false;

// GET /api/supplier-invoices/account?cuit= — estado de cuenta (facturado/pagado/saldo).
// Solo lectura. PERS2-S14: el repo une memoria caliente + DB fria.
export const GET: APIRoute = async ({ url }) => {
  const cuit = url.searchParams.get("cuit") ?? "";
  if (!cuit) return Response.json({ error: "falta cuit" }, { status: 422 });
  try {
    return Response.json(await estadoCuentaRepo({ cuit }));
  } catch (e) {
    if (e instanceof BaseNoDisponible) return Response.json({ error: "base_no_disponible" }, { status: 503 });
    throw e;
  }
};
