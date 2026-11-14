import { and, asc, count, desc, eq, inArray, sql } from "drizzle-orm";
import { products } from "../../db/schema.js";
import { pricingAuditLog } from "../../db/schema-precios.js";
import { dbVivaTenant, intentarLeer, type TenantDb } from "../server-db.js";
import { filaConTenant } from "../tenant-scope.js";
import { listarAltasAlVender } from "../ticket-memoria.js";
import {
  crearAlmacenPrecios,
  crearAlmacenProductos,
  crearListaAuditoria,
  type FichaCatalogo,
} from "./_almacen.js";
import { subconsultaVentas30d, ventasPorProductoMemoria } from "./_ventas-30d.js";
import { actualizarProducto } from "./catalogo.js";

// PRD-STOCK-01 STOCK-S9 (ADR-0107): completar el precio de los productos
// sembrados por rubro (y de los provisorios del alta al vender), más vendidos
// primero. Pendiente = precio 0 y origen de plantilla o alta al vender.

const VENTANA_30_DIAS_MS = 30 * 24 * 60 * 60 * 1000;
const ORIGENES_PENDIENTES = ["plantilla_rubro", "alta_al_vender"] as const;
const PRECIO_MAX_CENTAVOS = 999_999_999;
const MOTIVO_AUDITORIA = "completar precio pendiente";

export interface PendientePrecio {
  readonly sku: string;
  readonly nombre: string;
  readonly vendidas30d: number;
}

export interface PendientesPrecio {
  readonly items: PendientePrecio[];
  readonly total: number;
}

export interface ListarPendientesPrecioInput {
  readonly limite?: number;
  readonly ahora?: Date;
}

export type GuardarPrecioResultado =
  | { ok: true }
  | { ok: false; codigo: "NO_PENDIENTE" | "PRECIO_INVALIDO" };

function esOrigenPendiente(ficha: FichaCatalogo, altas: ReadonlySet<string>): boolean {
  return (
    ficha.origen === "plantilla_rubro" ||
    ficha.origen === "alta_al_vender" ||
    altas.has(ficha.sku)
  );
}

function listarPendientesMemoria(limite: number): PendientesPrecio {
  const vendidas = ventasPorProductoMemoria();
  const altas = new Set(listarAltasAlVender());
  const pendientes = [...crearAlmacenProductos().comoMapaSoloLectura().values()]
    .filter((p) => p.precioCentavos === 0 && esOrigenPendiente(p, altas))
    .map((p) => ({
      sku: p.sku,
      nombre: p.nombre,
      vendidas30d: vendidas.get(p.sku) ?? 0,
    }))
    .sort((a, b) => b.vendidas30d - a.vendidas30d || a.nombre.localeCompare(b.nombre));
  return { items: pendientes.slice(0, limite), total: pendientes.length };
}

async function listarPendientesDb(
  db: TenantDb,
  limite: number,
  desde: Date,
): Promise<PendientesPrecio> {
  const ventas30d = subconsultaVentas30d(db, desde);
  const vendidas = sql<number>`coalesce(${ventas30d.vendidas}, 0)`.mapWith(Number);
  const pendiente = and(
    eq(products.precioCentavos, 0n),
    inArray(products.origen, [...ORIGENES_PENDIENTES]),
  );
  const filas = await db
    .select({ sku: products.sku, nombre: products.nombre, vendidas30d: vendidas })
    .from(products)
    .leftJoin(ventas30d, eq(ventas30d.productId, products.id))
    .where(pendiente)
    .orderBy(desc(vendidas), asc(products.nombre))
    .limit(limite);
  const totales = await db.select({ total: count() }).from(products).where(pendiente);
  return {
    items: filas.map((f) => ({ sku: f.sku, nombre: f.nombre, vendidas30d: f.vendidas30d })),
    total: Number(totales[0]?.total ?? 0),
  };
}

export async function listarPendientesPrecio(
  input: ListarPendientesPrecioInput = {},
): Promise<PendientesPrecio> {
  const limite = Math.max(0, Math.floor(input.limite ?? 5));
  const ahora = input.ahora ?? new Date();
  const desde = new Date(ahora.getTime() - VENTANA_30_DIAS_MS);
  const deDb = await intentarLeer((db) => listarPendientesDb(db, limite, desde));
  return deDb ?? listarPendientesMemoria(limite);
}

function registrarAuditoriaMemoria(sku: string, precioCentavos: number, actor: string): void {
  crearListaAuditoria().agregar({
    accion: "precio_completado",
    sku,
    antes: "0",
    despues: String(precioCentavos),
    actor,
  });
}

async function guardarPrecioMemoria(
  sku: string,
  precioCentavos: number,
  actor: string,
): Promise<GuardarPrecioResultado> {
  const ficha = crearAlmacenProductos().obtener(sku);
  const altas = new Set(listarAltasAlVender());
  if (!ficha || !esOrigenPendiente(ficha, altas) || ficha.precioCentavos !== 0) {
    return { ok: false, codigo: "NO_PENDIENTE" };
  }
  const actualizado = await actualizarProducto(sku, { precioCentavos });
  if (!actualizado.ok) return { ok: false, codigo: "NO_PENDIENTE" };
  registrarAuditoriaMemoria(sku, precioCentavos, actor);
  return { ok: true };
}

// Por qué UPDATE condicionado y no SELECT + actualizarProducto: el SELECT
// previo deja la carrera TOCTOU abierta (dos pedidos pasan el control y los
// dos escriben); la condición viaja en el UPDATE y la auditoría va en la misma
// transacción. En memoria sigue usando actualizarProducto (guardarPrecioMemoria),
// que además espeja el precio. El historial va a pricing_audit_log, que ya
// tiene sku y snapshots antes/después.
export async function guardarPrecioPendiente(
  sku: string,
  precioCentavos: number,
  actor: string,
): Promise<GuardarPrecioResultado> {
  if (
    !Number.isInteger(precioCentavos) ||
    precioCentavos < 1 ||
    precioCentavos > PRECIO_MAX_CENTAVOS
  ) {
    return { ok: false, codigo: "PRECIO_INVALIDO" };
  }
  const db = dbVivaTenant();
  if (!db) return guardarPrecioMemoria(sku, precioCentavos, actor);
  try {
    const resultado = await db.transaction(async (tx): Promise<GuardarPrecioResultado> => {
      const actualizados = await tx
        .update(products)
        .set({ precioCentavos: BigInt(precioCentavos) })
        .where(
          and(
            eq(products.sku, sku),
            eq(products.precioCentavos, 0n),
            inArray(products.origen, [...ORIGENES_PENDIENTES]),
          ),
        )
        .returning({ sku: products.sku });
      if (actualizados.length === 0) return { ok: false, codigo: "NO_PENDIENTE" };
      await tx.insert(pricingAuditLog).values(
        filaConTenant({
          actor,
          sku,
          antes: { texto: "0" },
          despues: { texto: String(precioCentavos) },
          motivo: MOTIVO_AUDITORIA,
        }),
      );
      return { ok: true };
    });
    if (resultado.ok) crearAlmacenPrecios().guardar(sku, precioCentavos);
    return resultado;
  } catch (e) {
    crearAlmacenProductos().anteFalloPersistencia(e);
    return guardarPrecioMemoria(sku, precioCentavos, actor);
  }
}
