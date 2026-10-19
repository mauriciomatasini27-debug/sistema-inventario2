import { randomUUID } from "node:crypto";
import { desc, eq, inArray, sql } from "drizzle-orm";
import { productCodes, products, locations, productPhotos } from "../../db/schema.js";
import { dbVivaTenant, type TenantDb } from "../server-db.js";
import { coincideDifuso, inicialesProducto } from "../../modules/inventario/busqueda.js";
import { normalizarSector } from "../../modules/inventario/sectores.js";
import {
  crearAlmacenCodigos,
  crearAlmacenFotosProducto,
  crearAlmacenPrecios,
  crearAlmacenProductos,
  crearAlmacenSectores,
  crearAlmacenStock,
  crearAlmacenUbicaciones,
  crearListaAuditoria,
  type AlmacenVivo,
  type FichaCatalogo,
  type UbicacionCatalogo,
} from "./_almacen.js";

// PERS2-S23 (ADR-0062): catálogo DB-first, memoria solo en single sin base.

export type FichaProducto = FichaCatalogo;
export type Ubicacion = UbicacionCatalogo;

// Por qué vista de listado: la ficha guardada no lleva presentación; las
// iniciales y la foto se derivan al leer para no duplicar estado.
export type FichaListado = FichaProducto & { iniciales: string; fotoUrl: string | null };

// Por qué código + mensaje: el driver expone el 23505 y el nombre del índice via mensaje.
function esChoqueUnicoUbicacion(e: unknown): boolean {
  if (typeof (e as { code?: unknown }).code === "string" && (e as { code: string }).code === "23505") return true;
  const msg = e instanceof Error ? e.message : String(e);
  return msg.includes("locations_nombre_lower_unique");
}

function espejarUbicacion(u: Ubicacion, ubicaciones: AlmacenVivo<Ubicacion>): void {
  ubicaciones.guardar(u.id, u);
}

function fichaDeFila(
  f: { sku: string; nombre: string; precioCentavos: bigint },
  sector: string,
  locationId: string | null = null,
  umbrales: { minStock: number | null; reorderQty: number | null } | null = null,
): FichaProducto {
  return {
    sku: f.sku,
    nombre: f.nombre,
    precioCentavos: Number(f.precioCentavos),
    sector,
    locationId,
    archivado: false,
    controlaVencimiento: false,
    estado: "activo",
    minStock: umbrales?.minStock ?? null,
    reorderQty: umbrales?.reorderQty ?? null,
  };
}

function esColumnaLocationFaltante(e: unknown): boolean {
  if (typeof (e as { code?: unknown }).code === "string" && (e as { code: string }).code === "42703") return true;
  const msg = e instanceof Error ? e.message : String(e);
  return msg.includes("location_id");
}

async function ubicacionesDb(db: TenantDb, skus: readonly string[]): Promise<Map<string, string | null>> {
  const mapa = new Map<string, string | null>();
  if (skus.length === 0) return mapa;
  try {
    const filas = await db
      .select({ sku: products.sku, locationId: products.locationId })
      .from(products)
      .where(inArray(products.sku, [...skus]));
    for (const f of filas) mapa.set(f.sku, f.locationId);
  } catch (e) {
    if (!esColumnaLocationFaltante(e)) throw e;
  }
  return mapa;
}

async function fijarLocationDb(db: TenantDb, sku: string, locationId: string | null): Promise<void> {
  try {
    await db.update(products).set({ locationId }).where(eq(products.sku, sku));
  } catch (e) {
    if (!esColumnaLocationFaltante(e)) throw e;
  }
}

// Por qué defensivo: mismo drift conocido que location_id; una base de
// tenant sin la migración 0027 no trae min_stock/reorder_qty y los umbrales
// quedan solo en el espejo en memoria en vez de romper la lectura.
function esColumnaUmbralFaltante(e: unknown): boolean {
  if (typeof (e as { code?: unknown }).code === "string" && (e as { code: string }).code === "42703") return true;
  const msg = e instanceof Error ? e.message : String(e);
  return msg.includes("min_stock") || msg.includes("reorder_qty");
}

