import { eq, sql } from "drizzle-orm";
import { idMappings, outbox, products, ticketCounters, type OutboxPayload } from "../../db/schema.js";
import { deviceSyncState, offlineGrants } from "../../db/schema-sync.js";
import { tenantActual } from "../tenant-mode.js";
import { dbVivaTenant, type TenantDb } from "../server-db.js";
import {
  crearAlmacenDeviceSeq,
  crearAlmacenDeviceSync,
  crearAlmacenDevices,
  crearAlmacenGrants,
  crearAlmacenOutbox,
  crearAlmacenPrecios,
  crearAlmacenPromociones,
  crearAlmacenStock,
  crearContadorTickets,
  type AlmacenVivo,
  type ContadorAlmacen,
  type LatidoSync,
  type PromocionSync,
} from "./_almacen.js";

// PERS2-S21/S22 (ADR-0061): outbox, secuencia por dispositivo, mapeos provisorio
// a definitivo y estado por dispositivo. DB del tenant primero; memoria
// particionada solo en single sin base. En multi sin base propaga
// BaseNoDisponible y la ruta responde 503.

function esConflictoUnico(e: unknown): boolean {
  return typeof e === "object" && e !== null && "code" in e && (e as { code: unknown }).code === "23505";
}

export interface PushEntrada {
  readonly opId: string;
  readonly deviceCode: string;
  readonly deviceSeq: number;
  readonly hlc: string;
  readonly modulo: string;
  readonly payload: OutboxPayload;
}

export interface RespuestaRepo {
  readonly status: number;
  readonly cuerpo: Record<string, unknown>;
}

async function contarOutbox(db: TenantDb): Promise<number> {
  const filas = await db.select({ n: sql`count(*)` }).from(outbox);
  return Number(filas[0]?.n ?? 0);
}

function pushEnMemoria(
  b: PushEntrada,
  buzon: AlmacenVivo<unknown>,
  secuencias: AlmacenVivo<number>,
): RespuestaRepo {
  const prev = buzon.obtener(b.opId);
  if (prev) {
    const same = JSON.stringify(prev) === JSON.stringify(b.payload);
    if (!same) return { status: 409, cuerpo: { error: "op_id duplicado", original: prev } };
    return { status: 200, cuerpo: { op_id: b.opId, cursor_nuevo: String(buzon.comoMapaSoloLectura().size) } };
  }
  // deviceSeq has no table: la secuencia por dispositivo vive en memoria del repo.
  const lastSeq = secuencias.obtener(b.deviceCode) ?? 0;
  if (b.deviceSeq <= lastSeq) {
    return { status: 422, cuerpo: { error: "device_seq duplicado o desordenado" } };
  }
  buzon.guardar(b.opId, b.payload);
  secuencias.guardar(b.deviceCode, b.deviceSeq);
  const idMapeado = `srv-${b.opId.slice(0, 8)}`;
  return {
    status: 201,
    cuerpo: { op_id: b.opId, cursor_nuevo: String(buzon.comoMapaSoloLectura().size), id_mapeado: idMapeado },
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
  const buzon = crearAlmacenOutbox();
  const secuencias = crearAlmacenDeviceSeq();
  const db = dbVivaTenant();
  if (!db) return pushEnMemoria(b, buzon, secuencias);
  try {
    const previo = await db.select().from(outbox).where(eq(outbox.opId, b.opId)).limit(1);
    const fila = previo[0];
    if (fila) return replayDb(db, b.opId, b.payload, fila);

    const maxFilas = await db
      .select({ m: sql<number | null>`max(${outbox.deviceSeq})` })
      .from(outbox)
      .where(eq(outbox.deviceCode, b.deviceCode));
    // deviceSeq has no table: la secuencia por dispositivo vive en memoria del repo.
    const lastSeq = Math.max(Number(maxFilas[0]?.m ?? 0), secuencias.obtener(b.deviceCode) ?? 0);
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
        payload: b.payload,
      });
      await tx
        .insert(idMappings)
        .values({ opId: b.opId, idProvisorio: b.opId, idDefinitivo: idMapeado })
        .onConflictDoNothing({ target: idMappings.opId });
    });
    buzon.guardar(b.opId, b.payload);
    secuencias.guardar(b.deviceCode, b.deviceSeq);
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
    buzon.anteFalloPersistencia(e);
    return pushEnMemoria(b, buzon, secuencias);
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

