import { eq, sql } from "drizzle-orm";
import { idMappings, outbox } from "../../db/schema.js";
import { deviceSyncState } from "../../db/schema-sync.js";
import { esModoMulti, tenantActual } from "../tenant-mode.js";
import { BaseNoDisponible, dbVivaTenant, type TenantDb } from "../server-db.js";
import { store } from "../store.js";

// PERS2-S21/S22 (ADR-0061): outbox, secuencia por dispositivo, mapeos provisorio
// a definitivo y estado por dispositivo. DB del tenant primero; memoria
// particionada solo en single sin base. En multi sin base propaga
// BaseNoDisponible y la ruta responde 503.

function esConflictoUnico(e: unknown): boolean {
  return typeof e === "object" && e !== null && "code" in e && (e as { code: unknown }).code === "23505";
}

function aBaseNoDisponible(e: unknown): BaseNoDisponible {
  return e instanceof BaseNoDisponible ? e : new BaseNoDisponible();
}

export interface PushEntrada {
  readonly opId: string;
  readonly deviceCode: string;
  readonly deviceSeq: number;
  readonly hlc: string;
  readonly modulo: string;
  readonly payload: unknown;
}

export interface RespuestaRepo {
  readonly status: number;
  readonly cuerpo: Record<string, unknown>;
}

async function contarOutbox(db: TenantDb): Promise<number> {
  const filas = await db.select({ n: sql`count(*)` }).from(outbox);
  return Number(filas[0]?.n ?? 0);
}

function pushEnMemoria(b: PushEntrada): RespuestaRepo {
  const prev = store.outbox.get(b.opId);
  if (prev) {
    const same = JSON.stringify(prev) === JSON.stringify(b.payload);
    if (!same) return { status: 409, cuerpo: { error: "op_id duplicado", original: prev } };
    return { status: 200, cuerpo: { op_id: b.opId, cursor_nuevo: String(store.outbox.size) } };
  }
  // deviceSeq has no table: la secuencia por dispositivo vive en memoria del repo.
  const lastSeq = store.deviceSeq.get(b.deviceCode) ?? 0;
  if (b.deviceSeq <= lastSeq) {
    return { status: 422, cuerpo: { error: "device_seq duplicado o desordenado" } };
  }
  store.outbox.set(b.opId, b.payload);
  store.deviceSeq.set(b.deviceCode, b.deviceSeq);
  const idMapeado = `srv-${b.opId.slice(0, 8)}`;
  return {
    status: 201,
    cuerpo: { op_id: b.opId, cursor_nuevo: String(store.outbox.size), id_mapeado: idMapeado },
  };
}

async function replayDb(db: TenantDb, opId: string, payload: unknown, fila: { payload: unknown }): Promise<RespuestaRepo> {
  const same = JSON.stringify(fila.payload) === JSON.stringify(payload);
  if (!same) return { status: 409, cuerpo: { error: "op_id duplicado", original: fila.payload } };
  try {
    const total = await contarOutbox(db);
    return { status: 200, cuerpo: { op_id: opId, cursor_nuevo: String(total), fuente: "db" } };
  } catch {
    return { status: 200, cuerpo: { op_id: opId, cursor_nuevo: "0", fuente: "db" } };
  }
}

