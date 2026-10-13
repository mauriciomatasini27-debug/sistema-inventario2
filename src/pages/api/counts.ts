import type { APIRoute } from "astro";
import { z } from "zod";
import { store } from "../../lib/store.js";

export const prerender = false;

const lineaSchema = z.object({ sku: z.string().min(1).max(64), fisico: z.number().int().min(0).max(9999) });

// POST /api/counts — CAT-S6 crea conteo en_curso con líneas offline.
export const POST: APIRoute = async ({ request }) => {
  const key = request.headers.get("Idempotency-Key") ?? crypto.randomUUID();
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "json invalido" }, { status: 422 });
  }
  const parsed = z.object({ contado_por: z.string().min(1).max(128), lineas: z.array(lineaSchema).min(1).max(500) }).safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 422 });
  const dup = store.conteos.find((c) => c.idemKey === key);
  if (dup) return Response.json({ error: "duplicado", original: dup }, { status: 409 });
  const id = crypto.randomUUID();
  const diferencias = parsed.data.lineas.map((l) => {
    const sku = l.sku.trim().toUpperCase();
    const teorico = store.stock.get(sku) ?? 0;
    return { sku, teorico, fisico: l.fisico, diferencia: l.fisico - teorico };
  });
  const conteo = { id, sector: "general", idemKey: key, creadoEn: new Date().toISOString(), diferencias, estado: "en_curso" as const, contadoPor: parsed.data.contado_por };
  store.conteos.push(conteo as never);
  store.conteoVistos.set(key, id);
  return Response.json({ id, estado: "en_curso", diferencias }, { status: 201 });
};

// PATCH /api/counts?id= — confirmar: empleado => listo revisar, dueño => confirmado + ajuste_conteo.
export const PATCH: APIRoute = async ({ request, url }) => {
  const id = url.searchParams.get("id") ?? "";
  if (!id) return Response.json({ error: "falta id" }, { status: 422 });
  const c = (store.conteos as Array<{ id: string; estado?: string; diferencias: Array<{ sku: string; teorico: number; fisico: number; diferencia: number }> }>).find((x) => x.id === id);
  if (!c) return Response.json({ error: "desconocido" }, { status: 404 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "json invalido" }, { status: 422 });
  }
  const parsed = z.object({ rol: z.enum(["empleado", "dueno"]), confirmado_por: z.string().min(1).max(128), motivo: z.string().max(280).optional() }).safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 422 });
  if (parsed.data.rol === "empleado") {
    (c as { estado?: string }).estado = "listo_revisar";
    return Response.json({ id, estado: "listo_revisar" });
  }
  if (!parsed.data.motivo) return Response.json({ error: "confirmar exige motivo" }, { status: 422 });
  (c as { estado?: string }).estado = "confirmado";
  // Ajuste auditado: aplica diferencia a stock + movimiento COMPENSATORIO.
  for (const d of c.diferencias) {
    if (d.diferencia !== 0) {
      store.stock.set(d.sku, (store.stock.get(d.sku) ?? 0) + d.diferencia);
      store.stockMoves.push({ idemKey: `conteo:${id}`, sku: d.sku, loteId: null, delta: d.diferencia, tipo: "COMPENSATORIO" });
    }
  }
  return Response.json({ id, estado: "confirmado", motivo: parsed.data.motivo });
};
