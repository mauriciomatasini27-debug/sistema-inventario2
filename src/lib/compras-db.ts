import { eq } from "drizzle-orm";
import { getTenantDb } from "./db.js";
import {
  purchaseOrderLines,
  purchaseOrders,
  supplierDrafts,
  supplierInvoices,
  supplierPayments,
} from "../db/schema-proveedores.js";
import type {
  Borrador,
  ConfianzaPorCampo,
  Factura,
  ItemBorrador,
  PagoProveedor,
} from "../modules/purchases/facturas.js";
import type { EstadoOC, PurchaseOrder } from "../modules/purchases/proveedores.js";
import type { OrdenMatchable } from "../modules/purchases/matching.js";
import { diaUTC } from "./fecha-ar.js";

export type TenantDb = ReturnType<typeof getTenantDb>;

// PERS2-S2: la disponibilidad de la base la resuelve `dbVivaTenant` en
// server-db.ts (null en single, BaseNoDisponible en multi). Este módulo ya no
// trae su propio dbViva().

// ---------------------------------------------------------------------------
// Mapeo dominio <-> durable. Ids de dominio (borr-<key>, fac-<key>, oc-<key>,
// pag-<key>) no son uuid: las tablas generan uuid propio y las referencias
// se resuelven por idempotency-key. jsonb no admite bigint: los centavos van
// como string decimal y vuelven con BigInt.
// ---------------------------------------------------------------------------

export function itemsADb(items: ReadonlyArray<ItemBorrador>) {
  return items.map((it) => ({
    sku: it.sku,
    cantidad: it.cantidad,
    subtotal_centavos: it.subtotalCentavos.toString(),
  }));
}

export function itemsDeDb(raw: unknown): ItemBorrador[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((it) => {
    const o = (it ?? {}) as { sku?: unknown; cantidad?: unknown; subtotal_centavos?: unknown };
    return {
      sku: typeof o.sku === "string" ? o.sku : null,
      cantidad: typeof o.cantidad === "number" ? o.cantidad : 0,
      subtotalCentavos: BigInt(typeof o.subtotal_centavos === "string" ? o.subtotal_centavos : "0"),
    };
  });
}

export function confianzaDeDb(raw: unknown): ConfianzaPorCampo {
  const o = (raw ?? {}) as Record<string, unknown>;
  const una = (v: unknown): ConfianzaCampo => (v === "alta" || v === "media" || v === "baja" ? v : "baja");
  return { cuit: una(o["cuit"]), fecha: una(o["fecha"]), total: una(o["total"]) };
}

type ConfianzaCampo = ConfianzaPorCampo["cuit"];

export type FilaBorrador = typeof supplierDrafts.$inferSelect;
export type FilaFactura = typeof supplierInvoices.$inferSelect;
export type FilaPago = typeof supplierPayments.$inferSelect;
export type FilaCabeceraOC = typeof purchaseOrders.$inferSelect;

async function facturaIdDominioDeUuid(db: TenantDb, uuid: string): Promise<string | null> {
  const filas = await db
    .select({ idempotencyKey: supplierInvoices.idempotencyKey })
    .from(supplierInvoices)
    .where(eq(supplierInvoices.id, uuid))
    .limit(1);
  const fila = filas[0];
  return fila ? `fac-${fila.idempotencyKey}` : null;
}

export function borradorDeFila(fila: FilaBorrador, facturaIdDominio: string | null): Borrador {
  return Object.freeze({
    id: `borr-${fila.idempotencyKey}`,
    idempotencyKey: fila.idempotencyKey,
    origen: fila.origen as Borrador["origen"],
    bytesRef: fila.bytesRef,
    cuit: fila.cuit,
    nombreProveedor: fila.nombreProveedor,
    fechaIso: fila.fechaIso,
    totalCentavos: fila.totalCentavos,
    items: Object.freeze(itemsDeDb(fila.items)),
    confianza: confianzaDeDb(fila.confianza),
    estado: fila.estado as Borrador["estado"],
    fotoPendiente: fila.fotoPendiente,
    confirmadoPor: fila.confirmadoPor,
    facturaId: facturaIdDominio,
    creadoEn: fila.createdAt.toISOString(),
    venceAt: fila.venceAt.toISOString(),
  });
}