// Push idempotente por op_id con secuencia por dispositivo. Carrera entre
// pre-check e insert responde el mismo 200/409 con relectura.
export async function empujarOperacion(b: PushEntrada): Promise<RespuestaRepo> {
  const db = dbVivaTenant();
  if (!db) return pushEnMemoria(b);
  try {
    const previo = await db.select().from(outbox).where(eq(outbox.opId, b.opId)).limit(1);
    const fila = previo[0];
    if (fila) return replayDb(db, b.opId, b.payload, fila);

    const maxFilas = await db
      .select({ m: sql<number | null>`max(${outbox.deviceSeq})` })
      .from(outbox)
      .where(eq(outbox.deviceCode, b.deviceCode));
    // deviceSeq has no table: la secuencia por dispositivo vive en memoria del repo.
    const lastSeq = Math.max(Number(maxFilas[0]?.m ?? 0), store.deviceSeq.get(b.deviceCode) ?? 0);
    if (b.deviceSeq <= lastSeq) {
      return { status: 422, cuerpo: { error: "device_seq duplicado o desordenado" } };
    }

    const idMapeado = `srv-${b.opId.slice(0, 8)}`;
    await db.transaction(async (tx) => {
      await tx.insert(outbox).values({
        opId: b.opId,
        deviceCode: b.deviceCode,
        deviceSeq: b.deviceSeq,
        hlc: b.hlc,
        modulo: b.modulo,
        payload: b.payload as never,
      });
      await tx
        .insert(idMappings)
        .values({ opId: b.opId, idProvisorio: b.opId, idDefinitivo: idMapeado })
        .onConflictDoNothing({ target: idMappings.opId });
    });
    store.outbox.set(b.opId, b.payload);
    store.deviceSeq.set(b.deviceCode, b.deviceSeq);
    const total = await contarOutbox(db);
    return {
      status: 201,
      cuerpo: { op_id: b.opId, cursor_nuevo: String(total), id_mapeado: idMapeado, fuente: "db" },
    };
  } catch (e) {
    if (esConflictoUnico(e) && db) {
      try {
        const previo = await db.select().from(outbox).where(eq(outbox.opId, b.opId)).limit(1);
        const fila = previo[0];
        if (fila) return replayDb(db, b.opId, b.payload, fila);
      } catch {
        // Cae al espejo memoria de abajo.
      }
    }
    if (esModoMulti()) throw aBaseNoDisponible(e);
    return pushEnMemoria(b);
  }
}

export interface LoteSync {
  readonly movimientos: Array<{ op_id: string; payload: unknown }>;
  readonly cursorNuevo: string;
  readonly mappings: Array<{ op_id: string; prov: string; def: string }>;
  readonly catalogo: { stock: Record<string, number>; prices: Record<string, number> };
  readonly total: number;
  readonly fuente: "db" | "memoria";
}

// Catálogo del delta: hoy sale del espejo en memoria como antes de PERS2-S22;
// pendiente leerlo de products/stock del tenant.
function catalogoMemoria(): LoteSync["catalogo"] {
  return {
    stock: Object.fromEntries(store.stock.entries()),
    prices: Object.fromEntries(store.prices.entries()),
  };
}

function loteEnMemoria(start: number, limite: number): LoteSync {
  const entries = Array.from(store.outbox.entries());
  const page = entries.slice(start, start + limite);
  const movimientos = page.map(([op_id, payload]) => ({ op_id, payload }));
  return {
    movimientos,
    cursorNuevo: String(start + page.length),
    mappings: Array.from(store.promociones.entries()).map(([op_id, m]) => ({
      op_id,
      prov: m.provisorio,
      def: m.definitivo,
    })),
    catalogo: catalogoMemoria(),
    total: store.outbox.size,
    fuente: "memoria",
  };
}

// Pull con el mismo paginado por offset; el catalogo sigue en memoria hasta su slice.
export async function leerLote(start: number, limite: number): Promise<LoteSync> {
  const db = dbVivaTenant();
  if (!db) return loteEnMemoria(start, limite);
  try {
    const filas = await db
      .select()
      .from(outbox)
      .orderBy(outbox.createdAt, outbox.opId)
      .limit(limite)
      .offset(start);
    const totalFilas = await db.select({ n: sql`count(*)` }).from(outbox);
    const total = Number(totalFilas[0]?.n ?? 0);
    const mapas = await db.select().from(idMappings);
    return {
      movimientos: filas.map((f) => ({ op_id: f.opId, payload: f.payload })),
      cursorNuevo: String(start + filas.length),
      mappings: mapas.map((m) => ({ op_id: m.opId, prov: m.idProvisorio, def: m.idDefinitivo })),
      catalogo: catalogoMemoria(),
      total,
      fuente: "db",
    };
  } catch (e) {
    if (esModoMulti()) throw aBaseNoDisponible(e);
    return loteEnMemoria(start, limite);
  }
}

export interface PromoteEntrada {
  readonly opId: string;
  readonly deviceCode: string;
  readonly deviceSeq: number;
}