async function umbralesDb(db: TenantDb, skus: readonly string[]): Promise<Map<string, { minStock: number | null; reorderQty: number | null }>> {
  const mapa = new Map<string, { minStock: number | null; reorderQty: number | null }>();
  if (skus.length === 0) return mapa;
  try {
    const filas = await db
      .select({ sku: products.sku, minStock: products.minStock, reorderQty: products.reorderQty })
      .from(products)
      .where(inArray(products.sku, [...skus]));
    for (const f of filas) mapa.set(f.sku, { minStock: f.minStock, reorderQty: f.reorderQty });
  } catch (e) {
    if (!esColumnaUmbralFaltante(e)) throw e;
  }
  return mapa;
}

async function fijarUmbralesDb(db: TenantDb, sku: string, umbrales: { minStock: number | null; reorderQty: number | null }): Promise<void> {
  try {
    await db.update(products).set(umbrales).where(eq(products.sku, sku));
  } catch (e) {
    if (!esColumnaUmbralFaltante(e)) throw e;
  }
}

// ALR-S1: min_stock entero >= 0 (null limpia), reorder_qty entero > 0
// (null limpia). El API valida con zod; el repo revalida para quien lo
// llame directo. Devuelve el mensaje o null cuando es válido.
export function validarUmbrales(minStock: number | null | undefined, reorderQty: number | null | undefined): string | null {
  if (minStock !== undefined && minStock !== null && (!Number.isInteger(minStock) || minStock < 0)) {
    return "min_stock debe ser entero >= 0 o null";
  }
  if (reorderQty !== undefined && reorderQty !== null && (!Number.isInteger(reorderQty) || reorderQty <= 0)) {
    return "reorder_qty debe ser entero > 0 o null";
  }
  return null;
}

async function ubicacionExiste(id: string): Promise<boolean> {
  return (await listarUbicaciones()).some((u) => u.id === id);
}

// Por qué última foto: el alta agrega al final y no hay borrado; el espejo en
// memoria ya trae ese orden.
function fotoMemoria(sku: string): string | null {
  const arr = crearAlmacenFotosProducto().obtener(sku) ?? [];
  return arr.length > 0 ? (arr[arr.length - 1]?.url ?? null) : null;
}

function conPresentacion(ficha: FichaProducto, fotoUrl: string | null): FichaListado {
  return { ...ficha, iniciales: inicialesProducto(ficha.nombre), fotoUrl };
}

// Por qué orden por creada: la foto vigente es la carga más reciente del sku.
async function fotosRecientesDb(db: TenantDb, skus: readonly string[]): Promise<Map<string, string>> {
  const recientes = new Map<string, string>();
  if (skus.length === 0) return recientes;
  const filas = await db
    .select({ sku: productPhotos.sku, url: productPhotos.url })
    .from(productPhotos)
    .where(inArray(productPhotos.sku, [...skus]))
    .orderBy(desc(productPhotos.createdAt));
  for (const f of filas) {
    if (!recientes.has(f.sku)) recientes.set(f.sku, f.url);
  }
  return recientes;
}

// Por qué doble fuente: la DB puede no tener la foto (alta vieja) y el espejo
// en memoria sí; el cliente muestra placeholder solo si ambas faltan.
async function presentarDb(db: TenantDb, fichas: FichaProducto[]): Promise<FichaListado[]> {
  const recientes = await fotosRecientesDb(
    db,
    fichas.map((f) => f.sku),
  );
  return fichas.map((f) => conPresentacion(f, recientes.get(f.sku) ?? fotoMemoria(f.sku)));
}

// Por qué espejo: la memoria del proceso sigue hasta el retiro (P2.2).

