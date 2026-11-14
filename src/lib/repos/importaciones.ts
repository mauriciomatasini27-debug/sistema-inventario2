import { randomUUID } from "node:crypto";
import { eq, inArray, sql } from "drizzle-orm";
import { products, stockImports, stockLots, stockMovements } from "../../db/schema.js";
import { BaseNoDisponible, dbVivaTenant, type TenantDb } from "../server-db.js";
import { dondeTenant, filaConTenant } from "../tenant-scope.js";
import { altaProducto } from "./catalogo.js";
import { crearLote } from "./lotes.js";
import { crearAlmacenProductos, importacionesEnMemoria } from "./_almacen.js";

// El fast path y el catch del constraint único resuelven la carrera entre dos
// confirmaciones con la misma Idempotency-Key dentro de la misma transacción.

export type AplicarImportacionEntrada = {
  idemKey: string;
  archivo: { nombre: string; sha256: string; formato: "csv" | "xlsx" };
  creadoPor: string;
  filasValidas: readonly {
    sku: string;
    nombre: string;
    precioCentavos: number;
    cantidad: number;
    sector: string;
  }[];
  totalFilas: number;
  filasError: number;
};

export type ImportacionRegistrada = {
  id: string;
  idemKey: string;
  archivoNombre: string;
  archivoSha256: string;
  formato: "csv" | "xlsx";
  filasTotal: number;
  filasImportadas: number;
  filasNuevas: number;
  filasExistentes: number;
  filasError: number;
  movimientos: number;
  creadoPor: string;
  creadoEn: string;
};

export type AplicarImportacionResultado =
  | { estado: "nueva"; importacion: ImportacionRegistrada }
  | { estado: "reintento"; importacion: ImportacionRegistrada }
  | { estado: "conflicto"; importacion: ImportacionRegistrada };

export type EtapaImportacion = "insert-importacion" | "alta-producto" | "crear-lote" | "transaccion";

export class ImportacionPersistenciaError extends Error {
  readonly stage: EtapaImportacion;

  constructor(stage: EtapaImportacion, causa: unknown) {
    const detalle = causa instanceof Error ? causa.message : String(causa);
    super(`importación falló en ${stage}: ${detalle}`, { cause: causa });
    this.name = "ImportacionPersistenciaError";
    this.stage = stage;
  }
}

type FilaStockImport = typeof stockImports.$inferSelect;

function aRegistrada(fila: FilaStockImport): ImportacionRegistrada {
  return {
    id: fila.id,
    idemKey: fila.idemKey,
    archivoNombre: fila.archivoNombre,
    archivoSha256: fila.archivoSha256,
    formato: fila.formato === "xlsx" ? "xlsx" : "csv",
    filasTotal: fila.filasTotal,
    filasImportadas: fila.filasImportadas,
    filasNuevas: fila.filasNuevas,
    filasExistentes: fila.filasExistentes,
    filasError: fila.filasError,
    movimientos: fila.movimientos,
    creadoPor: fila.creadoPor,
    creadoEn: fila.creadoEn.toISOString(),
  };
}

function resultadoExistente(
  importacion: ImportacionRegistrada,
  entrada: AplicarImportacionEntrada,
): AplicarImportacionResultado {
  return importacion.archivoSha256.toLowerCase() === entrada.archivo.sha256.toLowerCase()
    ? { estado: "reintento", importacion }
    : { estado: "conflicto", importacion };
}

function esChoqueIdemKeyImportacion(e: unknown): boolean {
  const restriccion = (e as { constraint_name?: unknown }).constraint_name;
  if (typeof restriccion === "string") return restriccion === "stock_imports_idem_key_unique";
  const mensaje = e instanceof Error ? e.message : String(e);
  return mensaje.includes("stock_imports_idem_key_unique");
}

async function buscarPorIdemKey(
  db: TenantDb,
  idemKey: string,
): Promise<ImportacionRegistrada | null> {
  const w = dondeTenant(stockImports.tenantId, eq(stockImports.idemKey, idemKey)) ?? eq(stockImports.idemKey, idemKey);
  const filas = await db.select().from(stockImports).where(w).limit(1);
  const fila = filas[0];
  return fila ? aRegistrada(fila) : null;
}

