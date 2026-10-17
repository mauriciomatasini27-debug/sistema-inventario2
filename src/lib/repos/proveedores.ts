import { asc, eq } from "drizzle-orm";
import { purchaseOrderLines, purchaseOrders, suppliers } from "../../db/schema-proveedores.js";
import { dbVivaTenant, intentarLeer, type TenantDb } from "../server-db.js";
import {
  crearAlmacenOrderVistos,
  crearAlmacenPurchaseOrders,
  crearAlmacenSuppliers,
} from "./_almacen.js";
import {
  cerrarOrden,
  crearOrden,
  crearSupplier,
  normalizarCuit,
  type EstadoOC,
  type PurchaseOrder,
  type Supplier,
} from "../../modules/purchases/proveedores.js";

export interface ProveedorNuevo {
  readonly cuit: string;
  readonly nombre: string;
  readonly email?: string | undefined;
  readonly telefono?: string | undefined;
  readonly ahoraIso: string;
}

export type AltaProveedorResultado =
  | { ok: true; supplierId: string; cuit: string; fuente: "db" | "memoria" }
  | { ok: false; codigo: "CUIT_EXISTE"; error: string }
  | { ok: false; codigo: "NO_VALIDO"; error: string };

export async function altaProveedor(input: ProveedorNuevo): Promise<AltaProveedorResultado> {
  const almacenSuppliers = crearAlmacenSuppliers();
  const r = crearSupplier({
    cuit: input.cuit,
    nombre: input.nombre,
    ...(input.email !== undefined ? { email: input.email } : {}),
    ...(input.telefono !== undefined ? { telefono: input.telefono } : {}),
    ahoraIso: input.ahoraIso,
    creados: almacenSuppliers.comoMapaSoloLectura(),
  });
  if (r.status !== 201) {
    if (r.status === 409) return { ok: false, codigo: "CUIT_EXISTE", error: r.error };
    return { ok: false, codigo: "NO_VALIDO", error: r.error };
  }
  const cuit = normalizarCuit(r.supplier.cuit);
  const db = dbVivaTenant();
  if (!db) {
    almacenSuppliers.guardar(cuit, r.supplier);
    return { ok: true, supplierId: r.supplier.id, cuit: r.supplier.cuit, fuente: "memoria" };
  }
  try {
    return await altaProveedorEnDb(db, cuit, r.supplier);
  } catch (e) {
    almacenSuppliers.anteFalloPersistencia(e);
    almacenSuppliers.guardar(cuit, r.supplier);
    return { ok: true, supplierId: r.supplier.id, cuit: r.supplier.cuit, fuente: "memoria" };
  }
}

async function altaProveedorEnDb(db: TenantDb, cuit: string, supplier: Supplier): Promise<AltaProveedorResultado> {
  const previo = await db.select().from(suppliers).where(eq(suppliers.cuit, cuit)).limit(1);
  if (previo[0]) return { ok: false, codigo: "CUIT_EXISTE", error: "proveedor ya existe" };
  // El id de dominio (sup-<cuit>) no es uuid: la copia durable va sin id
  // (defaultRandom) con cuit UNIQUE.
  const filas = await db
    .insert(suppliers)
    .values({
      cuit: supplier.cuit,
      nombre: supplier.nombre,
      email: supplier.email,
      telefono: supplier.telefono,
    })
    .onConflictDoNothing({ target: suppliers.cuit })
    .returning({ id: suppliers.id });
  if (!filas[0]) return { ok: false, codigo: "CUIT_EXISTE", error: "proveedor ya existe" };
  crearAlmacenSuppliers().guardar(cuit, supplier);
  return { ok: true, supplierId: supplier.id, cuit: supplier.cuit, fuente: "db" };
}

export interface ProveedorLista {
  readonly cuit: string;
  readonly nombre: string;
  readonly email: string | null;
  readonly telefono: string | null;
  readonly activo: boolean;
}

// P3-7d (ADR-0020): listado read-only para el picker del panel. DB primero con
// intentarLeer; en single sin base cae a la memoria particionada. En multi sin
// base lanza BaseNoDisponible y la ruta responde 503.
export async function listarProveedores(): Promise<{ proveedores: ProveedorLista[]; fuente: "db" | "memoria" }> {
  const enDb = await intentarLeer((db) =>
    db
      .select({
        cuit: suppliers.cuit,
        nombre: suppliers.nombre,
        email: suppliers.email,
        telefono: suppliers.telefono,
        activo: suppliers.activo,
      })
      .from(suppliers)
      .orderBy(asc(suppliers.cuit)),
  );
  if (enDb !== null) return { proveedores: enDb, fuente: "db" };
  const proveedores = [...crearAlmacenSuppliers().comoMapaSoloLectura().values()]
    .map((s) => ({ cuit: s.cuit, nombre: s.nombre, email: s.email, telefono: s.telefono, activo: s.activo }))
    .sort((a, b) => (a.cuit < b.cuit ? -1 : a.cuit > b.cuit ? 1 : 0));
  return { proveedores, fuente: "memoria" };
}