export async function leerBorradorPorKey(
  db: TenantDb,
  key: string,
): Promise<{ fila: FilaBorrador; borrador: Borrador } | null> {
  const filas = await db
    .select()
    .from(supplierDrafts)
    .where(eq(supplierDrafts.idempotencyKey, key))
    .limit(1);
  const fila = filas[0];
  if (!fila) return null;
  const facturaId = fila.facturaId ? await facturaIdDominioDeUuid(db, fila.facturaId) : null;
  return { fila, borrador: borradorDeFila(fila, facturaId) };
}

export function leerBorradorPorId(
  db: TenantDb,
  draftId: string,
): Promise<{ fila: FilaBorrador; borrador: Borrador } | null> {
  if (!draftId.startsWith("borr-")) return Promise.resolve(null);
  return leerBorradorPorKey(db, draftId.slice(5));
}

export function facturaDeFila(
  fila: FilaFactura,
  draftIdDominio: string,
  compensatoriaDeDominio: string | null,
): Factura {
  return Object.freeze({
    id: `fac-${fila.idempotencyKey}`,
    idempotencyKey: fila.idempotencyKey,
    draftId: draftIdDominio,
    supplierCuit: fila.supplierCuit,
    nombreProveedor: fila.nombreProveedor,
    tipo: fila.tipo as Factura["tipo"],
    fechaIso: fila.fechaIso,
    totalCentavos: fila.totalCentavos,
    items: Object.freeze(itemsDeDb(fila.items)),
    compensatoriaDe: compensatoriaDeDominio,
    creadoPor: fila.creadoPor,
    creadoEn: fila.createdAt.toISOString(),
  });
}

async function borradorIdDominioDeUuid(db: TenantDb, uuid: string): Promise<string | null> {
  const filas = await db
    .select({ idempotencyKey: supplierDrafts.idempotencyKey })
    .from(supplierDrafts)
    .where(eq(supplierDrafts.id, uuid))
    .limit(1);
  const fila = filas[0];
  return fila ? `borr-${fila.idempotencyKey}` : null;
}

export async function leerFacturaPorKey(
  db: TenantDb,
  key: string,
): Promise<{ fila: FilaFactura; factura: Factura } | null> {
  const filas = await db
    .select()
    .from(supplierInvoices)
    .where(eq(supplierInvoices.idempotencyKey, key))
    .limit(1);
  const fila = filas[0];
  if (!fila) return null;
  const draftId = fila.draftId
    ? ((await borradorIdDominioDeUuid(db, fila.draftId)) ?? `borr-${fila.idempotencyKey}`)
    : `borr-${fila.idempotencyKey}`;
  const compensatoriaDe = fila.compensatoriaDe
    ? await facturaIdDominioDeUuid(db, fila.compensatoriaDe)
    : null;
  return { fila, factura: facturaDeFila(fila, draftId, compensatoriaDe) };
}

export function leerFacturaPorId(
  db: TenantDb,
  facturaId: string,
): Promise<{ fila: FilaFactura; factura: Factura } | null> {
  if (!facturaId.startsWith("fac-")) return Promise.resolve(null);
  return leerFacturaPorKey(db, facturaId.slice(4));
}

export function pagoDeFila(fila: FilaPago, facturaIdDominio: string | null): PagoProveedor {
  return Object.freeze({
    id: `pag-${fila.idempotencyKey}`,
    idempotencyKey: fila.idempotencyKey,
    facturaId: facturaIdDominio,
    supplierCuit: fila.supplierCuit,
    montoCentavos: fila.montoCentavos,
    metodo: fila.metodo as PagoProveedor["metodo"],
    creadoPor: fila.creadoPor,
    // La tabla no guarda fecha_iso (solo created_at): se deriva el día.
    fechaIso: diaUTC(fila.createdAt),
    creadoEn: fila.createdAt.toISOString(),
  });
}

