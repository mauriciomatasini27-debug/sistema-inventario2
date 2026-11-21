import type { APIRoute } from "astro";
import { closeSchema } from "../../../lib/validation.js";
import { BaseNoDisponible } from "../../../lib/server-db.js";
import { exigirOnlineParaSensible } from "../../../lib/offline-gate.js";
import { cerrarCaja, leerCierre } from "../../../lib/repos/caja.js";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const bloqueo = exigirOnlineParaSensible(request, "cierre");
  if (bloqueo) return bloqueo;
  const key = request.headers.get("Idempotency-Key") ?? "";
  if (!key) return Response.json({ error: "falta Idempotency-Key" }, { status: 422 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "json invalido" }, { status: 422 });
  }
  const parsed = closeSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 422 });
  const b = parsed.data;
  let r: Awaited<ReturnType<typeof cerrarCaja>>;
  try {
    r = await cerrarCaja({ key, fechaJornada: b.fecha_jornada, closeType: b.close_type });
  } catch (e) {
    if (e instanceof BaseNoDisponible) return Response.json({ error: "base_no_disponible" }, { status: 503 });
    throw e;
  }
  if (r.status !== 201) {
    // Response.json no serializa bigint: el original viaja con total en string.
    const originalJson =
      "original" in r && r.original
        ? {
            ...r.original,
            cierre: { ...r.original.cierre, totalCentavos: r.original.cierre.totalCentavos.toString() },
          }
        : undefined;
    if (r.status === 409 && "original" in r && r.original) {
      return Response.json({ error: r.error, original: originalJson, wa: r.wa }, { status: 409 });
    }
    return Response.json({ error: r.error, original: originalJson }, { status: r.status });
  }
  // CAJA-S2: el cierre informa cuántos QR siguen sin comprobante.
  return Response.json(
    { fecha_jornada: r.cierre.fechaJornada, total_centavos: r.cierre.totalCentavos.toString(), qr_sin_comprobante: r.qrSinComprobante, wa: r.wa },
    { status: 201 },
  );
};

// GET /api/cash/close?fecha=YYYY-MM-DD — lectura del cierre.
export const GET: APIRoute = async ({ url }) => {
  const fecha = url.searchParams.get("fecha") ?? "";
  let c: Awaited<ReturnType<typeof leerCierre>>;
  try {
    c = await leerCierre(fecha);
  } catch (e) {
    if (e instanceof BaseNoDisponible) return Response.json({ error: "base_no_disponible" }, { status: 503 });
    throw e;
  }
  if (!c) return Response.json({ error: "cierre inexistente" }, { status: 404 });
  return Response.json({ fecha_jornada: c.cierre.fechaJornada, total_centavos: c.cierre.totalCentavos.toString() });
};