export interface CrearOrdenRepoInput {
  readonly key: string;
  readonly supplierCuit: string;
  readonly lineas: ReadonlyArray<{ sku: string; qty: number; costoCentavos: bigint }>;
  readonly creadoPor: string;
  readonly ahoraIso: string;
}

export type CrearOrdenRepoResultado =
  | { ok: true; orderId: string; totalCentavos: string; fuente: "db" | "memoria" }
  | { ok: false; codigo: "DUPLICADA" | "NO_VALIDA"; error: string };

// Alta de OC abierta (cerrada jamas se edita). DB-first: pre-check por
// idempotency-key con cabecera+lineas en 1 tx y espejo memoria. En multi sin
// base dbVivaTenant lanza BaseNoDisponible y se propaga (la ruta es 503).
export async function crearOrdenRepo(input: CrearOrdenRepoInput): Promise<CrearOrdenRepoResultado> {
  const ordenes = crearAlmacenPurchaseOrders();
  const ordenVistos = crearAlmacenOrderVistos();
  const r = crearOrden({
    idempotencyKey: input.key,
    supplierCuit: input.supplierCuit,
    lineas: input.lineas.map((l) => ({ sku: l.sku, qty: l.qty, costoCentavos: l.costoCentavos })),
    creadoPor: input.creadoPor,
    ahoraIso: input.ahoraIso,
    vistos: ordenVistos.comoMapaSoloLectura(),
  });
  if (r.status !== 201) return { ok: false, codigo: r.status === 409 ? "DUPLICADA" : "NO_VALIDA", error: r.error };

  const espejo = () => {
    ordenVistos.guardar(input.key, r.orden);
    ordenes.guardar(r.orden.id, r.orden);
  };

  const db = dbVivaTenant();
  if (!db) {
    espejo();
    return { ok: true, orderId: r.orden.id, totalCentavos: r.orden.totalCentavos.toString(), fuente: "memoria" };
  }

  try {
    const previo = await db.select().from(purchaseOrders).where(eq(purchaseOrders.idempotencyKey, input.key)).limit(1);
    if (previo[0]) return { ok: false, codigo: "DUPLICADA", error: "idempotency-key repetida" };
    let repetida = false;
    await db.transaction(async (tx) => {
      const filas = await tx
        .insert(purchaseOrders)
        .values({
          idempotencyKey: input.key,
          supplierCuit: r.orden.supplierCuit,
          estado: r.orden.estado,
          totalCentavos: r.orden.totalCentavos,
          creadoPor: r.orden.creadoPor,
        })
        .onConflictDoNothing({ target: purchaseOrders.idempotencyKey })
        .returning({ id: purchaseOrders.id });
      const fila = filas[0];
      if (!fila) {
        repetida = true;
        return;
      }
      await tx.insert(purchaseOrderLines).values(
        r.orden.lineas.map((l) => ({
          orderId: fila.id,
          sku: l.sku,
          qty: l.qty,
          costoCentavos: l.costoCentavos,
        })),
      );
    });
    if (repetida) return { ok: false, codigo: "DUPLICADA", error: "idempotency-key repetida" };
    espejo();
    return { ok: true, orderId: r.orden.id, totalCentavos: r.orden.totalCentavos.toString(), fuente: "db" };
  } catch (e) {
    ordenVistos.anteFalloPersistencia(e);
    espejo();
    return { ok: true, orderId: r.orden.id, totalCentavos: r.orden.totalCentavos.toString(), fuente: "memoria" };
  }
}

export interface CerrarOrdenRepoInput {
  readonly orderId: string;
  readonly quien: string;
  readonly ahoraIso: string;
}

export type CerrarOrdenRepoResultado =
  | { ok: true; orderId: string; estado: EstadoOC; fuente: "db" | "memoria" }
  | { ok: false; codigo: "INEXISTENTE" | "NO_VALIDA"; error: string };

