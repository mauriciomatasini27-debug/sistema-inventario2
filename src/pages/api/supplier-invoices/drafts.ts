import type { APIRoute } from "astro";
import { draftIngestSchema } from "../../../lib/validation.js";
import { BaseNoDisponible } from "../../../lib/server-db.js";
import { ingerirBorradorRepo } from "../../../lib/repos/facturas-proveedor.js";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const key = request.headers.get("Idempotency-Key") ?? "";
  if (!key) return Response.json({ error: "falta Idempotency-Key" }, { status: 422 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "json invalido" }, { status: 422 });
  }
  const parsed = draftIngestSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 422 });
  const b = parsed.data;
  const ahoraIso = new Date().toISOString();
  try {
    const r = await ingerirBorradorRepo({
      key,
      origen: b.origen,
      bytesRef: b.bytes_ref,
      esComprobante: b.es_comprobante,
      ...(b.cuit_texto !== undefined ? { cuitTexto: b.cuit_texto } : {}),
      ...(b.nombre_proveedor !== undefined ? { nombreProveedor: b.nombre_proveedor } : {}),
      ...(b.fecha_texto !== undefined ? { fechaTexto: b.fecha_texto } : {}),
      ...(b.total_texto !== undefined ? { totalTexto: b.total_texto } : {}),
      fotoPendiente: b.foto_pendiente,
      ahoraIso,
    });
    return Response.json(r.body, { status: r.status });
  } catch (e) {
    if (e instanceof BaseNoDisponible) return Response.json({ error: "base_no_disponible" }, { status: 503 });
    throw e;
  }
};