// Promote idempotente por op_id: el replay devuelve el mapeo original (200).
// Numeracion monoproceso en C1; C2 lo lleva a Postgres con lock de secuencia.
export async function promoverOperacion(b: PromoteEntrada): Promise<RespuestaRepo> {
  const db = dbVivaTenant();
  if (db) {
    try {
      const previoDb = await db.select().from(idMappings).where(eq(idMappings.opId, b.opId)).limit(1);
      const previoDbRow = previoDb?.[0];
      if (previoDbRow) {
        store.promociones.set(b.opId, { provisorio: previoDbRow.idProvisorio, definitivo: previoDbRow.idDefinitivo });
        return {
          status: 200,
          cuerpo: {
            op_id: b.opId,
            ticket_definitivo: previoDbRow.idDefinitivo,
            ticket_provisorio: previoDbRow.idProvisorio,
            id_mapeado: previoDbRow.idDefinitivo,
          },
        };
      }
    } catch (e) {
      if (esModoMulti()) throw aBaseNoDisponible(e);
    }
  }
  const previo = store.promociones.get(b.opId);
  if (previo) {
    return {
      status: 200,
      cuerpo: {
        op_id: b.opId,
        ticket_definitivo: previo.definitivo,
        ticket_provisorio: previo.provisorio,
        id_mapeado: previo.definitivo,
      },
    };
  }

  let hayOp = store.outbox.has(b.opId);
  if (db && !hayOp) {
    try {
      const opsDb = await db.select({ opId: outbox.opId }).from(outbox).where(eq(outbox.opId, b.opId));
      hayOp = (opsDb?.length ?? 0) > 0;
    } catch (e) {
      if (esModoMulti()) throw aBaseNoDisponible(e);
    }
  }
  if (!hayOp) return { status: 404, cuerpo: { error: "op desconocido" } };

  const provisorio = `${b.deviceCode}-${b.deviceSeq}`;
  // nextTicket has no table: el correlativo T-* vive en memoria del repo.
  const definitivo = `T-${String(store.nextTicket).padStart(6, "0")}`;
  store.nextTicket += 1;
  store.promociones.set(b.opId, { provisorio, definitivo });

  if (db) {
    try {
      await db
        .insert(idMappings)
        .values({ opId: b.opId, idProvisorio: provisorio, idDefinitivo: definitivo })
        .onConflictDoNothing({ target: idMappings.opId });
      await db.update(outbox).set({ estado: "confirmado" }).where(eq(outbox.opId, b.opId));
    } catch (e) {
      if (esModoMulti()) throw aBaseNoDisponible(e);
    }
  }

  return {
    status: 201,
    cuerpo: {
      op_id: b.opId,
      ticket_definitivo: definitivo,
      ticket_provisorio: provisorio,
      id_mapeado: definitivo,
    },
  };
}

export interface LatidoPrevio {
  readonly ultimaVistaEn: string;
  readonly pendientes: number;
  readonly ultimaOpHlc: string | null;
}

export interface LatidoEntrada {
  readonly deviceCode: string;
  readonly ultimaVistaEn: string;
  readonly pendientes: number;
  readonly ultimaOpHlc: string | null;
}

export function leerLatidoPrevio(deviceCode: string): LatidoPrevio | null {
  return store.deviceSync.get(deviceCode) ?? null;
}

// Heartbeat: registra device_sync_state (ultima vista + pendientes + ultima op).
// Espejo en memoria para el indicador; tabla del tenant con DB viva.
export async function guardarLatido(b: LatidoEntrada): Promise<void> {
  store.deviceSync.set(b.deviceCode, {
    ultimaVistaEn: b.ultimaVistaEn,
    pendientes: b.pendientes,
    ultimaOpHlc: b.ultimaOpHlc,
  });
  const db = dbVivaTenant();
  if (!db) return;
  try {
    await db
      .insert(deviceSyncState)
      .values({
        deviceCode: b.deviceCode,
        tenantId: tenantActual() ?? null,
        ultimaVistaEn: new Date(b.ultimaVistaEn),
        pendientes: b.pendientes,
        ultimaOpHlc: b.ultimaOpHlc,
        actualizadoEn: new Date(),
      })
      .onConflictDoUpdate({
        target: deviceSyncState.deviceCode,
        set: {
          ultimaVistaEn: new Date(b.ultimaVistaEn),
          pendientes: b.pendientes,
          ultimaOpHlc: b.ultimaOpHlc,
          actualizadoEn: new Date(),
        },
      });
  } catch (e) {
    if (esModoMulti()) throw aBaseNoDisponible(e);
  }
}
