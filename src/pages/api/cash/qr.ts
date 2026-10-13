import type { APIRoute } from "astro";
import { z } from "zod";
import { store } from "../../../lib/store.js";
import { intentarPersistir } from "../../../lib/server-db.js";
import { cashQrReceipts } from "../../../db/schema.js";

export const prerender = false;

const qrSchema = z.object({
  numero_operacion: z.string().min(1).max(64),
  monto_centavos: z.number().int().min(1),
});

// POST /api/cash/qr — CAJA-S1 ingesta bot+Gmail. Dedupe numero_operacion.
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
  if (store.qrRecibos.has(num)) return Response.json({ error: "ya registrado", numero_operacion: num }, { status: 409 });
  const r = { numeroOperacion: num, montoCentavos: String(parsed.data.monto_centavos), estado: "pendiente", idemKey: key };
  store.qrRecibos.set(num, r);
  void intentarPersistir((db) =>
    db.insert(cashQrReceipts).values({ numeroOperacion: num, montoCentavos: BigInt(parsed.data.monto_centavos), idempotencyKey: key }).onConflictDoNothing(),
  );
  return Response.json(r, { status: 201 });
};

// GET /api/cash/qr?filtro=sin_comprobante — CAJA-S2 lista + filtro.
export const GET: APIRoute = async ({ url }) => {
  const filtro = url.searchParams.get("filtro") ?? "";
  let lista = [...store.qrRecibos.values()];
  if (filtro === "sin_comprobante") lista = lista.filter((r) => r.estado === "pendiente");
  return Response.json({ recibos: lista });
};

// DELETE /api/cash/qr?numero_operacion= — Deshacer (solo pendiente).
export const DELETE: APIRoute = async ({ url }) => {
  const num = (url.searchParams.get("numero_operacion") ?? "").trim();
  if (!num) return Response.json({ error: "falta numero_operacion" }, { status: 422 });
  const r = store.qrRecibos.get(num);
  if (!r) return Response.json({ error: "desconocido" }, { status: 404 });
  if (r.estado !== "pendiente") return Response.json({ error: "no deshace confirmado" }, { status: 409 });
  store.qrRecibos.delete(num);
  return Response.json({ deshecho: num });
};
