import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { productCodes, products } from "../../db/schema.js";
import { esModoMulti } from "../tenant-mode.js";
import { BaseNoDisponible, dbVivaTenant } from "../server-db.js";
import { store } from "../store.js";

// PERS2-S23 (ADR-0062): catalogo (productos, codigos, fotos, sectores,
// ubicaciones). DB primero via dbVivaTenant(); solo en single sin base usa la
// memoria particionada. En multi sin base dbVivaTenant lanza
// BaseNoDisponible y se propaga (la ruta responde 503). Los sectores quedan
// donde viven hoy (store.productSectores, sin columna propia en la DB local).

function aBaseNoDisponible(e: unknown): BaseNoDisponible {
  return e instanceof BaseNoDisponible ? e : new BaseNoDisponible();
}

export interface FichaProducto {
  sku: string;
  nombre: string;
  precioCentavos: number;
  sector: string;
  locationId: string | null;
  archivado: boolean;
  controlaVencimiento: boolean;
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

function sectorDe(sku: string): string {
  return store.productSectores.get(sku) ?? "general";
}

// ubicaciones: sigue en memoria como antes; pendiente pasar a la tabla locations (particionada por tenant via store).
export interface Ubicacion {
  id: string;
  nombre: string;
  archivada: boolean;
}

export async function buscarProductoPorCodigo(codigo: string): Promise<{ ficha: FichaProducto; fuente: "db" | "memoria" } | null> {
  const cod = codigo.trim().toUpperCase();
  const enMemoria = store.codigos.get(cod);
  const memoria = enMemoria ? (store.productos.get(enMemoria) ?? null) : null;
  const db = dbVivaTenant();
  if (!db) return memoria ? { ficha: memoria, fuente: "memoria" } : null;
  try {
    const filas = await db.select().from(productCodes).where(eq(productCodes.codigo, cod)).limit(1);
    const fila = filas[0];
    if (!fila) return memoria ? { ficha: memoria, fuente: "memoria" } : null;
    const prods = await db
      .select({ sku: products.sku, nombre: products.nombre, precioCentavos: products.precioCentavos })
      .from(products)
      .where(eq(products.sku, fila.sku))
      .limit(1);
    const p = prods[0];
    if (!p) return memoria ? { ficha: memoria, fuente: "memoria" } : null;
    return { ficha: fichaDeFila(p, sectorDe(p.sku)), fuente: "db" };
  } catch (e) {
    if (esModoMulti()) throw aBaseNoDisponible(e);
    return memoria ? { ficha: memoria, fuente: "memoria" } : null;
  }
}

export async function listarProductos(q: string): Promise<{ fichas: FichaProducto[]; fuente: "db" | "memoria" }> {
  const db = dbVivaTenant();
  if (!db) return { fichas: filtrar([...store.productos.values()], q), fuente: "memoria" };
  try {
    // La DB local puede no tener la columna sector (drift conocido): se
    // leen solo las columnas que existen y el sector queda en memoria.
    const filas = await db
      .select({ sku: products.sku, nombre: products.nombre, precioCentavos: products.precioCentavos })
      .from(products);
    const union = new Map<string, FichaProducto>();
    for (const p of store.productos.values()) union.set(p.sku, p);
    for (const f of filas) {
      if (!union.has(f.sku)) union.set(f.sku, fichaDeFila(f, sectorDe(f.sku)));
    }
    let lista = [...union.values()];
    if (lista.length === 0 && store.stock.has("demo-sku-1")) {
      lista = [{ sku: "demo-sku-1", nombre: "Demo", precioCentavos: store.prices.get("demo-sku-1") ?? 15000, sector: "general", locationId: null, archivado: false, controlaVencimiento: false }];
    }
    return { fichas: filtrar(lista, q), fuente: "db" };
  } catch (e) {
    if (esModoMulti()) throw aBaseNoDisponible(e);
    return { fichas: filtrar([...store.productos.values()], q), fuente: "memoria" };
  }
}

function filtrar(lista: FichaProducto[], q: string): FichaProducto[] {
  const query = q.trim().toUpperCase();
  if (lista.length === 0 && store.stock.has("demo-sku-1")) {
    return [{ sku: "demo-sku-1", nombre: "Demo", precioCentavos: store.prices.get("demo-sku-1") ?? 15000, sector: "general", locationId: null, archivado: false, controlaVencimiento: false }];
  }
  if (!query) return lista;
  return lista.filter((p) => p.sku.toUpperCase().includes(query) || p.nombre.toUpperCase().includes(query));
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
  const sku = input.sku.trim().toUpperCase();
  if (store.productos.has(sku) || store.stock.has(sku) || store.stock.has(input.sku)) {
    if (store.productos.has(sku)) return { ok: false, codigo: "SKU_DUPLICADO", error: "sku duplicado" };
  }
  const cod = input.codigo?.trim().toUpperCase() || null;
  if (cod && store.codigos.has(cod)) return { ok: false, codigo: "CODIGO_DUPLICADO", error: "codigo duplicado" };
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
    espejoProducto(ficha, cod, input.foto);
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
    // productPhotos: sigue en memoria como antes; pendiente pasar a product_photos.
    espejoProducto(ficha, cod, input.foto);
    return { ok: true, ficha, fuente: "db" };
  } catch (e) {
    if (esModoMulti()) throw aBaseNoDisponible(e);
    espejoProducto(ficha, cod, input.foto);
    return { ok: true, ficha, fuente: "memoria" };
  }
}

