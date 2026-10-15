import { randomUUID } from "node:crypto";
import { desc, eq, inArray, sql } from "drizzle-orm";
import { productCodes, products, locations, productPhotos } from "../../db/schema.js";
import { dbVivaTenant, type TenantDb } from "../server-db.js";
import { coincideDifuso, inicialesProducto } from "../../modules/inventario/busqueda.js";
import {
  crearAlmacenCodigos,
  crearAlmacenFotosProducto,
  crearAlmacenPrecios,
  crearAlmacenProductos,
  crearAlmacenSectores,
  crearAlmacenStock,
  crearAlmacenUbicaciones,
  type AlmacenVivo,
  type FichaCatalogo,
  type UbicacionCatalogo,
} from "./_almacen.js";

// PERS2-S23 (ADR-0062): catalogo (productos, codigos, fotos, sectores,
// ubicaciones). DB primero via dbVivaTenant(); solo en single sin base usa la
// memoria particionada. En multi sin base dbVivaTenant lanza
// BaseNoDisponible y se propaga (la ruta responde 503). Los sectores quedan
// en el mapa de sectores en memoria, sin columna propia en la DB local.

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

function fichaDeFila(f: { sku: string; nombre: string; precioCentavos: bigint }, sector: string): FichaProducto {
  return {
    sku: f.sku,
    nombre: f.nombre,
    precioCentavos: Number(f.precioCentavos),
    sector,
    locationId: null,
    archivado: false,
    controlaVencimiento: false,
  };
}

function sectorDe(sku: string, sectores: AlmacenVivo<string>): string {
  return sectores.obtener(sku) ?? "general";
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
  const sectores = crearAlmacenSectores();
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
      .select({ sku: products.sku, nombre: products.nombre, precioCentavos: products.precioCentavos })
      .from(products)
      .where(eq(products.sku, fila.sku))
      .limit(1);
    const p = prods[0];
    if (!p) return memoria ? { ficha: conPresentacion(memoria, fotoMemoria(memoria.sku)), fuente: "memoria" } : null;
    const ficha = fichaDeFila(p, sectorDe(p.sku, sectores));
    const recientes = await fotosRecientesDb(db, [ficha.sku]);
    return { ficha: conPresentacion(ficha, recientes.get(ficha.sku) ?? fotoMemoria(ficha.sku)), fuente: "db" };
  } catch (e) {
    productos.anteFalloPersistencia(e);
    return memoria ? { ficha: conPresentacion(memoria, fotoMemoria(memoria.sku)), fuente: "memoria" } : null;
  }
}

export async function listarProductos(q: string): Promise<{ fichas: FichaListado[]; fuente: "db" | "memoria" }> {
  const productos = crearAlmacenProductos();
  const sectores = crearAlmacenSectores();
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
    // La DB local puede no tener la columna sector (drift conocido): se
    // leen solo las columnas que existen y el sector queda en memoria.
    const filas = await db
      .select({ sku: products.sku, nombre: products.nombre, precioCentavos: products.precioCentavos })
      .from(products);
    const union = new Map<string, FichaProducto>();
    for (const p of productos.comoMapaSoloLectura().values()) union.set(p.sku, p);
    for (const f of filas) {
      if (!union.has(f.sku)) union.set(f.sku, fichaDeFila(f, sectorDe(f.sku, sectores)));
    }
    let lista = [...union.values()];
    if (lista.length === 0 && existencias.contiene("demo-sku-1")) {
      lista = [{ sku: "demo-sku-1", nombre: "Demo", precioCentavos: precios.obtener("demo-sku-1") ?? 15000, sector: "general", locationId: null, archivado: false, controlaVencimiento: false }];
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
    return [{ sku: "demo-sku-1", nombre: "Demo", precioCentavos: precios.obtener("demo-sku-1") ?? 15000, sector: "general", locationId: null, archivado: false, controlaVencimiento: false }];
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
  readonly foto?: { url: string; ancho: number; alto: number; bytes: number } | undefined;
}

export type AltaProductoResultado =
  | { ok: true; ficha: FichaProducto; fuente: "db" | "memoria" }
  | { ok: false; codigo: "SKU_DUPLICADO" | "CODIGO_DUPLICADO"; error: string };

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
  const ficha: FichaProducto = {
    sku,
    nombre: input.nombre,
    precioCentavos: input.precioCentavos,
    sector: input.sector,
    locationId: null,
    archivado: false,
    controlaVencimiento: input.controlaVencimiento,
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
      sql`insert into products (sku, nombre, precio_centavos, stock_actual) values (${sku}, ${input.nombre}, ${input.precioCentavos}, 0) on conflict do nothing`,
    );
    if (cod) {
      await db.insert(productCodes).values({ codigo: cod, sku, padre: null }).onConflictDoNothing();
    }
    if (input.foto) {
      await db.insert(productPhotos).values({ sku, url: input.foto.url, ancho: input.foto.ancho, alto: input.foto.alto, bytes: input.foto.bytes });
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
  readonly archivado?: boolean | undefined;
}

export type ActualizarProductoResultado =
  | { ok: true; ficha: FichaProducto }
  | { ok: false; codigo: "DESCONOCIDO"; error: string };

export async function actualizarProducto(sku: string, parche: ParcheProducto): Promise<ActualizarProductoResultado> {
  const productos = crearAlmacenProductos();
  const sectores = crearAlmacenSectores();
  const precios = crearAlmacenPrecios();
  const db = dbVivaTenant();
  const enMemoria = productos.obtener(sku);
  if (!db) {
    if (!enMemoria) return { ok: false, codigo: "DESCONOCIDO", error: "desconocido" };
    return { ok: true, ficha: aplicarParche(enMemoria, parche, productos, precios, sectores) };
  }
  try {
    const filas = await db
      .select({ sku: products.sku, nombre: products.nombre, precioCentavos: products.precioCentavos })
      .from(products)
      .where(eq(products.sku, sku))
      .limit(1);
    const fila = filas[0];
    const base = enMemoria ?? (fila ? fichaDeFila(fila, sectorDe(fila.sku, sectores)) : null);
    if (!base) return { ok: false, codigo: "DESCONOCIDO", error: "desconocido" };
    const next = aplicarParche(base, parche, productos, precios, sectores);
    await db
      .update(products)
      .set({ nombre: next.nombre, precioCentavos: BigInt(next.precioCentavos) })
      .where(eq(products.sku, sku));
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
    ...(parche.sector ? { sector: parche.sector } : {}),
    ...(parche.archivado !== undefined ? { archivado: parche.archivado } : {}),
  };
  productos.guardar(p.sku, next);
  if (parche.precioCentavos !== undefined) precios.guardar(p.sku, parche.precioCentavos);
  if (parche.sector) sectores.guardar(p.sku, parche.sector);
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
