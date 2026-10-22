import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { createHash } from "node:crypto";
import { snapshotSchema } from "../../../lib/validation-analytics.js";
import { calcular_rotacion } from "../../../modules/analytics/agregador.js";
import { fuente_memoria } from "../../../modules/analytics/fuente.js";
import {
  construir_resumen,
  describir_snapshot,
  encolar_snapshot,
} from "../../../modules/analytics/snapshots.js";
import type { RotationSettings, SnapshotRotacion, SkuRot } from "../../../modules/analytics/tipos.js";
import { intentarLeer, intentarPersistir, BaseNoDisponible } from "../../../lib/server-db.js";
import { leerRotationSettings } from "../../../lib/repos/rotation-settings.js";
import { tenantActual } from "../../../lib/tenant-mode.js";
import { rotationSnapshots } from "../../../db/schema-analytics.js";

export const prerender = false;

// Snapshots en memoria P0 (misma forma que la tabla rotation_snapshots;
// el adaptador Drizzle la persiste en la misma tx cuando hay DB viva).
const tienda = new Map<string, SnapshotRotacion>();

// FilaRotacion lleva dinero en bigint; en jsonb sale como string (ucursal el
// mismo contrato que las respuestas centravos).
function filasJson(filas: SnapshotRotacion["filas"]): unknown[] {
  return [...filas].map((f) => JSON.parse(JSON.stringify(f, (_k, v) => (typeof v === "bigint" ? v.toString() : v))));
}

function shaSnapshot(snap: SnapshotRotacion, filasJson: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify({ filas: filasJson, desde: snap.desde, hasta: snap.hasta, origen: snap.origen }))
    .digest("hex");
}

function keyMemoria(clave: string): string {
  return (tenantActual() ?? "") + "|" + clave;
}

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
  let settings: RotationSettings;
  try {
    settings = await leerRotationSettings();
  } catch (e) {
    if (e instanceof BaseNoDisponible) return Response.json({ error: "base_no_disponible" }, { status: 503 });
    throw e;
  }
  const { movimientos, catalogo } = fuente_memoria();
  const r = calcular_rotacion({
    movimientos,
    stockInicial: new Map<SkuRot, number>(),
    catalogo,
    params: { desde: b.desde, hasta: b.hasta, hoy: b.hasta, ventanaCoberturaDias: settings.ventanaCoberturaDias },
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
  // P10-19: el espejo memoria es por tenant (clave con prefijo); el DB guarda dedupe_key puro.
  const e = encolar_snapshot(tienda, { ...snap, dedupeKey: keyMemoria(snap.dedupeKey) });
  if (e.status === 409) return Response.json({ error: e.error }, { status: 409 });
  // P10-19: copia durable best-effort; en single sin base queda solo memoria.
  try {
    const bodyJson = filasJson(snap.filas);
    await intentarPersistir((db) =>
      db
        .insert(rotationSnapshots)
        .values({
          id: snap.id,
          dedupeKey: snap.dedupeKey,
          desde: snap.desde,
          hasta: snap.hasta,
          payload: { filas: bodyJson, creadoEn: snap.creadoEn, origen: snap.origen },
          payloadHash: shaSnapshot(snap, bodyJson),
          origen: snap.origen,
          createdAt: new Date(snap.creadoEn),
        })
        .onConflictDoNothing(),
    );
  } catch (e) {
    // PERS2: en multi sin base del tenant se cancela igual que las ventas.
    if (e instanceof BaseNoDisponible) return Response.json({ error: "base_no_disponible" }, { status: 503 });
    return Response.json({ error: "snapshot invalido" }, { status: 500 });
  }
  const { inmovilizadoCentavos, ...resumen } = construir_resumen({
    filas: r.valor,
    settings,
    excluidos: new Set(),
  });
  return Response.json(
    {
      snapshot_id: snap.id,
      dedupe_key: snap.dedupeKey,
      resumen: { ...resumen, inmovilizado_centavos: inmovilizadoCentavos.toString() },
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
  // P10-19: DB primero; sin base o sin fila cae al espejo memoria.
  try {
    const filas = await intentarLeer((db) =>
      db.select().from(rotationSnapshots).where(eq(rotationSnapshots.dedupeKey, key)).limit(1),
    );
    const fila = filas?.[0];
    if (fila) {
      const payload = fila.payload as { filas: SnapshotRotacion["filas"]; creadoEn: string };
      return Response.json(
        { snapshot_id: fila.id, creado_en: payload.creadoEn, filas: payload.filas.length },
        { status: 200 },
      );
    }
  } catch (e) {
    if (e instanceof BaseNoDisponible) return Response.json({ error: "base_no_disponible" }, { status: 503 });
    return Response.json({ error: "snapshot invalido" }, { status: 500 });
  }
  const snap = tienda.get(keyMemoria(key));
  if (!snap) return Response.json({ error: "snapshot no encontrado" }, { status: 404 });
  return Response.json({ snapshot_id: snap.id, creado_en: snap.creadoEn, filas: snap.filas.length }, { status: 200 });
};