// Cierre de OC abierta (terminal, auditada). Con memoria caliente se valida
// igual que antes y el cierre se escribe durable; con memoria fria se
// reconstruye el dominio desde cabecera+lineas. En multi sin base propaga.
export async function cerrarOrdenRepo(input: CerrarOrdenRepoInput): Promise<CerrarOrdenRepoResultado> {
  const ordenes = crearAlmacenPurchaseOrders();
  const ordenVistos = crearAlmacenOrderVistos();
  const enMemoria = ordenes.obtener(input.orderId);
  const db = dbVivaTenant();
  if (!db) {
    if (!enMemoria) return { ok: false, codigo: "INEXISTENTE", error: "orden inexistente" };
    const r = cerrarOrden(enMemoria, input.quien, input.ahoraIso);
    if (!r.ok) return { ok: false, codigo: "NO_VALIDA", error: r.error };
    ordenes.guardar(input.orderId, r.orden);
    return { ok: true, orderId: r.orden.id, estado: r.orden.estado, fuente: "memoria" };
  }

  try {
    const base = enMemoria ?? (await reconstruirOrden(db, input.orderId));
    if (!base) return { ok: false, codigo: "INEXISTENTE", error: "orden inexistente" };
    const r = cerrarOrden(base, input.quien, input.ahoraIso);
    if (!r.ok) return { ok: false, codigo: "NO_VALIDA", error: r.error };
    await persistirCierre(db, r.orden);
    ordenVistos.guardar(r.orden.idempotencyKey, r.orden);
    ordenes.guardar(r.orden.id, r.orden);
    return { ok: true, orderId: r.orden.id, estado: r.orden.estado, fuente: "db" };
  } catch (e) {
    ordenes.anteFalloPersistencia(e);
    if (!enMemoria) return { ok: false, codigo: "INEXISTENTE", error: "orden inexistente" };
    const r = cerrarOrden(enMemoria, input.quien, input.ahoraIso);
    if (!r.ok) return { ok: false, codigo: "NO_VALIDA", error: r.error };
    ordenes.guardar(input.orderId, r.orden);
    return { ok: true, orderId: r.orden.id, estado: r.orden.estado, fuente: "memoria" };
  }
}

// El id de dominio es oc-<idempotency-key> (ver crearOrden): inverso definido.
function claveDeOrden(orderId: string): string | null {
  return orderId.startsWith("oc-") ? orderId.slice(3) : null;
}

function dominioDeFilas(
  head: typeof purchaseOrders.$inferSelect,
  lineas: ReadonlyArray<typeof purchaseOrderLines.$inferSelect>,
): PurchaseOrder {
  return Object.freeze({
    id: `oc-${head.idempotencyKey}`,
    idempotencyKey: head.idempotencyKey,
    supplierCuit: head.supplierCuit,
    estado: head.estado as EstadoOC,
    lineas: Object.freeze(
      lineas.map((l) => ({ sku: l.sku, qty: l.qty, costoCentavos: l.costoCentavos })),
    ),
    totalCentavos: head.totalCentavos,
    creadoPor: head.creadoPor,
    creadoEn: head.createdAt.toISOString(),
    cerradoEn: head.cerradoEn ? head.cerradoEn.toISOString() : null,
  });
}

async function reconstruirOrden(db: TenantDb, orderId: string): Promise<PurchaseOrder | null> {
  const key = claveDeOrden(orderId);
  if (!key) return null;
  const heads = await db
    .select()
    .from(purchaseOrders)
    .where(eq(purchaseOrders.idempotencyKey, key))
    .limit(1);
  const head = heads[0];
  if (!head) return null;
  const lineas = await db
    .select()
    .from(purchaseOrderLines)
    .where(eq(purchaseOrderLines.orderId, head.id));
  return dominioDeFilas(head, lineas);
}

async function persistirCierre(db: TenantDb, orden: PurchaseOrder): Promise<void> {
  const tocadas = await db
    .update(purchaseOrders)
    .set({ estado: orden.estado, cerradoEn: orden.cerradoEn ? new Date(orden.cerradoEn) : null })
    .where(eq(purchaseOrders.idempotencyKey, orden.idempotencyKey))
    .returning({ id: purchaseOrders.id });
  if (tocadas[0]) return;
  const filas = await db
    .insert(purchaseOrders)
    .values({
      idempotencyKey: orden.idempotencyKey,
      supplierCuit: orden.supplierCuit,
      estado: orden.estado,
      totalCentavos: orden.totalCentavos,
      creadoPor: orden.creadoPor,
    })
    .onConflictDoNothing({ target: purchaseOrders.idempotencyKey })
    .returning({ id: purchaseOrders.id });
  const fila = filas[0];
  if (!fila) {
    await db
      .update(purchaseOrders)
      .set({ estado: orden.estado, cerradoEn: orden.cerradoEn ? new Date(orden.cerradoEn) : null })
      .where(eq(purchaseOrders.idempotencyKey, orden.idempotencyKey));
    return;
  }
  await db.insert(purchaseOrderLines).values(
    orden.lineas.map((l) => ({
      orderId: fila.id,
      sku: l.sku,
      qty: l.qty,
      costoCentavos: l.costoCentavos,
    })),
  );
}