function espejoProducto(ficha: FichaProducto, cod: string | null, foto?: { url: string; ancho: number; alto: number; bytes: number } | undefined): void {
  store.productos.set(ficha.sku, ficha);
  if (!store.stock.has(ficha.sku)) store.stock.set(ficha.sku, 0);
  store.prices.set(ficha.sku, ficha.precioCentavos);
  store.productSectores.set(ficha.sku, ficha.sector);
  if (cod) store.codigos.set(cod, ficha.sku);
  if (foto) {
    const arr = store.fotosProducto.get(ficha.sku) ?? [];
    arr.push({ id: randomUUID(), url: foto.url, ancho: foto.ancho, alto: foto.alto, bytes: foto.bytes });
    store.fotosProducto.set(ficha.sku, arr);
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
  const db = dbVivaTenant();
  const enMemoria = store.productos.get(sku);
  if (!db) {
    if (!enMemoria) return { ok: false, codigo: "DESCONOCIDO", error: "desconocido" };
    return { ok: true, ficha: aplicarParche(enMemoria, parche) };
  }
  try {
    const filas = await db
      .select({ sku: products.sku, nombre: products.nombre, precioCentavos: products.precioCentavos })
      .from(products)
      .where(eq(products.sku, sku))
      .limit(1);
    const fila = filas[0];
    const base = enMemoria ?? (fila ? fichaDeFila(fila, sectorDe(fila.sku)) : null);
    if (!base) return { ok: false, codigo: "DESCONOCIDO", error: "desconocido" };
    const next = aplicarParche(base, parche);
    await db
      .update(products)
      .set({ nombre: next.nombre, precioCentavos: BigInt(next.precioCentavos) })
      .where(eq(products.sku, sku));
    return { ok: true, ficha: next };
  } catch (e) {
    if (esModoMulti()) throw aBaseNoDisponible(e);
    if (!enMemoria) return { ok: false, codigo: "DESCONOCIDO", error: "desconocido" };
    return { ok: true, ficha: aplicarParche(enMemoria, parche) };
  }
}

function aplicarParche(p: FichaProducto, parche: ParcheProducto): FichaProducto {
  const next: FichaProducto = {
    ...p,
    ...(parche.nombre ? { nombre: parche.nombre } : {}),
    ...(parche.precioCentavos !== undefined ? { precioCentavos: parche.precioCentavos } : {}),
    ...(parche.sector ? { sector: parche.sector } : {}),
    ...(parche.archivado !== undefined ? { archivado: parche.archivado } : {}),
  };
  store.productos.set(p.sku, next);
  if (parche.precioCentavos !== undefined) store.prices.set(p.sku, parche.precioCentavos);
  if (parche.sector) store.productSectores.set(p.sku, parche.sector);
  return next;
}

export async function listarUbicaciones(): Promise<Ubicacion[]> {
  // ubicaciones: sigue en memoria como antes; pendiente pasar a la tabla locations (ver arriba).
  // La sonda falla cerrado en multi sin base (503) como el resto del dominio.
  void dbVivaTenant();
  return [...store.ubicaciones.values()];
}

export type AltaUbicacionResultado =
  | { ok: true; ubicacion: Ubicacion }
  | { ok: false; codigo: "DUPLICADA"; error: string };

export async function altaUbicacion(nombre: string): Promise<AltaUbicacionResultado> {
  // ubicaciones: sigue en memoria como antes; pendiente pasar a la tabla locations (ver arriba).
  void dbVivaTenant();
  const limpio = nombre.trim();
  for (const u of store.ubicaciones.values()) {
    if (u.nombre.toLowerCase() === limpio.toLowerCase() && !u.archivada) {
      return { ok: false, codigo: "DUPLICADA", error: "ubicacion duplicada" };
    }
  }
  const u: Ubicacion = { id: randomUUID(), nombre: limpio, archivada: false };
  store.ubicaciones.set(u.id, u);
  return { ok: true, ubicacion: u };
}
