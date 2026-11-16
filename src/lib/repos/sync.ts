import { and, eq, like, sql } from "drizzle-orm";
import { idMappings, outbox, productCodes, products, sales, ticketCounters, tickets, type OutboxPayload } from "../../db/schema.js";
import { deviceSyncState, offlineGrants } from "../../db/schema-sync.js";
import {
  CODIGO_NECESITA_CONEXION,
  MENSAJE_NECESITA_CONEXION,
  esOperacionSoloOnline,
} from "../../offline/sensibles.js";
import { postSalesSchema } from "../validation.js";
import { tenantActual } from "../tenant-mode.js";
import { dbVivaTenant, type TenantDb } from "../server-db.js";
import { filaContadorTicket, whereContadorTicket } from "./ticket-counters.js";
import { dondeTenant, filaConTenant, tenantIdAlSellar, tenantIdShared } from "../tenant-scope.js";
import { aplicarVentaOutbox, type ResultadoAplicarVenta } from "../../modules/sync/aplicar-venta-outbox.js";
import {
  crearAlmacenCodigos,
  crearAlmacenDeviceSeq,
  crearAlmacenIdempotenciaVentas,
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
  type StoredOutbox,
} from "./_almacen.js";

// PERS2-S21/S22 (ADR-0061): outbox, secuencia por dispositivo, mapeos provisorio
// a definitivo y estado por dispositivo. DB del tenant primero; memoria
// particionada solo en single sin base. En multi sin base propaga
// BaseNoDisponible y la ruta responde 503.

function esConflictoUnico(e: unknown): boolean {
  return typeof e === "object" && e !== null && "code" in e && (e as { code: unknown }).code === "23505";
}