export async function buscarProductoPorCodigo(codigo: string): Promise<{ ficha: FichaListado; fuente: "db" | "memoria" } | null> {
  const productos = crearAlmacenProductos();
  const codigos = crearAlmacenCodigos();
  const cod = codigo.trim().toUpperCase();
  const enMemoria = codigos.obtener(cod);
  const memoria = enMemoria ? (productos.obtener(enMemoria) ?? null) : null;
  const db = dbVivaTenant();
  if (!db) return memoria ? { ficha: conPresentacion(memoria, fotoMemoria(memoria.sku)), fuente: "memoria" } : null;
  try {
    const filas = await db.select().from(productCodes).where(eq(productCodes.codigo, cod)).limit(1);
    const fila = filas[0];
    if (!fila) return memoria ? { ficha: conPresentacion(memoria, fotoMemoria(memoria.sku)), fuente: "memoria" } : null;
    const prods = await db
      .select({ sku: products.sku, nombre: products.nombre, precioCentavos: products.precioCentavos, sector: products.sector })
      .from(products)
      .where(eq(products.sku, fila.sku))
      .limit(1);
    const p = prods[0];
    if (!p) return memoria ? { ficha: conPresentacion(memoria, fotoMemoria(memoria.sku)), fuente: "memoria" } : null;
    // Por qué estado de memoria: products no tiene columna estado (CAT-S2,
    // igual que archivado); sin esto un alta pendiente_revision se leería activo.
    // Por qué ubicación de memoria primero: el espejo es la escritura más
    // reciente del proceso; la DB solo rellena fichas sin espejo.
    const enMem = productos.obtener(p.sku);
    const ubicDb = enMem ? null : (await ubicacionesDb(db, [p.sku])).get(p.sku) ?? null;
    // Por qué umbrales con la misma precedencia: el espejo trae la
    // escritura más reciente del proceso; la DB rellena lo sin espejo.
    const umDb = enMem ? null : (await umbralesDb(db, [p.sku])).get(p.sku) ?? null;
    const ficha: FichaProducto = {
      ...fichaDeFila(p, enMem?.sector ?? normalizarSector(p.sector), enMem?.locationId ?? ubicDb, enMem ? { minStock: enMem.minStock, reorderQty: enMem.reorderQty } : umDb),
      estado: enMem?.estado ?? "activo",
    };
    const recientes = await fotosRecientesDb(db, [ficha.sku]);
    return { ficha: conPresentacion(ficha, recientes.get(ficha.sku) ?? fotoMemoria(ficha.sku)), fuente: "db" };
  } catch (e) {
    productos.anteFalloPersistencia(e);
    return memoria ? { ficha: conPresentacion(memoria, fotoMemoria(memoria.sku)), fuente: "memoria" } : null;
  }
}

export async function listarProductos(q: string): Promise<{ fichas: FichaListado[]; fuente: "db" | "memoria" }> {
  const productos = crearAlmacenProductos();
  const existencias = crearAlmacenStock();
  const precios = crearAlmacenPrecios();
  const db = dbVivaTenant();
  if (!db)
    return {
      fichas: filtrar([...productos.comoMapaSoloLectura().values()], q, existencias, precios).map((f) =>
        conPresentacion(f, fotoMemoria(f.sku)),
      ),
      fuente: "memoria",
    };
  try {
    const filas = await db
      .select({ sku: products.sku, nombre: products.nombre, precioCentavos: products.precioCentavos, sector: products.sector })
      .from(products);
    const union = new Map<string, FichaProducto>();
    for (const p of productos.comoMapaSoloLectura().values()) union.set(p.sku, p);
    const ubicDb = await ubicacionesDb(
      db,
      filas.map((f) => f.sku),
    );
    const umDb = await umbralesDb(
      db,
      filas.map((f) => f.sku),
    );
    for (const f of filas) {
      if (!union.has(f.sku)) union.set(f.sku, fichaDeFila(f, normalizarSector(f.sector), ubicDb.get(f.sku) ?? null, umDb.get(f.sku) ?? null));
    }
    let lista = [...union.values()];
    if (lista.length === 0 && existencias.contiene("demo-sku-1")) {
      lista = [{ sku: "demo-sku-1", nombre: "Demo", precioCentavos: precios.obtener("demo-sku-1") ?? 15000, sector: "general", locationId: null, archivado: false, controlaVencimiento: false, estado: "activo", minStock: null, reorderQty: null }];
    }
    const filtradas = filtrar(lista, q, existencias, precios);
    return { fichas: await presentarDb(db, filtradas), fuente: "db" };
  } catch (e) {
    productos.anteFalloPersistencia(e);
    return {
      fichas: filtrar([...productos.comoMapaSoloLectura().values()], q, existencias, precios).map((f) =>
        conPresentacion(f, fotoMemoria(f.sku)),
      ),
      fuente: "memoria",
    };
  }
}

