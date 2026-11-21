import type { APIRoute } from "astro";
import { z } from "zod";
import { BaseNoDisponible } from "../../../lib/server-db.js";
import { deshacerQr, listarQr, registrarQr } from "../../../lib/repos/caja.js";

export const prerender = false;

const qrSchema = z.object({
  numero_operacion: z.string().min(1).max(64),
  monto_centavos: z.number().int().min(1),
  // CAJA-S1: contrato de ingesta de campos ya extraídos (bot/Gmail entregan
  // foto o PDF y un extractor previo completa estos campos; sin OAuth/Meta
  fecha_operacion: z.string().datetime({ offset: true }).optional(),
  origen: z.enum(["bot", "gmail", "manual"]).optional(),
});

// POST /api/cash/qr — CAJA-S1 ingesta bot+Gmail. Dedupe numero_operacion.
// PERS2-S13: el repo caja persiste en cash_qr_receipts del tenant con DB viva.
export const POST: APIRoute = async ({ request }) => {
  const key = request.headers.get("Idempotency-Key") ?? crypto.randomUUID();
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "json invalido" }, { status: 422 });
  }
  const parsed = qrSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 422 });
  const num = parsed.data.numero_operacion.trim();
  let r: Awaited<ReturnType<typeof registrarQr>>;
  try {
    r = await registrarQr({
      num,
      montoCentavos: parsed.data.monto_centavos,
      key,
      ...(parsed.data.fecha_operacion !== undefined ? { fechaOperacion: parsed.data.fecha_operacion } : {}),
      ...(parsed.data.origen !== undefined ? { origen: parsed.data.origen } : {}),
    });
  } catch (e) {
    if (e instanceof BaseNoDisponible) return Response.json({ error: "base_no_disponible" }, { status: 503 });
    throw e;
  }
  if (r.status !== 201) return Response.json({ error: r.error, numero_operacion: num }, { status: 409 });
  const solida = r.asociacion?.tipo === "auto" ? { ...r.asociacion, deshacer: true } : r.asociacion;
  return Response.json({ ...r.recibo, ...(solida !== undefined ? { asociacion: solida } : {}) }, { status: 201 });
};

// GET /api/cash/qr?filtro=sin_comprobante — CAJA-S2 lista + filtro.
export const GET: APIRoute = async ({ url }) => {
  const filtro = url.searchParams.get("filtro") ?? "";
  let lista: Awaited<ReturnType<typeof listarQr>>;
  try {
    lista = await listarQr(filtro);
  } catch (e) {
    if (e instanceof BaseNoDisponible) return Response.json({ error: "base_no_disponible" }, { status: 503 });
    throw e;
  }
  return Response.json({ recibos: lista });
};

// DELETE /api/cash/qr?numero_operacion= — Deshacer: el pendiente se borra,
// el asociado por auto se desvincula y vuelve a pendiente.
export const DELETE: APIRoute = async ({ url }) => {
  const num = (url.searchParams.get("numero_operacion") ?? "").trim();
  if (!num) return Response.json({ error: "falta numero_operacion" }, { status: 422 });
  let r: Awaited<ReturnType<typeof deshacerQr>>;
  try {
    r = await deshacerQr(num);
  } catch (e) {
    if (e instanceof BaseNoDisponible) return Response.json({ error: "base_no_disponible" }, { status: 503 });
    throw e;
  }
  if (r.status !== 200) return Response.json({ error: r.error }, { status: r.status });
  return Response.json({ deshecho: r.num, estado: r.estado });
};
