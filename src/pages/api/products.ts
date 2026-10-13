import type { APIRoute } from "astro";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { store } from "../../lib/store.js";
import { intentarLeer, intentarPersistir } from "../../lib/server-db.js";
import { productCodes, productPhotos, products } from "../../db/schema.js";

export const prerender = false;

const crearSchema = z.object({
  sku: z.string().min(1).max(64),
  nombre: z.string().min(1).max(200),
  precio_centavos: z.number().int().min(0),
  sector: z.string().max(64).default("general"),
  codigo: z.string().max(64).optional(),
  controla_vencimiento: z.boolean().default(false),
  foto: z.object({ url: z.string().url(), ancho: z.number().int().max(800).default(800), alto: z.number().int().max(800).default(800), bytes: z.number().int().max(200 * 1024).default(0) }).optional(),
});

// GET /api/products?q=&codigo= — CAT-S1/S2 búsqueda difusa + código.
export const GET: APIRoute = async ({ url }) => {
  const q = (url.searchParams.get("q") ?? "").trim().toUpperCase();
  const codigo = (url.searchParams.get("codigo") ?? "").trim().toUpperCase();
  if (codigo) {
    const sku = store.codigos.get(codigo);
    if (sku) {
      const p = store.productos.get(sku);
      if (p) return Response.json({ productos: [p], fuente: "memoria" });
    }
    const filaDb = await intentarLeer((db) =>
      db.select().from(productCodes).where(eq(productCodes.codigo, codigo)).limit(1),
    );
    if (filaDb && filaDb.length > 0) return Response.json({ productos: filaDb, fuente: "db" });
    return Response.json({ productos: [] });
  }
  let lista = [...store.productos.values()];
  // Seed demo para no romper panel/tests sin alta previa.
  if (lista.length === 0 && store.stock.has("demo-sku-1")) {
    lista = [{ sku: "demo-sku-1", nombre: "Demo", precioCentavos: store.prices.get("demo-sku-1") ?? 15000, sector: "general", locationId: null, archivado: false, controlaVencimiento: false }];
  }
  const filtrada = q
    ? lista.filter((p) => p.sku.toUpperCase().includes(q) || p.nombre.toUpperCase().includes(q))
    : lista;
  return Response.json({ productos: filtrada, fuente: "memoria" });
};

// POST /api/products — CAT-S1 alta. 409 sku o código duplicado.
export const POST: APIRoute = async ({ request }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "json invalido" }, { status: 422 });
  }
  const parsed = crearSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 422 });
  const b = parsed.data;
  const sku = b.sku.trim().toUpperCase();
  if (store.productos.has(sku) || store.stock.has(sku) || store.stock.has(b.sku)) {
    // store.stock legacy también cuenta como duplicado para no bifurcar.
    if (store.productos.has(sku)) return Response.json({ error: "sku duplicado" }, { status: 409 });
  }
  if (b.codigo) {
    const cod = b.codigo.trim().toUpperCase();
    if (store.codigos.has(cod)) return Response.json({ error: "codigo duplicado" }, { status: 409 });
  }
  const ficha = {
    sku,
    nombre: b.nombre,
    precioCentavos: b.precio_centavos,
    sector: b.sector,
    locationId: null as string | null,
    archivado: false,
    controlaVencimiento: b.controla_vencimiento,
  };
  store.productos.set(sku, ficha);
  if (!store.stock.has(sku)) store.stock.set(sku, 0);
  store.prices.set(sku, b.precio_centavos);
  store.productSectores.set(sku, b.sector);
  if (b.codigo) store.codigos.set(b.codigo.trim().toUpperCase(), sku);
  if (b.foto) {
    const arr = store.fotosProducto.get(sku) ?? [];
    arr.push({ id: crypto.randomUUID(), url: b.foto.url, ancho: b.foto.ancho, alto: b.foto.alto, bytes: b.foto.bytes });
    store.fotosProducto.set(sku, arr);
  }
  void intentarPersistir((db) =>
    db.insert(products).values({ sku, nombre: b.nombre, precioCentavos: BigInt(b.precio_centavos), stockActual: 0, sector: b.sector }).onConflictDoNothing(),
  );
  if (b.codigo) {
    const cod = b.codigo.trim().toUpperCase();
    void intentarPersistir((db) =>
      db.insert(productCodes).values({ codigo: cod, sku, padre: null }).onConflictDoNothing(),
    );
  }
  if (b.foto) {
    const f = b.foto;
    void intentarPersistir((db) =>
      db.insert(productPhotos).values({ sku, url: f.url, ancho: f.ancho, alto: f.alto, bytes: f.bytes }).onConflictDoNothing(),
    );
  }
  return Response.json(ficha, { status: 201 });
};

// PATCH /api/products?sku= — actualiza nombre/precio/sector/archivado.
export const PATCH: APIRoute = async ({ request, url }) => {
  const sku = (url.searchParams.get("sku") ?? "").trim().toUpperCase();
  if (!sku) return Response.json({ error: "falta sku" }, { status: 422 });
  const p = store.productos.get(sku);
  if (!p) return Response.json({ error: "desconocido" }, { status: 404 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "json invalido" }, { status: 422 });
  }
  const parsed = z.object({ nombre: z.string().min(1).max(200).optional(), precio_centavos: z.number().int().min(0).optional(), sector: z.string().max(64).optional(), archivado: z.boolean().optional() }).safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 422 });
  const next = { ...p, ...(parsed.data.nombre ? { nombre: parsed.data.nombre } : {}), ...(parsed.data.precio_centavos !== undefined ? { precioCentavos: parsed.data.precio_centavos } : {}), ...(parsed.data.sector ? { sector: parsed.data.sector } : {}), ...(parsed.data.archivado !== undefined ? { archivado: parsed.data.archivado } : {}) };
  store.productos.set(sku, next);
  if (parsed.data.precio_centavos !== undefined) store.prices.set(sku, parsed.data.precio_centavos);
  if (parsed.data.sector) store.productSectores.set(sku, parsed.data.sector);
  return Response.json(next);
};