function filtrar(lista: FichaProducto[], q: string, existencias: AlmacenVivo<number>, precios: AlmacenVivo<number>): FichaProducto[] {
  const query = q.trim().toUpperCase();
  if (lista.length === 0 && existencias.contiene("demo-sku-1")) {
    return [{ sku: "demo-sku-1", nombre: "Demo", precioCentavos: precios.obtener("demo-sku-1") ?? 15000, sector: "general", locationId: null, archivado: false, controlaVencimiento: false, estado: "activo", minStock: null, reorderQty: null }];
  }
  if (!query) return lista;
  // Por qué difusa sobre exacta: el mostrador tipea rápido y con tildes.
  return lista.filter((p) => coincideDifuso([p.sku, p.nombre], q));
}

export interface AltaProductoInput {
  readonly sku: string;
  readonly nombre: string;
  readonly precioCentavos: number;
  readonly sector: string;
  readonly codigo?: string | undefined;
  readonly controlaVencimiento: boolean;
  readonly estado?: "activo" | "pendiente_revision" | undefined;
  readonly locationId?: string | undefined;
  readonly minStock?: number | null | undefined;
  readonly reorderQty?: number | null | undefined;
  readonly foto?: { url: string; ancho: number; alto: number; bytes: number } | undefined;
}

export type AltaProductoResultado =
  | { ok: true; ficha: FichaProducto; fuente: "db" | "memoria" }
  | { ok: false; codigo: "SKU_DUPLICADO" | "CODIGO_DUPLICADO" | "UBICACION_DESCONOCIDA" | "UMBRAL_INVALIDO"; error: string };

export async function altaProducto(input: AltaProductoInput): Promise<AltaProductoResultado> {
  const productos = crearAlmacenProductos();
  const codigos = crearAlmacenCodigos();
  const existencias = crearAlmacenStock();
  const precios = crearAlmacenPrecios();
  const sectores = crearAlmacenSectores();
  const fotos = crearAlmacenFotosProducto();
  const sku = input.sku.trim().toUpperCase();
  if (productos.contiene(sku) || existencias.contiene(sku) || existencias.contiene(input.sku)) {
    if (productos.contiene(sku)) return { ok: false, codigo: "SKU_DUPLICADO", error: "sku duplicado" };
  }
  const cod = input.codigo?.trim().toUpperCase() || null;
  if (cod && codigos.contiene(cod)) return { ok: false, codigo: "CODIGO_DUPLICADO", error: "codigo duplicado" };
  // Por qué validar ubicación: products.location_id referencia locations;
  // un id inexistente se rechaza con 422 en vez de romper la FK.
  if (input.locationId !== undefined && !(await ubicacionExiste(input.locationId))) {
    return { ok: false, codigo: "UBICACION_DESCONOCIDA", error: "ubicacion desconocida" };
  }
  const umbralMal = validarUmbrales(input.minStock, input.reorderQty);
  if (umbralMal) return { ok: false, codigo: "UMBRAL_INVALIDO", error: umbralMal };
  const ficha: FichaProducto = {
    sku,
    nombre: input.nombre,
    precioCentavos: input.precioCentavos,
    sector: normalizarSector(input.sector),
    locationId: input.locationId ?? null,
    archivado: false,
    controlaVencimiento: input.controlaVencimiento,
    estado: input.estado ?? "activo",
    minStock: input.minStock ?? null,
    reorderQty: input.reorderQty ?? null,
  };
  const db = dbVivaTenant();
  if (!db) {
    espejoProducto(ficha, cod, input.foto, productos, existencias, precios, sectores, codigos, fotos);
    return { ok: true, ficha, fuente: "memoria" };
  }
  try {
    const previoSku = await db.select({ sku: products.sku }).from(products).where(eq(products.sku, sku)).limit(1);
    if (previoSku[0]) return { ok: false, codigo: "SKU_DUPLICADO", error: "sku duplicado" };
    if (cod) {
      const previoCod = await db.select({ codigo: productCodes.codigo }).from(productCodes).where(eq(productCodes.codigo, cod)).limit(1);
      if (previoCod[0]) return { ok: false, codigo: "CODIGO_DUPLICADO", error: "codigo duplicado" };
    }
    await db.execute(
      sql`insert into products (sku, nombre, precio_centavos, stock_actual, sector) values (${sku}, ${input.nombre}, ${input.precioCentavos}, 0, ${ficha.sector}) on conflict do nothing`,
    );
    if (cod) {
      await db.insert(productCodes).values({ codigo: cod, sku, padre: null }).onConflictDoNothing();
    }
    if (input.foto) {
      await db.insert(productPhotos).values({ sku, url: input.foto.url, ancho: input.foto.ancho, alto: input.foto.alto, bytes: input.foto.bytes });
    }
    // Por qué update separado: el insert crudo omite location_id a
    // propósito (drift de bases sin la 0021); fijarLocationDb tolera eso.
    if (ficha.locationId !== null) await fijarLocationDb(db, sku, ficha.locationId);
    // Por qué separado como location_id: el insert crudo tampoco lleva los
    // umbrales (drift de bases sin la 0027); fijarUmbralesDb tolera eso.
    if (ficha.minStock !== null || ficha.reorderQty !== null) {
      await fijarUmbralesDb(db, sku, { minStock: ficha.minStock, reorderQty: ficha.reorderQty });
    }
    espejoProducto(ficha, cod, input.foto, productos, existencias, precios, sectores, codigos, fotos);
    return { ok: true, ficha, fuente: "db" };
  } catch (e) {
    productos.anteFalloPersistencia(e);
    espejoProducto(ficha, cod, input.foto, productos, existencias, precios, sectores, codigos, fotos);
    return { ok: true, ficha, fuente: "memoria" };
  }
}

