import type { APIRoute } from "astro";
import { z } from "zod";
import { BaseNoDisponible } from "../../../lib/server-db.js";
import { crearVencimiento, esMedioValido, listarVencimientos, obtenerVencimiento, pagarVencimiento } from "../../../lib/repos/caja.js";
import { vencimientosAAvisar } from "../../../modules/cash/vencimientos.js";
import type { Medio } from "../../../lib/validation.js";

export const prerender = false;

// GET /api/cash/due-items — CAJA-S3 lista + aviso 3d.
// PERS2-S12: el repo caja lee cash_due_items del tenant con DB viva.
// Con ?id= devuelve la precarga de `Registrar pago` del pendiente.
export const GET: APIRoute = async ({ url }) => {
  const id = url.searchParams.get("id") ?? "";
  if (id) {
    let d: Awaited<ReturnType<typeof obtenerVencimiento>>;
    try {
      d = await obtenerVencimiento(id);
    } catch (e) {
      if (e instanceof BaseNoDisponible) return Response.json({ error: "base_no_disponible" }, { status: 503 });
      throw e;
    }
    if (!d) return Response.json({ error: "desconocido" }, { status: 404 });
    if (d.estado === "pagada") return Response.json({ error: "ya pagada" }, { status: 409 });
    return Response.json({
      precarga: { concepto: d.concepto, monto_centavos: Number(d.montoCentavos), metodo: "Efectivo", categoria_id: "vencimiento", origen: `vencimiento:${d.id}` },
    });
  }
  const ahora = Date.now();
  let lista: Awaited<ReturnType<typeof listarVencimientos>>;
  try {
    lista = await listarVencimientos();
  } catch (e) {
    if (e instanceof BaseNoDisponible) return Response.json({ error: "base_no_disponible" }, { status: 503 });
    throw e;
  }
  const avisan = new Set(vencimientosAAvisar(lista, ahora).map((d) => d.id));
  return Response.json({
    vencimientos: lista.map((d) => ({ ...d, avisa: avisan.has(d.id) })),
  });
};

// POST /api/cash/due-items — alta vencimiento caja.
export const POST: APIRoute = async ({ request }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "json invalido" }, { status: 422 });
  }
  const parsed = z.object({ concepto: z.string().min(1).max(200), vence_el: z.string().datetime(), monto_centavos: z.number().int().min(1) }).safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 422 });
  let d: Awaited<ReturnType<typeof crearVencimiento>>;
  try {
    d = await crearVencimiento({ concepto: parsed.data.concepto, venceEl: parsed.data.vence_el, montoCentavos: parsed.data.monto_centavos });
  } catch (e) {
    if (e instanceof BaseNoDisponible) return Response.json({ error: "base_no_disponible" }, { status: 503 });
    throw e;
  }
  return Response.json(d, { status: 201 });
};

// PATCH /api/cash/due-items?id= — Registrar pago: crea egreso + marca Pagada.
// Acepta { metodo } opcional (default Efectivo); el replay con la misma
// Idempotency-Key devuelve el mismo egreso; pagar una pagada con clave
// nueva responde 409.
export const PATCH: APIRoute = async ({ request, url }) => {
  const id = url.searchParams.get("id") ?? "";
  if (!id) return Response.json({ error: "falta id" }, { status: 422 });
  let metodo: Medio | undefined;
  const texto = await request.text();
  if (texto.trim()) {
    let body: unknown;
    try {
      body = JSON.parse(texto);
    } catch {
      return Response.json({ error: "json invalido" }, { status: 422 });
    }
    const parsed = z.object({ metodo: z.string().min(1).max(30).optional() }).safeParse(body);
    if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 422 });
    const pedido = parsed.data.metodo;
    if (pedido !== undefined) {
      if (!esMedioValido(pedido)) return Response.json({ error: "metodo invalido" }, { status: 422 });
      metodo = pedido;
    }
  }
  const key = request.headers.get("Idempotency-Key") ?? crypto.randomUUID();
  let r: Awaited<ReturnType<typeof pagarVencimiento>>;
  try {
    r = metodo === undefined ? await pagarVencimiento({ id, key }) : await pagarVencimiento({ id, key, metodo });
  } catch (e) {
    if (e instanceof BaseNoDisponible) return Response.json({ error: "base_no_disponible" }, { status: 503 });
    throw e;
  }
  if (r.status !== 200) return Response.json({ error: r.error }, { status: r.status });
  return Response.json({ id: r.id, estado: "pagada", egreso_id: r.egresoId });
};
