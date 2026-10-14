import type { APIRoute } from "astro";
import { supplierInputSchema } from "../../modules/purchases/proveedores.js";
import { BaseNoDisponible } from "../../lib/server-db.js";
import { altaProveedor } from "../../lib/repos/proveedores.js";

export const prerender = false;

// POST /api/suppliers — alta de proveedor (FP). 409 si el CUIT ya existe.
// PERS2-S7: DB-first en el repo de proveedores (pre-check por CUIT +
// onConflictDoNothing con relectura; espejo memoria tras el insert).
export const POST: APIRoute = async ({ request }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "json invalido" }, { status: 422 });
  }
  const parsed = supplierInputSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 422 });
  const b = parsed.data;
  let r: Awaited<ReturnType<typeof altaProveedor>>;
  try {
    r = await altaProveedor({
      cuit: b.cuit,
      nombre: b.nombre,
      ...(b.email !== undefined ? { email: b.email } : {}),
      ...(b.telefono !== undefined ? { telefono: b.telefono } : {}),
      ahoraIso: new Date().toISOString(),
    });
  } catch (e) {
    if (e instanceof BaseNoDisponible) return Response.json({ error: "base_no_disponible" }, { status: 503 });
    throw e;
  }
  if (!r.ok) {
    if (r.codigo === "CUIT_EXISTE") return Response.json({ error: r.error }, { status: 409 });
    return Response.json({ error: r.error }, { status: 422 });
  }
  if (r.fuente === "db") return Response.json({ supplier_id: r.supplierId, cuit: r.cuit, fuente: "db" }, { status: 201 });
  return Response.json({ supplier_id: r.supplierId, cuit: r.cuit }, { status: 201 });
};
