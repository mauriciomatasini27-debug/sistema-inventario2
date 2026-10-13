import type { APIRoute } from "astro";
import { eq, sql } from "drizzle-orm";
import { syncPushSchema } from "../../../lib/validation.js";
import { store } from "../../../lib/store.js";
import { getTenantDb } from "../../../lib/db.js";
import { idMappings, outbox } from "../../../db/schema.js";

export const prerender = false;

// POST /api/sync/push — Idempotency-Key debe igualar op_id (ADR-0001/0003).
// PERS-S2 (PRD-PERS-01): DB-first. op_id repetido con mismo payload responde
// 200 replay sin duplicar; con distinto payload 409. Sin DB o ante error, la
// vía memoria histórica resuelve igual que antes y la venta no se pierde.

type TenantDb = ReturnType<typeof getTenantDb>;

function dbViva(): TenantDb | null {
  try {
    return getTenantDb();
  } catch {
    return null;
  }
}

function esConflictoUnico(e: unknown): boolean {
  return typeof e === "object" && e !== null && "code" in e && (e as { code: unknown }).code === "23505";
}

async function contarOutbox(db: TenantDb): Promise<number> {
  const filas = await db.select({ n: sql`count(*)` }).from(outbox);
  return Number(filas[0]?.n ?? 0);
}

interface PushBody {
  readonly op_id: string;
  readonly device_code: string;
  readonly device_seq: number;
  readonly hlc: string;
  readonly modulo: string;
  readonly payload: unknown;
}

function viaMemoria(b: PushBody): Response {
  const prev = store.outbox.get(b.op_id);
  if (prev) {
    const same = JSON.stringify(prev) === JSON.stringify(b.payload);
    // Por qué 409 con distinto payload: E3/E2 exigen no sobrescribir; se devuelve
    // la confirmación original y se audita el intento.
    if (!same) return Response.json({ error: "op_id duplicado", original: prev }, { status: 409 });
    return Response.json({ op_id: b.op_id, cursor_nuevo: String(store.outbox.size) }, { status: 200 });
  }
  const lastSeq = store.deviceSeq.get(b.device_code) ?? 0;
  if (b.device_seq <= lastSeq) {
    return Response.json({ error: "device_seq duplicado o desordenado" }, { status: 422 });
  }
  store.outbox.set(b.op_id, b.payload);
  store.deviceSeq.set(b.device_code, b.device_seq);
  const idMapeado = `srv-${b.op_id.slice(0, 8)}`;
  return Response.json(
    { op_id: b.op_id, cursor_nuevo: String(store.outbox.size), id_mapeado: idMapeado },
    { status: 201 },
  );
}

function replay200(db: TenantDb, opId: string, payload: unknown, fila: { payload: unknown }): Promise<Response> | Response {
  const same = JSON.stringify(fila.payload) === JSON.stringify(payload);
  if (!same) return Response.json({ error: "op_id duplicado", original: fila.payload }, { status: 409 });
  return contarOutbox(db).then(
    (total) => Response.json({ op_id: opId, cursor_nuevo: String(total), fuente: "db" }, { status: 200 }),
    () => Response.json({ op_id: opId, cursor_nuevo: "0", fuente: "db" }, { status: 200 }),
  );
}

export const POST: APIRoute = async ({ request }) => {
  const key = request.headers.get("Idempotency-Key") ?? "";
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "json invalido" }, { status: 422 });
  }
  const parsed = syncPushSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 422 });
  const b = parsed.data;
  if (key !== b.op_id) return Response.json({ error: "Idempotency-Key debe igualar op_id" }, { status: 422 });

  const db = dbViva();
  if (!db) return viaMemoria(b);

  try {
    const previo = await db.select().from(outbox).where(eq(outbox.opId, b.op_id)).limit(1);
    const fila = previo[0];
    if (fila) return replay200(db, b.op_id, b.payload, fila);

    const maxFilas = await db
      .select({ m: sql<number | null>`max(${outbox.deviceSeq})` })
      .from(outbox)
      .where(eq(outbox.deviceCode, b.device_code));
    const lastSeq = Math.max(Number(maxFilas[0]?.m ?? 0), store.deviceSeq.get(b.device_code) ?? 0);
    if (b.device_seq <= lastSeq) {
      return Response.json({ error: "device_seq duplicado o desordenado" }, { status: 422 });
    }

    const idMapeado = `srv-${b.op_id.slice(0, 8)}`;
    await db.transaction(async (tx) => {
      await tx.insert(outbox).values({
        opId: b.op_id,
        deviceCode: b.device_code,
        deviceSeq: b.device_seq,
        hlc: b.hlc,
        modulo: b.modulo,
        payload: b.payload as never,
      });
      await tx
        .insert(idMappings)
        .values({ opId: b.op_id, idProvisorio: b.op_id, idDefinitivo: idMapeado })
        .onConflictDoNothing({ target: idMappings.opId });
    });
    store.outbox.set(b.op_id, b.payload);
    store.deviceSeq.set(b.device_code, b.device_seq);
    const total = await contarOutbox(db);
    return Response.json(
      { op_id: b.op_id, cursor_nuevo: String(total), id_mapeado: idMapeado, fuente: "db" },
      { status: 201 },
    );
  } catch (e) {
    // Carrera entre pre-check e insert: mismo 200/409 con relectura.
    if (esConflictoUnico(e) && db) {
      try {
        const previo = await db.select().from(outbox).where(eq(outbox.opId, b.op_id)).limit(1);
        const fila = previo[0];
        if (fila) return replay200(db, b.op_id, b.payload, fila);
      } catch {
        // Cae al espejo memoria de abajo.
      }
    }
    // Caída de DB a mitad de camino: la tx revirtió; el op no se pierde.
    return viaMemoria(b);
  }
};
