import { eq } from "drizzle-orm";
import { products } from "../../db/schema.js";
import { tenantProductSeeds } from "../../db/schema-planes.js";
import { BaseNoDisponible, dbVivaTenant, type TenantDb } from "../server-db.js";
import { tenantActual, tenantPorDefecto } from "../tenant-mode.js";
import { tenantIdAlSellar } from "../tenant-scope.js";
import { marcarProductosSembradosRubro, productosSembradosRubro } from "../eventos-control.js";
import {
  VERSION_PLANTILLAS_PRODUCTOS_RUBRO,
  plantilla_productos_rubro,
  skuPlantilla,
} from "../../modules/onboarding/plantillas-productos-rubro.js";
import {
  crearAlmacenPrecios,
  crearAlmacenProductos,
  crearAlmacenStock,
  type FichaCatalogo,
} from "./_almacen.js";

// PRD-STOCK-01 STOCK-S8/S9 (ADR-0107): siembra del catálogo de productos por
// plantilla de rubro, espejo de siembra-ubicaciones.ts. Sin base resoluble
// (single sin DB) la memoria sigue siendo la fuente.
function dbDe(tenantId: string): TenantDb | null {
  try {
    return dbVivaTenant(tenantId);
  } catch (e) {
    if (e instanceof BaseNoDisponible) return null;
    throw e;
  }
}

export interface RegistroSiembraProductos {
  readonly rubro: string;
  readonly version: string;
  readonly cantidad: number;
}

// Idempotente: la primera siembra gana (ON CONFLICT DO NOTHING).
export async function registrarSiembraProductos(
  tenantId: string,
  r: RegistroSiembraProductos,
): Promise<boolean> {
  const db = dbDe(tenantId);
  if (!db) {
    marcarProductosSembradosRubro(tenantId);
    return false;
  }
  try {
    await db
      .insert(tenantProductSeeds)
      .values({ tenantId, rubro: r.rubro, plantillaVersion: r.version, cantidad: r.cantidad })
      .onConflictDoNothing();
    marcarProductosSembradosRubro(tenantId);
    return true;
  } catch {
    return false;
  }
}

export async function leerSiembraProductos(
  tenantId: string = tenantActual() ?? tenantPorDefecto(),
): Promise<boolean> {
  if (productosSembradosRubro(tenantId)) return true;
  const db = dbDe(tenantId);
  if (!db) return false;
  try {
    const filas = await db
      .select({ t: tenantProductSeeds.tenantId })
      .from(tenantProductSeeds)
      .where(eq(tenantProductSeeds.tenantId, tenantId))
      .limit(1);
    return filas.length > 0;
  } catch {
    return false;
  }
}

class YaSembrado extends Error {}

export type SembrarProductosResultado =
  | { ok: true; cantidad: number }
  | { ok: false; codigo: "YA_SEMBRADO" | "NOMBRE_FUERA_DE_PLANTILLA" };

export async function sembrarProductosRubro(
  tenantId: string,
  rubro: string,
  nombresElegidos: readonly string[],
): Promise<SembrarProductosResultado> {
  const permitidos = new Set(plantilla_productos_rubro(rubro).productos);
  const nombres = [...new Set(nombresElegidos.map((n) => n.trim()).filter((n) => n.length > 0))];
  if (nombres.some((n) => !permitidos.has(n))) {
    return { ok: false, codigo: "NOMBRE_FUERA_DE_PLANTILLA" };
  }
  if (await leerSiembraProductos(tenantId)) return { ok: false, codigo: "YA_SEMBRADO" };

  const filas = nombres.map((nombre) => ({ sku: skuPlantilla(nombre), nombre }));
  const db = dbDe(tenantId);
  if (db) {
    // La fila de seeds se inserta primero: si otra pestaña ganó la carrera,
    // el ON CONFLICT no devuelve fila y la tx se revierte sin crear productos.
    let cantidad: number;
    try {
      cantidad = await db.transaction(async (tx) => {
        const seed = await tx
          .insert(tenantProductSeeds)
          .values({ tenantId, rubro, plantillaVersion: VERSION_PLANTILLAS_PRODUCTOS_RUBRO, cantidad: 0 })
          .onConflictDoNothing()
          .returning({ t: tenantProductSeeds.tenantId });
        if (seed.length === 0) throw new YaSembrado();
        const tidFila = tenantIdAlSellar() ?? tenantId;
        let creados = 0;
        if (filas.length > 0) {
          const insertados = await tx
            .insert(products)
            .values(
              filas.map((f) => ({
                sku: f.sku,
                nombre: f.nombre,
                precioCentavos: 0n,
                stockActual: 0,
                origen: "plantilla_rubro",
                tenantId: tidFila,
              })),
            )
            .onConflictDoNothing({ target: [products.tenantId, products.sku] })
            .returning({ sku: products.sku });
          creados = insertados.length;
        }
        await tx.update(tenantProductSeeds).set({ cantidad: creados }).where(eq(tenantProductSeeds.tenantId, tenantId));
        return creados;
      });
    } catch (e) {
      if (e instanceof YaSembrado) {
        marcarProductosSembradosRubro(tenantId);
        return { ok: false, codigo: "YA_SEMBRADO" };
      }
      throw e;
    }
    marcarProductosSembradosRubro(tenantId);
    return { ok: true, cantidad };
  }

  const catalogo = crearAlmacenProductos();
  const existencias = crearAlmacenStock();
  const precios = crearAlmacenPrecios();
  let creados = 0;
  for (const fila of filas) {
    if (catalogo.contiene(fila.sku)) continue;
    const ficha: FichaCatalogo = {
      sku: fila.sku,
      nombre: fila.nombre,
      precioCentavos: 0,
      origen: "plantilla_rubro",
      sector: "general",
      locationId: null,
      archivado: false,
      controlaVencimiento: false,
      estado: "activo",
      minStock: null,
      reorderQty: null,
    };
    catalogo.guardar(fila.sku, ficha);
    if (!existencias.contiene(fila.sku)) existencias.guardar(fila.sku, 0);
    precios.guardar(fila.sku, 0);
    creados += 1;
  }
  marcarProductosSembradosRubro(tenantId);
  return { ok: true, cantidad: creados };
}
