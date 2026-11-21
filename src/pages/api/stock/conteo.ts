import type { APIRoute } from "astro";
import { BaseNoDisponible } from "../../../lib/server-db.js";
import { conteoPorSector } from "../../../lib/repos/stock.js";
import { normalizarSector } from "../../../modules/inventario/sectores.js";
import type { Sku } from "../../../modules/inventario/inventario.js";

export const prerender = false;

// sector) vs físico y aplica COMPENSATORIO append-only (nunca UPDATE).
// sin base el repo propaga BaseNoDisponible (503).
export const POST: APIRoute = async ({ request }) => {
  const key = request.headers.get("Idempotency-Key") ?? "";
  if (!key) return Response.json({ error: "falta Idempotency-Key" }, { status: 422 });
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
  let r: Awaited<ReturnType<typeof conteoPorSector>>;
  try {
    r = await conteoPorSector({
      key,
      sector,
      fisico,
      ...(motivo !== undefined ? { motivo } : {}),
    });
  } catch (e) {
    if (e instanceof BaseNoDisponible) return Response.json({ error: "base_no_disponible" }, { status: 503 });
    throw e;
  }
  if (!r.ok) {
    if (r.codigo === "DUPLICADO") return Response.json({ conteo_id: r.conteoId, duplicado: true }, { status: 409 });
    return Response.json({ error: r.codigo }, { status: 422 });
  }
  return Response.json(
    { conteo_id: r.conteoId, sector: r.sector, diferencias: r.diferencias, movimientos: r.movimientos, unidades_ajuste: r.unidadesAjuste },
    { status: 201 },
  );
};