// PERS6-S1 (ADR-0081): catálogo del delta desde products del tenant.
// Columnas explícitas: el esquema tipado puede tener columnas que la base
// local aún no tiene, así que nunca se usa select() completo aquí.
async function catalogoDesdeDb(db: TenantDb): Promise<LoteSync["catalogo"]> {
  const filas = await db
    .select({ sku: products.sku, stockActual: products.stockActual, precioCentavos: products.precioCentavos })
    .from(products);
  const stock: Record<string, number> = {};
  const prices: Record<string, number> = {};
  for (const f of filas) {
    stock[f.sku] = f.stockActual;
    prices[f.sku] = Number(f.precioCentavos);
  }
  return { stock, prices };
}

// Catálogo del delta en memoria: solo para single sin base y fallback single.
function catalogoMemoria(stock: AlmacenVivo<number>, precios: AlmacenVivo<number>): LoteSync["catalogo"] {
  return {
    stock: Object.fromEntries(stock.comoMapaSoloLectura().entries()),
    prices: Object.fromEntries(precios.comoMapaSoloLectura().entries()),
  };
}

function loteEnMemoria(
  start: number,
  limite: number,
  buzon: AlmacenVivo<unknown>,
  promociones: AlmacenVivo<PromocionSync>,
  stock: AlmacenVivo<number>,
  precios: AlmacenVivo<number>,
): LoteSync {
  const entries = Array.from(buzon.comoMapaSoloLectura().entries());
  const page = entries.slice(start, start + limite);
  const movimientos = page.map(([op_id, payload]) => ({ op_id, payload }));
  return {
    movimientos,
    cursorNuevo: String(start + page.length),
    mappings: Array.from(promociones.comoMapaSoloLectura().entries()).map(([op_id, m]) => ({
      op_id,
      prov: m.provisorio,
      def: m.definitivo,
    })),
    catalogo: catalogoMemoria(stock, precios),
    total: buzon.comoMapaSoloLectura().size,
    fuente: "memoria",
  };
}

// Pull con el mismo paginado por offset; con base viva el catálogo sale de
// products del tenant (PERS6-S1 / ADR-0081), en memoria solo sin base.
export async function leerLote(start: number, limite: number): Promise<LoteSync> {
  const buzon = crearAlmacenOutbox();
  const promociones = crearAlmacenPromociones();
  const stock = crearAlmacenStock();
  const precios = crearAlmacenPrecios();
  const db = dbVivaTenant();
  if (!db) return loteEnMemoria(start, limite, buzon, promociones, stock, precios);
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
      catalogo: await catalogoDesdeDb(db),
      total,
      fuente: "db",
    };
  } catch (e) {
    buzon.anteFalloPersistencia(e);
    return loteEnMemoria(start, limite, buzon, promociones, stock, precios);
  }
}

export interface PromoteEntrada {
  readonly opId: string;
  readonly deviceCode: string;
  readonly deviceSeq: number;
}

// El push deja un provisorio `srv-*` en id_mappings; solo un definitivo T-*
// cuenta como promoción (el replay 200 lo devuelve tal cual).
function esPromovido(definitivo: string): boolean {
  return !definitivo.startsWith("srv-");
}

