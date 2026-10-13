import type { APIRoute } from "astro";
import { store } from "../../../lib/store.js";
import { conteo_por_sector, normalizarSector } from "../../../modules/inventario/sectores.js";
import type { Sku } from "../../../modules/inventario/inventario.js";

export const prerender = false;

// POST /api/stock/conteo — Nivel 1: conteo ciego por sector.
// Header Idempotency-Key obligatorio. Compara stock teórico (filtrado por
// sector) vs físico y aplica COMPENSATORIO append-only (nunca UPDATE).
// 201 con diferencias+movimientos, 409 key repetida, 422 línea inválida.
export const POST: APIRoute = async ({ request }) => {
  const key = request.headers.get("Idempotency-Key") ?? "";
  if (!key) return Response.json({ error: "falta Idempotency-Key" }, { status: 422 });
  if (store.conteoVistos.has(key)) {
    return Response.json({ conteo_id: store.conteoVistos.get(key), duplicado: true }, { status: 409 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "json invalido" }, { status: 422 });
  }
  const b = body as { sector?: unknown; lineas?: unknown; motivo?: unknown };
  if (typeof b.sector !== "string" || !Array.isArray(b.lineas)) {
    return Response.json({ error: "sector y lineas requeridos" }, { status: 422 });
  }
  const sector = normalizarSector(b.sector);
  const fisico = [];
  for (const l of b.lineas as Array<{ sku?: unknown; fisico?: unknown }>) {
    if (typeof l.sku !== "string" || typeof l.fisico !== "number") {
      return Response.json({ error: "linea invalida" }, { status: 422 });
    }
    fisico.push({ sku: l.sku as Sku, fisico: l.fisico });
  }
  const motivo = typeof b.motivo === "string" ? b.motivo : undefined;
  const r = conteo_por_sector(
    motivo === undefined
      ? { teorico: store.stock, fisico, sectorDe: store.productSectores, sector, idemKey: key }
      : { teorico: store.stock, fisico, sectorDe: store.productSectores, sector, idemKey: key, motivo },
  );
  if (!r.ok) return Response.json({ error: r.codigo }, { status: r.status });
  for (const m of r.valor.movimientos) {
    const actual = store.stock.get(m.sku as string) ?? 0;
    store.stock.set(m.sku as string, actual + m.delta);
    store.stockMoves.push({ idemKey: m.idemKey, sku: m.sku as string, loteId: m.loteId as string | null, delta: m.delta, tipo: m.tipo });
  }
  const id = `conteo-${store.conteos.length + 1}`;
  const creadoEn = new Date().toISOString();
  store.conteos.push({
    id,
    sector: r.valor.sector,
    idemKey: key,
    creadoEn,
    diferencias: r.valor.diferencias.map((d) => ({
      sku: d.sku as string,
      teorico: d.teorico,
      fisico: d.fisico,
      diferencia: d.diferencia,
    })),
  });
  store.conteoVistos.set(key, id);
  return Response.json(
    { conteo_id: id, sector: r.valor.sector, diferencias: r.valor.diferencias, movimientos: r.valor.movimientos.length, unidades_ajuste: r.valor.unidadesAjuste },
    { status: 201 },
  );
};