function espejoProducto(
  ficha: FichaProducto,
  cod: string | null,
  foto: { url: string; ancho: number; alto: number; bytes: number } | undefined,
  productos: AlmacenVivo<FichaProducto>,
  existencias: AlmacenVivo<number>,
  precios: AlmacenVivo<number>,
  sectores: AlmacenVivo<string>,
  codigos: AlmacenVivo<string>,
  fotos: AlmacenVivo<Array<{ id: string; url: string; ancho: number; alto: number; bytes: number }>>,
): void {
  productos.guardar(ficha.sku, ficha);
  if (!existencias.contiene(ficha.sku)) existencias.guardar(ficha.sku, 0);
  precios.guardar(ficha.sku, ficha.precioCentavos);
  sectores.guardar(ficha.sku, ficha.sector);
  if (cod) codigos.guardar(cod, ficha.sku);
  if (foto) {
    const arr = fotos.obtener(ficha.sku) ?? [];
    arr.push({ id: randomUUID(), url: foto.url, ancho: foto.ancho, alto: foto.alto, bytes: foto.bytes });
    fotos.guardar(ficha.sku, arr);
  }
}

export interface ParcheProducto {
  readonly nombre?: string | undefined;
  readonly precioCentavos?: number | undefined;
  readonly sector?: string | undefined;
  readonly locationId?: string | null | undefined;
  readonly archivado?: boolean | undefined;
  readonly minStock?: number | null | undefined;
  readonly reorderQty?: number | null | undefined;
}

export type ActualizarProductoResultado =
  | { ok: true; ficha: FichaProducto }
  | { ok: false; codigo: "DESCONOCIDO" | "UBICACION_DESCONOCIDA" | "UMBRAL_INVALIDO"; error: string };