// jsonb de Postgres no conserva el orden de claves del payload: comparar con
// JSON.stringify daría 409 en todo replay con más de una clave. Ordenar claves
// compara el mismo payload sin cambiar el rechazo de uno distinto.
function canonico(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonico).join(",")}]`;
  if (typeof v === "object" && v !== null) {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${canonico(o[k])}`).join(",")}}`;
  }
  return JSON.stringify(v) ?? "null";
}

function mismoPayload(a: unknown, b: unknown): boolean {
  return canonico(a) === canonico(b);
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
  const filas = await db.select({ n: sql`count(*)` }).from(outbox).where(dondeTenant(outbox.tenantId));
  return Number(filas[0]?.n ?? 0);
}

const PREFIJO_NO_APLICABLE = "no_aplicable:";

function estadoDeResultado(venta: ResultadoAplicarVenta): string {
  if (venta.resultado === "no_aplicable") return `${PREFIJO_NO_APLICABLE}${venta.motivo}`;
  return "aplicada";
}

async function guardarResultadoOutbox(opId: string, estado: string, payload?: unknown): Promise<void> {
  const buzon = crearAlmacenOutbox();
  const fila = buzon.obtener(opId);
  if (fila) buzon.guardar(opId, { ...fila, estado, ...(payload === undefined ? {} : { payload }) });
  const db = dbVivaTenant();
  if (!db) return;
  try {
    await db
      .update(outbox)
      .set(payload === undefined ? { estado } : { estado, payload: payload as OutboxPayload })
      .where(dondeTenant(outbox.tenantId, eq(outbox.opId, opId)));
  } catch (e) {
    buzon.anteFalloPersistencia(e);
  }
}

function pushEnMemoria(
  b: PushEntrada,
  buzon: AlmacenVivo<StoredOutbox>,
  secuencias: AlmacenVivo<number>,
): RespuestaRepo {
  const prev = buzon.obtener(b.opId);
  if (prev) {
    const same = mismoPayload(prev.payload, b.payload);
    if (!same) return { status: 409, cuerpo: { error: "op_id duplicado", original: prev.payload } };
    return { status: 200, cuerpo: { op_id: b.opId, cursor_nuevo: String(buzon.comoMapaSoloLectura().size) } };
  }
  // deviceSeq has no table: la secuencia por dispositivo vive en memoria del repo.
  const lastSeq = secuencias.obtener(b.deviceCode) ?? 0;
  if (b.deviceSeq <= lastSeq) {
    return { status: 422, cuerpo: { error: "device_seq duplicado o desordenado" } };
  }
  buzon.guardar(b.opId, {
    payload: b.payload,
    estado: "pendiente",
    deviceCode: b.deviceCode,
    deviceSeq: b.deviceSeq,
    modulo: b.modulo,
    createdAt: new Date().toISOString(),
  });
  secuencias.guardar(b.deviceCode, b.deviceSeq);
  const idMapeado = `srv-${b.opId.slice(0, 8)}`;
  return {
    status: 201,
    cuerpo: { op_id: b.opId, cursor_nuevo: String(buzon.comoMapaSoloLectura().size), id_mapeado: idMapeado },
  };
}

async function replayDb(db: TenantDb, opId: string, payload: unknown, fila: { payload: unknown }): Promise<RespuestaRepo> {
  const same = mismoPayload(fila.payload, payload);
  if (!same) return { status: 409, cuerpo: { error: "op_id duplicado", original: fila.payload } };
  try {
    const total = await contarOutbox(db);
    return { status: 200, cuerpo: { op_id: opId, cursor_nuevo: String(total), fuente: "db" } };
  } catch {
    return { status: 200, cuerpo: { op_id: opId, cursor_nuevo: "0", fuente: "db" } };
  }
}

// P10-6 (ADR-0097 VF-S2): tras guardar la op (201) o en el replay (200)
// aplicar la venta con key = op_id. El replay re-aplica para cerrar el hueco
// "outbox guardada pero venta no aplicada"; registrar_venta es idempotente.
async function aplicarVentaSiCorresponde(b: PushEntrada, r: RespuestaRepo): Promise<RespuestaRepo> {
  if (b.modulo !== "sales") return r;
  if (r.status !== 200 && r.status !== 201) return r;
  try {
    // P10-7: una venta que el Dueño descartó no se re-aplica aunque el
    // dispositivo reenvíe la misma op (el replay 200 vuelve a pasar por acá).
    const actual = await leerFilaOutbox(b.opId);
    if (actual?.estado === "descartada") return { status: r.status, cuerpo: { ...r.cuerpo, venta: "descartada" } };
    const venta = await aplicarVentaOutbox({ opId: b.opId, payload: b.payload, modulo: b.modulo });
    await guardarResultadoOutbox(b.opId, estadoDeResultado(venta));
    return {
      status: r.status,
      cuerpo: {
        ...r.cuerpo,
        venta: venta.resultado,
        ...(venta.resultado === "aplicada" ? { sale_id: venta.saleId } : {}),
        ...(venta.resultado === "no_aplicable" ? { motivo: venta.motivo } : {}),
      },
    };
  } catch (e) {
    console.warn("[sync] venta no aplicada", b.opId, e);
    return { status: 503, cuerpo: { error: "venta_no_aplicada", op_id: b.opId } };
  }
}

// Push idempotente por op_id con secuencia por dispositivo. Carrera entre
// pre-check e insert responde el mismo 200/409 con relectura.
// SYNC-S7: la op sensible (payload.tipo en OPERACIONES_SOLO_ONLINE) nunca se
// persiste: responde necesita_conexion sin efecto lateral.
export async function empujarOperacion(b: PushEntrada): Promise<RespuestaRepo> {
  if (esOperacionSoloOnline((b.payload as Record<string, unknown> | null | undefined)?.["tipo"])) {
    return {
      status: 200,
      cuerpo: {
        op_id: b.opId,
        resultado: "necesita_conexion",
        codigo: CODIGO_NECESITA_CONEXION,
        error: MENSAJE_NECESITA_CONEXION,
      },
    };
  }
  const buzon = crearAlmacenOutbox();
  const secuencias = crearAlmacenDeviceSeq();
  const db = dbVivaTenant();
  if (!db) return aplicarVentaSiCorresponde(b, pushEnMemoria(b, buzon, secuencias));
  try {
    const previo = await db.select().from(outbox).where(dondeTenant(outbox.tenantId, eq(outbox.opId, b.opId))).limit(1);
    const fila = previo[0];
    if (fila) return aplicarVentaSiCorresponde(b, await replayDb(db, b.opId, b.payload, fila));

    const maxFilas = await db
      .select({ m: sql<number | null>`max(${outbox.deviceSeq})` })
      .from(outbox)
      .where(dondeTenant(outbox.tenantId, eq(outbox.deviceCode, b.deviceCode)));
    // deviceSeq has no table: la secuencia por dispositivo vive en memoria del repo.
    const lastSeq = Math.max(Number(maxFilas[0]?.m ?? 0), secuencias.obtener(b.deviceCode) ?? 0);
    if (b.deviceSeq <= lastSeq) {
      return { status: 422, cuerpo: { error: "device_seq duplicado o desordenado" } };
    }

    const idMapeado = `srv-${b.opId.slice(0, 8)}`;
    await db.transaction(async (tx) => {
      await tx.insert(outbox).values(
        filaConTenant({
          opId: b.opId,
          deviceCode: b.deviceCode,
          deviceSeq: b.deviceSeq,
          hlc: b.hlc,
          modulo: b.modulo,
          payload: b.payload,
        }),
      );
      await tx
        .insert(idMappings)
        .values(
          filaConTenant({
            opId: b.opId,
            idProvisorio: b.opId,
            idDefinitivo: idMapeado,
          }),
        )
        .onConflictDoNothing({ target: idMappings.opId });
    });
    buzon.guardar(b.opId, {
      payload: b.payload,
      estado: "pendiente",
      deviceCode: b.deviceCode,
      deviceSeq: b.deviceSeq,
      modulo: b.modulo,
      createdAt: new Date().toISOString(),
    });
    secuencias.guardar(b.deviceCode, b.deviceSeq);
    const total = await contarOutbox(db);
    return aplicarVentaSiCorresponde(b, {
      status: 201,
      cuerpo: { op_id: b.opId, cursor_nuevo: String(total), id_mapeado: idMapeado, fuente: "db" },
    });
  } catch (e) {
    if (esConflictoUnico(e) && db) {
      try {
        const previo = await db.select().from(outbox).where(dondeTenant(outbox.tenantId, eq(outbox.opId, b.opId))).limit(1);
        const fila = previo[0];
        if (fila) return aplicarVentaSiCorresponde(b, await replayDb(db, b.opId, b.payload, fila));
      } catch {
        // Cae al espejo memoria de abajo.
      }
    }
    buzon.anteFalloPersistencia(e);
    return aplicarVentaSiCorresponde(b, pushEnMemoria(b, buzon, secuencias));
  }
}

export interface LoteSync {
  readonly movimientos: Array<{ op_id: string; payload: unknown }>;
  readonly cursorNuevo: string;
  readonly mappings: Array<{ op_id: string; prov: string; def: string }>;
  readonly catalogo: {
    stock: Record<string, number>;
    prices: Record<string, number>;
    codes: Record<string, string>;
  };
  readonly total: number;
  readonly fuente: "db" | "memoria";
}

const CLAVES_PELIGROSAS_CODIGO: ReadonlySet<string> = new Set(["__proto__", "constructor", "prototype"]);

// P1-58: la clave va en mayúsculas para coincidir con resolverCodigo. Un SKU
// que no está en stock y precio no entra, igual que al guardar el snapshot.
function mapaCodigos(
  filas: Iterable<readonly [string, string]>,
  stock: Record<string, number>,
  prices: Record<string, number>,
): Record<string, string> {
  const codes: Record<string, string> = {};
  for (const [crudo, sku] of filas) {
    const codigo = crudo.trim().toUpperCase();
    if (codigo === "" || CLAVES_PELIGROSAS_CODIGO.has(crudo) || CLAVES_PELIGROSAS_CODIGO.has(codigo)) continue;
    if (!Object.hasOwn(stock, sku) || !Object.hasOwn(prices, sku)) continue;
    if (Object.hasOwn(codes, codigo)) continue;
    codes[codigo] = sku;
  }
  return codes;
}

// PERS6-S1 (ADR-0081): catálogo del delta desde products del tenant.
// Columnas explícitas: el esquema tipado puede tener columnas que la base
// local aún no tiene, así que nunca se usa select() completo aquí.
async function catalogoDesdeDb(db: TenantDb): Promise<LoteSync["catalogo"]> {
  const wProd = dondeTenant(products.tenantId);
  const filas = wProd
    ? await db
        .select({ sku: products.sku, stockActual: products.stockActual, precioCentavos: products.precioCentavos })
        .from(products)
        .where(wProd)
    : await db
        .select({ sku: products.sku, stockActual: products.stockActual, precioCentavos: products.precioCentavos })
        .from(products);
  const stock: Record<string, number> = {};
  const prices: Record<string, number> = {};
  for (const f of filas) {
    stock[f.sku] = f.stockActual;
    prices[f.sku] = Number(f.precioCentavos);
  }
  const wCod = dondeTenant(productCodes.tenantId);
  const filasCodigos = wCod
    ? await db.select({ codigo: productCodes.codigo, sku: productCodes.sku }).from(productCodes).where(wCod)
    : await db.select({ codigo: productCodes.codigo, sku: productCodes.sku }).from(productCodes);
  return { stock, prices, codes: mapaCodigos(filasCodigos.map((f) => [f.codigo, f.sku] as const), stock, prices) };
}

// Catálogo del delta en memoria: solo para single sin base y fallback single.
function catalogoMemoria(stock: AlmacenVivo<number>, precios: AlmacenVivo<number>): LoteSync["catalogo"] {
  const stockMap = Object.fromEntries(stock.comoMapaSoloLectura().entries());
  const prices = Object.fromEntries(precios.comoMapaSoloLectura().entries());
  return {
    stock: stockMap,
    prices,
    codes: mapaCodigos(crearAlmacenCodigos().comoMapaSoloLectura(), stockMap, prices),
  };
}

function loteEnMemoria(
  start: number,
  limite: number,
  buzon: AlmacenVivo<StoredOutbox>,
  promociones: AlmacenVivo<PromocionSync>,
  stock: AlmacenVivo<number>,
  precios: AlmacenVivo<number>,
): LoteSync {
  const entries = Array.from(buzon.comoMapaSoloLectura().entries());
  const page = entries.slice(start, start + limite);
  const movimientos = page.map(([op_id, fila]) => ({ op_id, payload: fila.payload }));
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
// SYNC-S1: el lote nunca supera 50 filas aunque pidan más (la ruta ya capa,
// acá se cierra para llamadas directas al repo). El cursor es el offset de
// inserción: el outbox es append-only y el orden (createdAt, opId) lo vuelve
// estable entre páginas; cursorNuevo avanza monótono como inicio + leídos.
export async function leerLote(start: number, limite: number): Promise<LoteSync> {
  const tope = Math.min(Math.max(limite, 0), 50);
  const buzon = crearAlmacenOutbox();
  const promociones = crearAlmacenPromociones();
  const stock = crearAlmacenStock();
  const precios = crearAlmacenPrecios();
  const db = dbVivaTenant();
  if (!db) return loteEnMemoria(start, tope, buzon, promociones, stock, precios);
  try {
    const filas = await db
      .select()
      .from(outbox)
      .where(dondeTenant(outbox.tenantId))
      .orderBy(outbox.createdAt, outbox.opId)
      .limit(tope)
      .offset(start);
    const totalFilas = await db.select({ n: sql`count(*)` }).from(outbox).where(dondeTenant(outbox.tenantId));
    const total = Number(totalFilas[0]?.n ?? 0);
    const mapas = await db.select().from(idMappings).where(dondeTenant(idMappings.tenantId));
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
    return loteEnMemoria(start, tope, buzon, promociones, stock, precios);
  }
}

export interface VentaNoAplicable {
  readonly op_id: string;
  readonly device_code: string;
  readonly device_seq: number;
  readonly created_at: string;
  readonly motivo: string;
  readonly payload: unknown;
}

function motivoDeEstado(estado: string): string {
  return estado.slice(PREFIJO_NO_APLICABLE.length);
}

function listarNoAplicablesMemoria(): VentaNoAplicable[] {
  const buzon = crearAlmacenOutbox();
  const filas: VentaNoAplicable[] = [];
  for (const [opId, fila] of buzon.comoMapaSoloLectura()) {
    if (fila.modulo !== "sales" || !fila.estado.startsWith(PREFIJO_NO_APLICABLE)) continue;
    filas.push({
      op_id: opId,
      device_code: fila.deviceCode,
      device_seq: fila.deviceSeq,
      created_at: fila.createdAt,
      motivo: motivoDeEstado(fila.estado),
      payload: fila.payload,
    });
  }
  return filas.sort((a, b) =>
    a.created_at === b.created_at ? a.op_id.localeCompare(b.op_id) : a.created_at.localeCompare(b.created_at),
  );
}

// P10-7 (ADR-0097): las ventas que no se pudieron aplicar quedan en outbox con
// estado `no_aplicable:<motivo>`; el Dueño las revisa desde /panel. La fila
// nunca se borra: reintentar o descartar solo cambia su estado.
export async function listarVentasNoAplicables(): Promise<VentaNoAplicable[]> {
  const buzon = crearAlmacenOutbox();
  const db = dbVivaTenant();
  if (!db) return listarNoAplicablesMemoria();
  try {
    const filas = await db
      .select({
        opId: outbox.opId,
        deviceCode: outbox.deviceCode,
        deviceSeq: outbox.deviceSeq,
        createdAt: outbox.createdAt,
        estado: outbox.estado,
        payload: outbox.payload,
      })
      .from(outbox)
      .where(dondeTenant(outbox.tenantId, and(eq(outbox.modulo, "sales"), like(outbox.estado, `${PREFIJO_NO_APLICABLE}%`))))
      .orderBy(outbox.createdAt, outbox.opId);
    return filas.map((f) => ({
      op_id: f.opId,
      device_code: f.deviceCode,
      device_seq: f.deviceSeq,
      created_at: f.createdAt instanceof Date ? f.createdAt.toISOString() : String(f.createdAt),
      motivo: motivoDeEstado(f.estado),
      payload: f.payload,
    }));
  } catch (e) {
    buzon.anteFalloPersistencia(e);
    return listarNoAplicablesMemoria();
  }
}

interface FilaOutboxResuelta {
  readonly payload: unknown;
  readonly estado: string;
  readonly modulo: string;
}

function filaOutboxMemoria(opId: string): FilaOutboxResuelta | null {
  const fila = crearAlmacenOutbox().obtener(opId);
  if (!fila) return null;
  return { payload: fila.payload, estado: fila.estado, modulo: fila.modulo };
}

async function leerFilaOutbox(opId: string): Promise<FilaOutboxResuelta | null> {
  const buzon = crearAlmacenOutbox();
  const db = dbVivaTenant();
  if (!db) return filaOutboxMemoria(opId);
  try {
    const filas = await db
      .select({ payload: outbox.payload, estado: outbox.estado, modulo: outbox.modulo })
      .from(outbox)
      .where(dondeTenant(outbox.tenantId, eq(outbox.opId, opId)))
      .limit(1);
    const f = filas[0];
    return f ? { payload: f.payload, estado: f.estado, modulo: f.modulo } : null;
  } catch (e) {
    buzon.anteFalloPersistencia(e);
    return filaOutboxMemoria(opId);
  }
}

async function filaPendiente(opId: string): Promise<FilaOutboxResuelta | null> {
  const fila = await leerFilaOutbox(opId);
  if (!fila || fila.modulo !== "sales" || !fila.estado.startsWith(PREFIJO_NO_APLICABLE)) return null;
  return fila;
}

const NO_PENDIENTE = { status: 409, cuerpo: { error: "venta_no_pendiente" } } as const;

export async function reintentarVentaNoAplicable(
  opId: string,
  payloadCorregido?: unknown,
): Promise<RespuestaRepo> {
  const fila = await filaPendiente(opId);
  if (!fila) return NO_PENDIENTE;
  let payload = fila.payload;
  if (payloadCorregido !== undefined) {
    const parsed = postSalesSchema.safeParse(payloadCorregido);
    if (!parsed.success) return { status: 422, cuerpo: { error: "payload_invalido" } };
    payload = parsed.data;
  }
  const venta = await aplicarVentaOutbox({ opId, payload, modulo: "sales" });
  await guardarResultadoOutbox(opId, estadoDeResultado(venta), payloadCorregido === undefined ? undefined : payload);
  return {
    status: 200,
    cuerpo: {
      op_id: opId,
      resultado: venta.resultado,
      estado: estadoDeResultado(venta),
      ...(venta.resultado === "aplicada" ? { sale_id: venta.saleId } : {}),
      ...(venta.resultado === "no_aplicable" ? { motivo: venta.motivo } : {}),
    },
  };
}

export async function descartarVentaNoAplicable(opId: string): Promise<RespuestaRepo> {
  const fila = await filaPendiente(opId);
  if (!fila) return NO_PENDIENTE;
  await guardarResultadoOutbox(opId, "descartada");
  return { status: 200, cuerpo: { op_id: opId, estado: "descartada" } };
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

// P1-71: GET /api/tickets lee esta columna, no id_mappings.
async function completarDefinitivoTicketPromote(
  db: Pick<TenantDb, "execute">,
  opId: string,
  definitivo: string,
): Promise<void> {
  await db.execute(sql`
    update ${tickets}
    set definitivo = ${definitivo}
    from ${sales}
    where ${tickets.saleId} = ${sales.id}
      and ${sales.idempotencyKey} = ${opId}
      and (${tickets.definitivo} is null or ${tickets.definitivo} = ${definitivo})
  `);
}

// P1-71: la lectura sin base, y el fallback si la base falla, miran esta idempotencia.
function cerrarDefinitivoEnMemoria(opId: string, definitivo: string): void {
  const idempotencia = crearAlmacenIdempotenciaVentas();
  const ticket = idempotencia.obtener(opId);
  if (!ticket) return;
  if (ticket.ticket_definitivo !== null && ticket.ticket_definitivo !== definitivo) return;
  idempotencia.guardar(opId, { ...ticket, ticket_definitivo: definitivo });
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
      const previoDb = await db.select().from(idMappings).where(dondeTenant(idMappings.tenantId, eq(idMappings.opId, b.opId))).limit(1);
      const previoDbRow = previoDb?.[0];
      if (previoDbRow && esPromovido(previoDbRow.idDefinitivo)) {
        await completarDefinitivoTicketPromote(db, b.opId, previoDbRow.idDefinitivo);
        promociones.guardar(b.opId, { provisorio: previoDbRow.idProvisorio, definitivo: previoDbRow.idDefinitivo });
        cerrarDefinitivoEnMemoria(b.opId, previoDbRow.idDefinitivo);
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
    cerrarDefinitivoEnMemoria(b.opId, previo.definitivo);
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
      const opsDb = await db.select({ opId: outbox.opId }).from(outbox).where(dondeTenant(outbox.tenantId, eq(outbox.opId, b.opId)));
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
    cerrarDefinitivoEnMemoria(b.opId, definitivo);
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
      let filas = await tx.select().from(ticketCounters).where(whereContadorTicket("mostrador")).for("update");
      if (!filas[0]) {
        await tx.insert(ticketCounters).values(filaContadorTicket("mostrador", 0)).onConflictDoNothing();
        filas = await tx.select().from(ticketCounters).where(whereContadorTicket("mostrador")).for("update");
      }
      const vigente = await tx.select().from(idMappings).where(dondeTenant(idMappings.tenantId, eq(idMappings.opId, b.opId))).limit(1);
      const ya = vigente[0];
      if (ya && esPromovido(ya.idDefinitivo)) {
        await completarDefinitivoTicketPromote(tx, b.opId, ya.idDefinitivo);
        return { definitivo: ya.idDefinitivo, provisorio: ya.idProvisorio, gano: false };
      }
      const ultimo = filas[0]?.ultimo ?? 0;
      const n = ultimo + 1;
      const definitivo = `T-${String(n).padStart(6, "0")}`;
      const tenantId = tenantIdAlSellar();
      await tx
        .insert(idMappings)
        .values(
          filaConTenant({
            opId: b.opId,
            idProvisorio: provisorio,
            idDefinitivo: definitivo,
          }),
        )
        .onConflictDoUpdate({
          target: idMappings.opId,
          set: { idProvisorio: provisorio, idDefinitivo: definitivo },
          ...(tenantId ? { where: eq(idMappings.tenantId, tenantId) } : {}),
        });
      await tx.update(outbox).set({ estado: "confirmado" }).where(dondeTenant(outbox.tenantId, eq(outbox.opId, b.opId)));
      await tx.update(ticketCounters).set({ ultimo: n }).where(whereContadorTicket("mostrador"));
      await completarDefinitivoTicketPromote(tx, b.opId, definitivo);
      return { definitivo, provisorio, gano: true };
    });
    promociones.guardar(b.opId, { provisorio: salida.provisorio, definitivo: salida.definitivo });
    cerrarDefinitivoEnMemoria(b.opId, salida.definitivo);
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
        const previo = await db.select().from(idMappings).where(dondeTenant(idMappings.tenantId, eq(idMappings.opId, b.opId))).limit(1);
        const fila = previo[0];
        if (fila && esPromovido(fila.idDefinitivo)) {
          await completarDefinitivoTicketPromote(db, b.opId, fila.idDefinitivo);
          promociones.guardar(b.opId, { provisorio: fila.idProvisorio, definitivo: fila.idDefinitivo });
          cerrarDefinitivoEnMemoria(b.opId, fila.idDefinitivo);
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
    console.warn("[sync] promote no pudo numerar en base", b.opId, e);
    promociones.anteFalloPersistencia(e);
    // P10-17: con base viva el T-* sale solo de ticket_counters (ADR-0080).
    // Numerar desde memoria y responder 201 falsifica el ticket y duplica T-*,
    // así que un fallo de la transacción se propaga y la ruta responde 503.
    throw e;
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

// SYNC-S3/S4 durable: previo DB-first. Con base viva del tenant la fuente es
// `device_sync_state`; la memoria solo hidrata. Columnas explícitas: el
// esquema tipado puede tener columnas que la base aún no tiene.
export async function leerLatidoPrevioDuro(deviceCode: string): Promise<LatidoPrevio | null> {
  const latidos: AlmacenVivo<LatidoSync> = crearAlmacenDeviceSync();
  const db = dbVivaTenant();
  if (!db) return latidos.obtener(deviceCode) ?? null;
  try {
    const filas = await db
      .select({
        ultimaVistaEn: deviceSyncState.ultimaVistaEn,
        pendientes: deviceSyncState.pendientes,
        ultimaOpHlc: deviceSyncState.ultimaOpHlc,
      })
      .from(deviceSyncState)
      .where(eq(deviceSyncState.deviceCode, deviceCode))
      .limit(1);
    const f = filas[0];
    if (!f) return latidos.obtener(deviceCode) ?? null;
    const visto = f.ultimaVistaEn instanceof Date ? f.ultimaVistaEn.toISOString() : String(f.ultimaVistaEn);
    const previo: LatidoPrevio = { ultimaVistaEn: visto, pendientes: f.pendientes, ultimaOpHlc: f.ultimaOpHlc ?? null };
    latidos.guardar(deviceCode, { ultimaVistaEn: previo.ultimaVistaEn, pendientes: previo.pendientes, ultimaOpHlc: previo.ultimaOpHlc });
    return previo;
  } catch (e) {
    latidos.anteFalloPersistencia(e);
    return latidos.obtener(deviceCode) ?? null;
  }
}

// Heartbeat: registra device_sync_state (ultima vista + pendientes + ultima op).
// Espejo en memoria para el indicador; tabla del tenant con DB viva.
// SYNC-S3/S4 durable: el upsert limpia las marcas de aviso (nuevo ciclo: el
// device acaba de avisar que está vivo, un aviso previo queda superado).
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
        aviso24En: null,
        aviso60En: null,
        aviso72En: null,
      })
      .onConflictDoUpdate({
        target: deviceSyncState.deviceCode,
        set: {
          ultimaVistaEn: new Date(b.ultimaVistaEn),
          pendientes: b.pendientes,
          ultimaOpHlc: b.ultimaOpHlc,
          actualizadoEn: new Date(),
          aviso24En: null,
          aviso60En: null,
          aviso72En: null,
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