export async function leerPagoPorKey(
  db: TenantDb,
  key: string,
): Promise<{ fila: FilaPago; pago: PagoProveedor } | null> {
  const filas = await db
    .select()
    .from(supplierPayments)
    .where(eq(supplierPayments.idempotencyKey, key))
    .limit(1);
  const fila = filas[0];
  if (!fila) return null;
  const facturaId = fila.facturaId ? await facturaIdDominioDeUuid(db, fila.facturaId) : null;
  return { fila, pago: pagoDeFila(fila, facturaId) };
}

export async function leerFacturasPorCuit(db: TenantDb, cuit: string): Promise<Factura[]> {
  const filas = await db
    .select()
    .from(supplierInvoices)
    .where(eq(supplierInvoices.supplierCuit, cuit));
  const out: Factura[] = [];
  for (const fila of filas) {
    const draftId = fila.draftId
      ? ((await borradorIdDominioDeUuid(db, fila.draftId)) ?? `borr-${fila.idempotencyKey}`)
      : `borr-${fila.idempotencyKey}`;
    const compensatoriaDe = fila.compensatoriaDe
      ? await facturaIdDominioDeUuid(db, fila.compensatoriaDe)
      : null;
    out.push(facturaDeFila(fila, draftId, compensatoriaDe));
  }
  return out;
}

export async function leerPagosPorCuit(db: TenantDb, cuit: string): Promise<PagoProveedor[]> {
  const filas = await db.select().from(supplierPayments).where(eq(supplierPayments.supplierCuit, cuit));
  const out: PagoProveedor[] = [];
  for (const fila of filas) {
    const facturaId = fila.facturaId ? await facturaIdDominioDeUuid(db, fila.facturaId) : null;
    out.push(pagoDeFila(fila, facturaId));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Órdenes para matching: matchables livianos (sin líneas) + uuid durable por
// id de dominio (el match_log guarda order_id uuid).
// ---------------------------------------------------------------------------

export interface OrdenDb {
  readonly uuid: string;
  readonly matchable: OrdenMatchable;
}

export async function leerOrdenesDb(db: TenantDb): Promise<OrdenDb[]> {
  const heads = await db.select().from(purchaseOrders);
  return heads.map((h) => ({
    uuid: h.id,
    matchable: {
      id: `oc-${h.idempotencyKey}`,
      supplierCuit: h.supplierCuit,
      estado: h.estado as EstadoOC,
      totalCentavos: h.totalCentavos,
    },
  }));
}

// Unión memoria (caliente, incluye altas durante cortes) + DB (fría).
export function unionOrdenes(
  memoria: Iterable<Pick<PurchaseOrder, "id" | "supplierCuit" | "estado" | "totalCentavos">>,
  db: ReadonlyArray<OrdenDb>,
): OrdenMatchable[] {
  const out = new Map<string, OrdenMatchable>();
  for (const o of memoria) {
    out.set(o.id, {
      id: o.id,
      supplierCuit: o.supplierCuit,
      estado: o.estado,
      totalCentavos: o.totalCentavos,
    });
  }
  for (const d of db) {
    if (!out.has(d.matchable.id)) out.set(d.matchable.id, d.matchable);
  }
  return [...out.values()];
}

export function ordenCompletaDeFilas(
  head: FilaCabeceraOC,
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

export async function leerOrdenCompleta(
  db: TenantDb,
  orderId: string,
): Promise<PurchaseOrder | null> {
  if (!orderId.startsWith("oc-")) return null;
  const heads = await db
    .select()
    .from(purchaseOrders)
    .where(eq(purchaseOrders.idempotencyKey, orderId.slice(3)))
    .limit(1);
  const head = heads[0];
  if (!head) return null;
  const lineas = await db
    .select()
    .from(purchaseOrderLines)
    .where(eq(purchaseOrderLines.orderId, head.id));
  return ordenCompletaDeFilas(head, lineas);
}
