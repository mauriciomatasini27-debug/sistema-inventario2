import type { APIRoute } from "astro";
import { z } from "zod";
import { BaseNoDisponible } from "../../lib/server-db.js";
import { actualizarProducto, altaProducto, buscarProductoPorCodigo, listarProductos } from "../../lib/repos/catalogo.js";

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
// PERS2-S23: lee por el repo de catálogo (DB primero, memoria solo en single
// sin base). En multi sin base el repo propaga BaseNoDisponible (503).
export const GET: APIRoute = async ({ url }) => {
  const q = (url.searchParams.get("q") ?? "").trim().toUpperCase();
  const codigo = (url.searchParams.get("codigo") ?? "").trim().toUpperCase();
  try {
    if (codigo) {
      const r = await buscarProductoPorCodigo(codigo);
      if (r) return Response.json({ productos: [r.ficha], fuente: r.fuente });
      return Response.json({ productos: [] });
    }
    const { fichas, fuente } = await listarProductos(q);
    return Response.json({ productos: fichas, fuente });
  } catch (e) {
    if (e instanceof BaseNoDisponible) return Response.json({ error: "base_no_disponible" }, { status: 503 });
    throw e;
  }
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
  let r: Awaited<ReturnType<typeof altaProducto>>;
  try {
    r = await altaProducto({
      sku: b.sku,
      nombre: b.nombre,
      precioCentavos: b.precio_centavos,
      sector: b.sector,
      ...(b.codigo !== undefined ? { codigo: b.codigo } : {}),
      controlaVencimiento: b.controla_vencimiento,
      ...(b.foto !== undefined ? { foto: b.foto } : {}),
    });
  } catch (e) {
    if (e instanceof BaseNoDisponible) return Response.json({ error: "base_no_disponible" }, { status: 503 });
    throw e;
  }
  if (!r.ok) return Response.json({ error: r.codigo === "SKU_DUPLICADO" ? "sku duplicado" : "codigo duplicado" }, { status: 409 });
  return Response.json(r.ficha, { status: 201 });
};

// PATCH /api/products?sku= — actualiza nombre/precio/sector/archivado.
export const PATCH: APIRoute = async ({ request, url }) => {
  const sku = (url.searchParams.get("sku") ?? "").trim().toUpperCase();
  if (!sku) return Response.json({ error: "falta sku" }, { status: 422 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "json invalido" }, { status: 422 });
  }
  const parsed = z.object({ nombre: z.string().min(1).max(200).optional(), precio_centavos: z.number().int().min(0).optional(), sector: z.string().max(64).optional(), archivado: z.boolean().optional() }).safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 422 });
  let r: Awaited<ReturnType<typeof actualizarProducto>>;
  try {
    r = await actualizarProducto(sku, {
      ...(parsed.data.nombre !== undefined ? { nombre: parsed.data.nombre } : {}),
      ...(parsed.data.precio_centavos !== undefined ? { precioCentavos: parsed.data.precio_centavos } : {}),
      ...(parsed.data.sector !== undefined ? { sector: parsed.data.sector } : {}),
      ...(parsed.data.archivado !== undefined ? { archivado: parsed.data.archivado } : {}),
    });
  } catch (e) {
    if (e instanceof BaseNoDisponible) return Response.json({ error: "base_no_disponible" }, { status: 503 });
    throw e;
  }
  if (!r.ok) return Response.json({ error: "desconocido" }, { status: 404 });
  return Response.json(r.ficha);
};
