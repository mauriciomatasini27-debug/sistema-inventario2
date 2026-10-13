import type { APIRoute } from "astro";
import { snapshotSchema } from "../../../lib/validation-analytics.js";
import { calcular_rotacion } from "../../../modules/analytics/agregador.js";
import { fuente_memoria } from "../../../modules/analytics/fuente.js";
import {
  describir_snapshot,
  encolar_snapshot,
  top_n,
  type ResumenRotacion,
} from "../../../modules/analytics/snapshots.js";
import { listar_dormidos, reponer_primero } from "../../../modules/analytics/selectores.js";
import { DEFAULT_SETTINGS, type SnapshotRotacion, type SkuRot } from "../../../modules/analytics/tipos.js";

export const prerender = false;

// Snapshots en memoria P0 (misma forma que la tabla rotation_snapshots;
// el adaptador Drizzle la persiste en la misma tx cuando hay DB viva).
const tienda = new Map<string, SnapshotRotacion>();

// POST /api/analytics/snapshots — RT6/RT11: genera el snapshot único que
// consumen WA y email (mismos números). Idempotente por dedupeKey (409).
export const POST: APIRoute = async ({ request }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "json invalido" }, { status: 422 });
  }
  const parsed = snapshotSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "snapshot inválido" }, { status: 422 });
  const b = parsed.data;
  const { movimientos, catalogo } = fuente_memoria();
  const r = calcular_rotacion({
    movimientos,
    stockInicial: new Map<SkuRot, number>(),
    catalogo,
    params: { desde: b.desde, hasta: b.hasta, hoy: b.hasta, ventanaCoberturaDias: 28 },
  });
  if (!r.ok) return Response.json({ error: "ventana inválida" }, { status: 422 });
  const snap = describir_snapshot({
    id: crypto.randomUUID(),
    desde: b.desde,
    hasta: b.hasta,
    filas: r.valor,
    origen: b.origen,
    creadoEn: new Date().toISOString(),
  });
  const e = encolar_snapshot(tienda, snap);
  if (e.status === 409) return Response.json({ error: e.error }, { status: 409 });
  const top = top_n(r.valor, 3);
  const rep = reponer_primero(r.valor, DEFAULT_SETTINGS);
  const dorm = listar_dormidos(r.valor, new Set(), DEFAULT_SETTINGS);
  const resumen: ResumenRotacion = {
    top: top.map((f) => ({ nombre: f.nombre, neto: f.neto })),
    reponer: rep.items.slice(0, 3).map((f) => ({ nombre: f.nombre, cobertura: f.coberturaDias })),
    dormidos: dorm.length,
    inmovilizadoCentavos: dorm.reduce((acc, d) => acc + d.inmovilizadoCentavos, 0n),
  };
  return Response.json(
    {
      snapshot_id: snap.id,
      dedupe_key: snap.dedupeKey,
      resumen: { ...resumen, inmovilizado_centavos: resumen.inmovilizadoCentavos.toString() },
    },
    { status: 201 },
  );
};

// GET /api/analytics/snapshots?desde=&hasta=&origen= — lee el snapshot actual.
export const GET: APIRoute = async ({ url }) => {
  const desde = url.searchParams.get("desde") ?? "";
  const hasta = url.searchParams.get("hasta") ?? "";
  const origen = (url.searchParams.get("origen") ?? "manual") as SnapshotRotacion["origen"];
  const key = `rotacion:${desde}:${hasta}:${origen}`;
  const snap = tienda.get(key);
  if (!snap) return Response.json({ error: "snapshot no encontrado" }, { status: 404 });
  return Response.json({ snapshot_id: snap.id, creado_en: snap.creadoEn, filas: snap.filas.length }, { status: 200 });
};