export async function actualizarProducto(sku: string, parche: ParcheProducto): Promise<ActualizarProductoResultado> {
  const productos = crearAlmacenProductos();
  const sectores = crearAlmacenSectores();
  const precios = crearAlmacenPrecios();
  const db = dbVivaTenant();
  const enMemoria = productos.obtener(sku);
  if (parche.locationId !== undefined && parche.locationId !== null && !(await ubicacionExiste(parche.locationId))) {
    return { ok: false, codigo: "UBICACION_DESCONOCIDA", error: "ubicacion desconocida" };
  }
  const umbralMal = validarUmbrales(parche.minStock, parche.reorderQty);
  if (umbralMal) return { ok: false, codigo: "UMBRAL_INVALIDO", error: umbralMal };
  if (!db) {
    if (!enMemoria) return { ok: false, codigo: "DESCONOCIDO", error: "desconocido" };
    return { ok: true, ficha: aplicarParche(enMemoria, parche, productos, precios, sectores) };
  }
  try {
    const filas = await db
      .select({ sku: products.sku, nombre: products.nombre, precioCentavos: products.precioCentavos, sector: products.sector })
      .from(products)
      .where(eq(products.sku, sku))
      .limit(1);
    const fila = filas[0];
    const base = enMemoria ?? (fila ? fichaDeFila(fila, normalizarSector(fila.sector), (await ubicacionesDb(db, [fila.sku])).get(fila.sku) ?? null, (await umbralesDb(db, [fila.sku])).get(fila.sku) ?? null) : null);
    if (!base) return { ok: false, codigo: "DESCONOCIDO", error: "desconocido" };
    const next = aplicarParche(base, parche, productos, precios, sectores);
    await db
      .update(products)
      .set({
        nombre: next.nombre,
        precioCentavos: BigInt(next.precioCentavos),
        ...(parche.sector !== undefined ? { sector: next.sector } : {}),
      })
      .where(eq(products.sku, sku));
    if (parche.locationId !== undefined) await fijarLocationDb(db, sku, parche.locationId);
    // Por qué separado: fijarUmbralesDb tolera bases sin la 0027 igual
    // que fijarLocationDb tolera las sin la 0021.
    if (parche.minStock !== undefined || parche.reorderQty !== undefined) {
      await fijarUmbralesDb(db, sku, { minStock: next.minStock, reorderQty: next.reorderQty });
    }
    return { ok: true, ficha: next };
  } catch (e) {
    productos.anteFalloPersistencia(e);
    if (!enMemoria) return { ok: false, codigo: "DESCONOCIDO", error: "desconocido" };
    return { ok: true, ficha: aplicarParche(enMemoria, parche, productos, precios, sectores) };
  }
}

function aplicarParche(
  p: FichaProducto,
  parche: ParcheProducto,
  productos: AlmacenVivo<FichaProducto>,
  precios: AlmacenVivo<number>,
  sectores: AlmacenVivo<string>,
): FichaProducto {
  const next: FichaProducto = {
    ...p,
    ...(parche.nombre ? { nombre: parche.nombre } : {}),
    ...(parche.precioCentavos !== undefined ? { precioCentavos: parche.precioCentavos } : {}),
    ...(parche.sector !== undefined ? { sector: normalizarSector(parche.sector) } : {}),
    ...(parche.locationId !== undefined ? { locationId: parche.locationId } : {}),
    ...(parche.archivado !== undefined ? { archivado: parche.archivado } : {}),
    ...(parche.minStock !== undefined ? { minStock: parche.minStock } : {}),
    ...(parche.reorderQty !== undefined ? { reorderQty: parche.reorderQty } : {}),
  };
  productos.guardar(p.sku, next);
  if (parche.precioCentavos !== undefined) precios.guardar(p.sku, parche.precioCentavos);
  if (parche.sector !== undefined) sectores.guardar(p.sku, next.sector);
  return next;
}

export async function listarUbicaciones(): Promise<Ubicacion[]> {
  const ubicaciones = crearAlmacenUbicaciones();
  const memoria = [...ubicaciones.comoMapaSoloLectura().values()];
  const db = dbVivaTenant();
  if (!db) return memoria;
  try {
    const filas = await db.select().from(locations);
    const union = new Map<string, Ubicacion>();
    for (const u of memoria) union.set(u.id, u);
    for (const f of filas) {
      if (!union.has(f.id)) union.set(f.id, { id: f.id, nombre: f.nombre, archivada: f.archivada ?? false });
    }
    return [...union.values()];
  } catch (e) {
    ubicaciones.anteFalloPersistencia(e);
    return memoria;
  }
}

export type AltaUbicacionResultado =
  | { ok: true; ubicacion: Ubicacion }
  | { ok: false; codigo: "DUPLICADA"; error: string };