export async function aplicarImportacionStock(
  entrada: AplicarImportacionEntrada,
): Promise<AplicarImportacionResultado> {
  const db = dbVivaTenant();
  if (!db) return aplicarEnMemoria(entrada);

  const existente = await buscarPorIdemKey(db, entrada.idemKey);
  if (existente) return resultadoExistente(existente, entrada);

  try {
    const importacion = await db.transaction(async (tx) => {
      const skus = entrada.filasValidas.map((f) => f.sku);
      const wProd =
        skus.length === 0
          ? undefined
          : dondeTenant(products.tenantId, inArray(products.sku, skus)) ?? inArray(products.sku, skus);
      const encontrados =
        skus.length === 0
          ? []
          : await tx.select({ sku: products.sku, stockActual: products.stockActual }).from(products).where(wProd!);
      const existentes = new Map<string, number>(encontrados.map((p) => [p.sku.toUpperCase(), p.stockActual]));
      const nuevas = entrada.filasValidas.filter((f) => !existentes.has(f.sku));
      const filasNuevas = nuevas.length;
      const filasExistentes = entrada.filasValidas.length - filasNuevas;
      const creadoEn = new Date();

      const insertadas = await tx
        .insert(stockImports)
        .values(
          filaConTenant({
            idemKey: entrada.idemKey,
            archivoNombre: entrada.archivo.nombre,
            archivoSha256: entrada.archivo.sha256,
            formato: entrada.archivo.formato,
            filasTotal: entrada.totalFilas,
            filasImportadas: entrada.filasValidas.length,
            filasNuevas,
            filasExistentes,
            filasError: entrada.filasError,
            movimientos: entrada.filasValidas.length,
            creadoPor: entrada.creadoPor,
            creadoEn,
          }),
        )
        .returning({ id: stockImports.id });
      const idImportacion = insertadas[0]?.id;
      if (!idImportacion) throw new ImportacionPersistenciaError("insert-importacion", new Error("sin id"));

      if (nuevas.length > 0) {
        await tx
          .insert(products)
          .values(
            nuevas.map((f) =>
              filaConTenant({
                sku: f.sku,
                nombre: f.nombre,
                precioCentavos: BigInt(f.precioCentavos),
                stockActual: 0,
                sector: f.sector,
              }),
            ),
          )
          .onConflictDoNothing();
      }

      for (const fila of entrada.filasValidas) {
        const lotes = await tx
          .insert(stockLots)
          .values(
            filaConTenant({
              sku: fila.sku,
              cantidad: fila.cantidad,
              cantidadRestante: fila.cantidad,
              venceEl: null,
              costoCentavos: 0n,
            }),
          )
          .returning({ id: stockLots.id });
        const idLote = lotes[0]?.id;
        if (!idLote) throw new ImportacionPersistenciaError("crear-lote", new Error("stock_lots sin id"));
        await tx.insert(stockMovements).values(
          filaConTenant({
            idemKey: `import:${idImportacion}:${fila.sku}`,
            sku: fila.sku,
            loteId: idLote,
            delta: fila.cantidad,
            tipo: "ALTA",
            motivo: "importacion",
          }),
        );
        const wSku = dondeTenant(products.tenantId, eq(products.sku, fila.sku)) ?? eq(products.sku, fila.sku);
        await tx
          .update(products)
          .set({ stockActual: sql`${products.stockActual} + ${fila.cantidad}` })
          .where(wSku);
      }

      return {
        id: idImportacion,
        idemKey: entrada.idemKey,
        archivoNombre: entrada.archivo.nombre,
        archivoSha256: entrada.archivo.sha256,
        formato: entrada.archivo.formato,
        filasTotal: entrada.totalFilas,
        filasImportadas: entrada.filasValidas.length,
        filasNuevas,
        filasExistentes,
        filasError: entrada.filasError,
        movimientos: entrada.filasValidas.length,
        creadoPor: entrada.creadoPor,
        creadoEn: creadoEn.toISOString(),
      } satisfies ImportacionRegistrada;
    });
    return { estado: "nueva", importacion };
  } catch (e) {
    if (esChoqueIdemKeyImportacion(e)) {
      let rival: ImportacionRegistrada | null;
      try {
        rival = await buscarPorIdemKey(db, entrada.idemKey);
      } catch (relectura) {
        throw new ImportacionPersistenciaError("insert-importacion", relectura);
      }
      if (rival) return resultadoExistente(rival, entrada);
      throw new ImportacionPersistenciaError("insert-importacion", e);
    }
    if (e instanceof BaseNoDisponible) throw e;
    if (e instanceof ImportacionPersistenciaError) throw e;
    throw new ImportacionPersistenciaError("transaccion", e);
  }
}

async function aplicarEnMemoria(entrada: AplicarImportacionEntrada): Promise<AplicarImportacionResultado> {
  const importaciones = importacionesEnMemoria();
  const previa = importaciones.get(entrada.idemKey);
  if (previa) return resultadoExistente(previa, entrada);

  const productos = crearAlmacenProductos();
  const nuevas = entrada.filasValidas.filter((f) => !productos.contiene(f.sku));
  const idImportacion = randomUUID();
  const creadoEn = new Date().toISOString();

  for (const fila of nuevas) {
    const alta = await altaProducto({
      sku: fila.sku,
      nombre: fila.nombre,
      precioCentavos: fila.precioCentavos,
      sector: fila.sector,
      controlaVencimiento: false,
    });
    if (!alta.ok) throw new ImportacionPersistenciaError("alta-producto", new Error(alta.codigo));
  }

  for (const fila of entrada.filasValidas) {
    const lote = await crearLote({
      sku: fila.sku,
      cantidad: fila.cantidad,
      venceEl: null,
      costoCentavos: 0,
      controlaVencimiento: false,
      idemKey: `import:${idImportacion}:${fila.sku}`,
    });
    if (!lote.ok) throw new ImportacionPersistenciaError("crear-lote", new Error(lote.codigo));
  }

  const importacion: ImportacionRegistrada = {
    id: idImportacion,
    idemKey: entrada.idemKey,
    archivoNombre: entrada.archivo.nombre,
    archivoSha256: entrada.archivo.sha256,
    formato: entrada.archivo.formato,
    filasTotal: entrada.totalFilas,
    filasImportadas: entrada.filasValidas.length,
    filasNuevas: nuevas.length,
    filasExistentes: entrada.filasValidas.length - nuevas.length,
    filasError: entrada.filasError,
    movimientos: entrada.filasValidas.length,
    creadoPor: entrada.creadoPor,
    creadoEn,
  };
  importaciones.set(entrada.idemKey, importacion);
  return { estado: "nueva", importacion };
}