// Promote idempotente por op_id: el replay devuelve el mapeo original (200).
// El número sale de ticket_counters con lock en la misma tx (DB) o del
// contador del store compartido con ventas (memoria/single sin DB).
export async function promoverOperacion(b: PromoteEntrada): Promise<RespuestaRepo> {
  const promociones = crearAlmacenPromociones();
  const buzon = crearAlmacenOutbox();
  const contador: ContadorAlmacen = crearContadorTickets();
  const db = dbVivaTenant();
  if (db) {
    try {
      const previoDb = await db.select().from(idMappings).where(eq(idMappings.opId, b.opId)).limit(1);
      const previoDbRow = previoDb?.[0];
      if (previoDbRow && esPromovido(previoDbRow.idDefinitivo)) {
        promociones.guardar(b.opId, { provisorio: previoDbRow.idProvisorio, definitivo: previoDbRow.idDefinitivo });
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
      promociones.anteFalloPersistencia(e);
    }
  }
  const previo = promociones.obtener(b.opId);
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

  let hayOp = buzon.contiene(b.opId);
  if (db && !hayOp) {
    try {
      const opsDb = await db.select({ opId: outbox.opId }).from(outbox).where(eq(outbox.opId, b.opId));
      hayOp = (opsDb?.length ?? 0) > 0;
    } catch (e) {
      promociones.anteFalloPersistencia(e);
    }
  }
  if (!hayOp) return { status: 404, cuerpo: { error: "op desconocido" } };

  const provisorio = `${b.deviceCode}-${b.deviceSeq}`;
  if (!db) {
    const definitivo = `T-${String(contador.leer()).padStart(6, "0")}`;
    contador.fijar(contador.leer() + 1);
    promociones.guardar(b.opId, { provisorio, definitivo });
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

  // DB: el número sale de ticket_counters (fila mostrador, FOR UPDATE) en la
  // misma tx que escribe id_mappings y confirma el outbox, igual que las ventas.
  // El lock del contador serializa promotes concurrentes del mismo op.
  try {
    const salida = await db.transaction(async (tx) => {
      const filas = await tx.select().from(ticketCounters).where(eq(ticketCounters.id, "mostrador")).for("update");
      if (!filas[0]) {
        await tx.insert(ticketCounters).values({ id: "mostrador", ultimo: 0 }).onConflictDoNothing();
      }
      const vigente = await tx.select().from(idMappings).where(eq(idMappings.opId, b.opId)).limit(1);
      const ya = vigente[0];
      if (ya && esPromovido(ya.idDefinitivo)) {
        return { definitivo: ya.idDefinitivo, provisorio: ya.idProvisorio, gano: false };
      }
      const ultimo = filas[0]?.ultimo ?? 0;
      const n = ultimo + 1;
      const definitivo = `T-${String(n).padStart(6, "0")}`;
      await tx
        .insert(idMappings)
        .values({ opId: b.opId, idProvisorio: provisorio, idDefinitivo: definitivo })
        .onConflictDoUpdate({
          target: idMappings.opId,
          set: { idProvisorio: provisorio, idDefinitivo: definitivo },
        });
      await tx.update(outbox).set({ estado: "confirmado" }).where(eq(outbox.opId, b.opId));
      await tx.update(ticketCounters).set({ ultimo: n }).where(eq(ticketCounters.id, "mostrador"));
      return { definitivo, provisorio, gano: true };
    });
    promociones.guardar(b.opId, { provisorio: salida.provisorio, definitivo: salida.definitivo });
    contador.fijar(Math.max(contador.leer(), Number(salida.definitivo.slice(2)) + 1));
    return {
      status: salida.gano ? 201 : 200,
      cuerpo: {
        op_id: b.opId,
        ticket_definitivo: salida.definitivo,
        ticket_provisorio: salida.provisorio,
        id_mapeado: salida.definitivo,
      },
    };
  } catch (e) {
    if (esConflictoUnico(e)) {
      try {
        const previo = await db.select().from(idMappings).where(eq(idMappings.opId, b.opId)).limit(1);
        const fila = previo[0];
        if (fila && esPromovido(fila.idDefinitivo)) {
          promociones.guardar(b.opId, { provisorio: fila.idProvisorio, definitivo: fila.idDefinitivo });
          return {
            status: 200,
            cuerpo: {
              op_id: b.opId,
              ticket_definitivo: fila.idDefinitivo,
              ticket_provisorio: fila.idProvisorio,
              id_mapeado: fila.idDefinitivo,
            },
          };
        }
      } catch {
        // Cae al 503/throw de abajo.
      }
    }
    promociones.anteFalloPersistencia(e);
    const definitivo = `T-${String(contador.leer()).padStart(6, "0")}`;
    contador.fijar(contador.leer() + 1);
    promociones.guardar(b.opId, { provisorio, definitivo });
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
  const latidos: AlmacenVivo<LatidoSync> = crearAlmacenDeviceSync();
  return latidos.obtener(deviceCode) ?? null;
}

// Heartbeat: registra device_sync_state (ultima vista + pendientes + ultima op).
// Espejo en memoria para el indicador; tabla del tenant con DB viva.
export async function guardarLatido(b: LatidoEntrada): Promise<void> {
  const latidos = crearAlmacenDeviceSync();
  latidos.guardar(b.deviceCode, {
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
    latidos.anteFalloPersistencia(e);
  }
}

// SYNC-S5/S6 (PRD-SYNC-01, ADR-0023): grants offline + registro de devices
// DB-first. Con base viva la fuente es offline_grants/device_sync_state de la
// base del tenant; la memoria queda como espejo para el indicador y el gate.
// En single sin base todo sigue en memoria. Sin columna nueva: rol/permisos
// viajan en el JWT y registrado_por/en/nombre quedan en el espejo.

// Fila de offline_grants llevada a ISO para comparar con la memoria.
export interface GrantEntrada {
  readonly grantId: string;
  readonly tokenHash: string;
  readonly tenantId: string;
  readonly googleSub: string;
  readonly deviceCode: string;
  readonly alcance: string;
  readonly expiraEn: string;
}

export interface GrantVista extends GrantEntrada {
  readonly revocadoEn: string | null;
  readonly fuente: "db" | "memoria";
}

function vistaDesdeMemoria(
  g: { grantId: string; tokenHash: string; tenantId: string; googleSub: string; deviceCode: string; alcance: string; expiraEn: string; revocadoEn?: string | undefined },
): GrantVista {
  return {
    grantId: g.grantId,
    tokenHash: g.tokenHash,
    tenantId: g.tenantId,
    googleSub: g.googleSub,
    deviceCode: g.deviceCode,
    alcance: g.alcance,
    expiraEn: g.expiraEn,
    revocadoEn: g.revocadoEn ?? null,
    fuente: "memoria",
  };
}

// Emite un grant: inserta en offline_grants (idempotente por grant_id) y deja
// el espejo en memoria. Con base viva la fila manda ante un reinicio.
export async function guardarGrant(g: GrantEntrada, tenantId?: string): Promise<{ fuente: "db" | "memoria" }> {
  const grants = crearAlmacenGrants();
  grants.guardar(g.grantId, { ...g });
  // Tenant explícito: las rutas de control fuera del prefijo de datos no
  // corren bajo el contexto del middleware y dan el comercio validado.
  const db = dbVivaTenant(tenantId);
  if (!db) return { fuente: "memoria" };
  try {
    await db
      .insert(offlineGrants)
      .values({
        grantId: g.grantId,
        tokenHash: g.tokenHash,
        tenantId: g.tenantId,
        googleSub: g.googleSub,
        deviceCode: g.deviceCode,
        alcance: g.alcance,
        expiraEn: new Date(g.expiraEn),
      })
      .onConflictDoNothing();
    return { fuente: "db" };
  } catch (e) {
    grants.anteFalloPersistencia(e);
    return { fuente: "memoria" };
  }
}

// Lee un grant con la base primero: un revoke hecho en otro proceso se ve
// aunque la memoria esté fresca. Con base viva un faltante es null aunque la
// memoria tenga una copia de otro contexto.
export async function leerGrant(grantId: string, tenantId?: string): Promise<GrantVista | null> {
  const grants = crearAlmacenGrants();
  const db = dbVivaTenant(tenantId);
  if (!db) {
    const m = grants.obtener(grantId);
    return m ? vistaDesdeMemoria(m) : null;
  }
  try {
    const filas = await db.select().from(offlineGrants).where(eq(offlineGrants.grantId, grantId)).limit(1);
    const f = filas[0];
    if (!f) return null;
    grants.guardar(grantId, {
      grantId: f.grantId,
      tokenHash: f.tokenHash,
      tenantId: f.tenantId,
      googleSub: f.googleSub,
      deviceCode: f.deviceCode,
      alcance: f.alcance,
      expiraEn: f.expiraEn.toISOString(),
      ...(f.revocadoEn ? { revocadoEn: f.revocadoEn.toISOString() } : {}),
    });
    return {
      grantId: f.grantId,
      tokenHash: f.tokenHash,
      tenantId: f.tenantId,
      googleSub: f.googleSub,
      deviceCode: f.deviceCode,
      alcance: f.alcance,
      expiraEn: f.expiraEn.toISOString(),
      revocadoEn: f.revocadoEn ? f.revocadoEn.toISOString() : null,
      fuente: "db",
    };
  } catch (e) {
    grants.anteFalloPersistencia(e);
    const m = grants.obtener(grantId);
    return m ? vistaDesdeMemoria(m) : null;
  }
}

// Revoca un grant: marca revocado_en en la base y en el espejo. Null si el
// grant no está en la fuente que manda.
export async function revocarGrant(grantId: string, tenantId?: string): Promise<GrantVista | null> {
  const grants = crearAlmacenGrants();
  const ahora = new Date().toISOString();
  const db = dbVivaTenant(tenantId);
  if (!db) {
    const m = grants.obtener(grantId);
    if (!m) return null;
    const rev = { ...m, revocadoEn: ahora };
    grants.guardar(grantId, rev);
    return vistaDesdeMemoria(rev);
  }
  try {
    const filas = await db.select().from(offlineGrants).where(eq(offlineGrants.grantId, grantId)).limit(1);
    const f = filas[0];
    if (!f) return null;
    await db.update(offlineGrants).set({ revocadoEn: new Date() }).where(eq(offlineGrants.grantId, grantId));
    grants.guardar(grantId, {
      grantId: f.grantId,
      tokenHash: f.tokenHash,
      tenantId: f.tenantId,
      googleSub: f.googleSub,
      deviceCode: f.deviceCode,
      alcance: f.alcance,
      expiraEn: f.expiraEn.toISOString(),
      revocadoEn: ahora,
    });
    return {
      grantId: f.grantId,
      tokenHash: f.tokenHash,
      tenantId: f.tenantId,
      googleSub: f.googleSub,
      deviceCode: f.deviceCode,
      alcance: f.alcance,
      expiraEn: f.expiraEn.toISOString(),
      revocadoEn: ahora,
      fuente: "db",
    };
  } catch (e) {
    grants.anteFalloPersistencia(e);
    const m = grants.obtener(grantId);
    if (!m) return null;
    const rev = { ...m, revocadoEn: ahora };
    grants.guardar(grantId, rev);
    return vistaDesdeMemoria(rev);
  }
}

// ¿Grant revocado (cuarentena post-revocación)? Lee la fuente que manda.
export async function grantEstaRevocado(grantId: string, tenantId?: string): Promise<boolean> {
  const g = await leerGrant(grantId, tenantId);
  return g?.revocadoEn !== null && g?.revocadoEn !== undefined;
}

export interface DeviceVista {
  readonly deviceCode: string;
  readonly tenantId: string;
  readonly registradoPor: string | null;
  readonly registradoEn: string | null;
  readonly fuente: "db" | "memoria";
}

// Lee un device con la base primero. registrado_por/en no tienen columna y
// salen del espejo cuando coinciden device y tenant.
export async function leerDevice(deviceCode: string, tenantId?: string): Promise<DeviceVista | null> {
  const devices = crearAlmacenDevices();
  const db = dbVivaTenant(tenantId);
  if (!db) {
    const m = devices.obtener(deviceCode);
    return m ? { ...m, fuente: "memoria" } : null;
  }
  try {
    const filas = await db.select().from(deviceSyncState).where(eq(deviceSyncState.deviceCode, deviceCode)).limit(1);
    const f = filas[0];
    if (!f) return null;
    const m = devices.obtener(deviceCode);
    const mismoTenant = m && m.tenantId === (f.tenantId ?? "");
    return {
      deviceCode: f.deviceCode,
      tenantId: f.tenantId ?? "",
      registradoPor: mismoTenant && m ? m.registradoPor : null,
      registradoEn: mismoTenant && m ? m.registradoEn : null,
      fuente: "db",
    };
  } catch (e) {
    devices.anteFalloPersistencia(e);
    const m = devices.obtener(deviceCode);
    return m ? { ...m, fuente: "memoria" } : null;
  }
}

export interface RegistroDeviceEntrada {
  readonly deviceCode: string;
  readonly tenantId: string;
  readonly registradoPor: string;
  readonly registradoEn: string;
  readonly grant: GrantEntrada;
}

// Registra el device y su grant inicial en la misma transacción. El choque de
// PK (device_code) deja una sola fila: el perdedor relee y responde replay con
// el mismo id. El grant solo se inserta cuando el device lo inserta esta
// llamada, así un registro concurrente no duplica grants.
export async function registrarDeviceConGrant(e: RegistroDeviceEntrada, tenantId?: string): Promise<{ creado: boolean; fuente: "db" | "memoria" }> {
  const devices = crearAlmacenDevices();
  const grants = crearAlmacenGrants();
  const db = dbVivaTenant(tenantId ?? e.tenantId);
  if (!db) {
    if (devices.obtener(e.deviceCode)) return { creado: false, fuente: "memoria" };
    devices.guardar(e.deviceCode, {
      deviceCode: e.deviceCode,
      tenantId: e.tenantId,
      registradoPor: e.registradoPor,
      registradoEn: e.registradoEn,
    });
    grants.guardar(e.grant.grantId, { ...e.grant });
    return { creado: true, fuente: "memoria" };
  }
  try {
    const salida = await db.transaction(async (tx) => {
      const ins = await tx
        .insert(deviceSyncState)
        .values({
          deviceCode: e.deviceCode,
          tenantId: e.tenantId,
          ultimaVistaEn: new Date(e.registradoEn),
          pendientes: 0,
          ultimaOpHlc: null,
          actualizadoEn: new Date(),
        })
        .onConflictDoNothing()
        .returning({ deviceCode: deviceSyncState.deviceCode });
      if (ins.length === 0) return { creado: false as const };
      await tx
        .insert(offlineGrants)
        .values({
          grantId: e.grant.grantId,
          tokenHash: e.grant.tokenHash,
          tenantId: e.grant.tenantId,
          googleSub: e.grant.googleSub,
          deviceCode: e.grant.deviceCode,
          alcance: e.grant.alcance,
          expiraEn: new Date(e.grant.expiraEn),
        })
        .onConflictDoNothing();
      return { creado: true as const };
    });
    if (salida.creado) {
      devices.guardar(e.deviceCode, {
        deviceCode: e.deviceCode,
        tenantId: e.tenantId,
        registradoPor: e.registradoPor,
        registradoEn: e.registradoEn,
      });
      grants.guardar(e.grant.grantId, { ...e.grant });
    }
    return { creado: salida.creado, fuente: "db" };
  } catch (err) {
    if (esConflictoUnico(err) && db) {
      const vigente = await leerDevice(e.deviceCode, tenantId ?? e.tenantId);
      if (vigente) return { creado: false, fuente: "db" };
    }
    devices.anteFalloPersistencia(err);
    if (devices.obtener(e.deviceCode)) return { creado: false, fuente: "memoria" };
    devices.guardar(e.deviceCode, {
      deviceCode: e.deviceCode,
      tenantId: e.tenantId,
      registradoPor: e.registradoPor,
      registradoEn: e.registradoEn,
    });
    grants.guardar(e.grant.grantId, { ...e.grant });
    return { creado: true, fuente: "memoria" };
  }
}