export async function altaUbicacion(nombre: string): Promise<AltaUbicacionResultado> {
  const ubicaciones = crearAlmacenUbicaciones();
  const limpio = nombre.trim();
  const db = dbVivaTenant();
  if (db) {
    try {
      const previas = await db.select({ nombre: locations.nombre }).from(locations);
      if (previas.some((p) => p.nombre.toLowerCase() === limpio.toLowerCase())) {
        return { ok: false, codigo: "DUPLICADA", error: "ubicacion duplicada" };
      }
      const u: Ubicacion = { id: randomUUID(), nombre: limpio, archivada: false };
      try {
        await db.insert(locations).values(u);
      } catch (ins) {
        if (esChoqueUnicoUbicacion(ins)) return { ok: false, codigo: "DUPLICADA", error: "ubicacion duplicada" };
        throw ins;
      }
      espejarUbicacion(u, ubicaciones);
      return { ok: true, ubicacion: u };
    } catch (e) {
      ubicaciones.anteFalloPersistencia(e);
    }
  }
  for (const u of ubicaciones.comoMapaSoloLectura().values()) {
    if (u.nombre.toLowerCase() === limpio.toLowerCase() && !u.archivada) {
      return { ok: false, codigo: "DUPLICADA", error: "ubicacion duplicada" };
    }
  }
  const creada: Ubicacion = { id: randomUUID(), nombre: limpio, archivada: false };
  espejarUbicacion(creada, ubicaciones);
  return { ok: true, ubicacion: creada };
}

export interface AsignacionMasivaInput {
  readonly locationId: string;
  readonly skus: ReadonlyArray<string>;
}

export type AsignarUbicacionResultado =
  | { ok: true; asignados: number; no_encontrados: string[] }
  | { ok: false; codigo: "UBICACION_DESCONOCIDA"; error: string };

// CAT-S5 masiva auditada sin mover stock: fija location_id en los
// productos dados, audita un ubicacion_asignada por cambio real
// (antes/después) en la lista de auditoría existente y no toca
// stock_movements ni existencias. Idempotente: reasignar la misma
// ubicación no escribe auditoría. Skus desconocidos se reportan y el
// resto se aplica.
export async function asignarUbicacionMasiva(input: AsignacionMasivaInput): Promise<AsignarUbicacionResultado> {
  const productos = crearAlmacenProductos();
  const auditoria = crearListaAuditoria();
  if (!(await ubicacionExiste(input.locationId))) {
    return { ok: false, codigo: "UBICACION_DESCONOCIDA", error: "ubicacion desconocida" };
  }
  const db = dbVivaTenant();
  const no_encontrados: string[] = [];
  let asignados = 0;
  const vistos = new Set<string>();
  try {
    for (const crudo of input.skus) {
      const sku = crudo.trim().toUpperCase();
      if (!sku || vistos.has(sku)) continue;
      vistos.add(sku);
      const enMemoria = productos.obtener(sku);
      let base: FichaProducto | null = enMemoria ?? null;
      if (!base && db) {
        const filas = await db
          .select({ sku: products.sku, nombre: products.nombre, precioCentavos: products.precioCentavos, sector: products.sector })
          .from(products)
          .where(eq(products.sku, sku))
          .limit(1);
        const fila = filas[0];
        if (!fila) {
          no_encontrados.push(sku);
          continue;
        }
        base = fichaDeFila(fila, normalizarSector(fila.sector), (await ubicacionesDb(db, [fila.sku])).get(fila.sku) ?? null, (await umbralesDb(db, [fila.sku])).get(fila.sku) ?? null);
      }
      if (!base) {
        no_encontrados.push(sku);
        continue;
      }
      if (base.locationId === input.locationId) {
        asignados += 1;
        continue;
      }
      const antes = base.locationId;
      productos.guardar(sku, { ...base, locationId: input.locationId });
      if (db) await fijarLocationDb(db, sku, input.locationId);
      auditoria.agregar({ accion: "ubicacion_asignada", sku, antes, despues: input.locationId, actor: "sistema" });
      asignados += 1;
    }
    return { ok: true, asignados, no_encontrados };
  } catch (e) {
    productos.anteFalloPersistencia(e);
    throw e;
  }
}
