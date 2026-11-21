import type { APIRoute } from "astro";
import { z } from "zod";
import { BaseNoDisponible } from "../../lib/server-db.js";
import { resolverRolEfectivo } from "../../lib/control.js";
import { actualizarProducto, altaProducto, buscarProductoPorCodigo, listarProductos } from "../../lib/repos/catalogo.js";
import { estadoAltaDesdeRol, puedeEditarUmbrales } from "../../modules/inventario/escaneo.js";

export const prerender = false;

function conCamposHttp<
  T extends { locationId: string | null; minStock: number | null; reorderQty: number | null; porPeso?: boolean | undefined },
>(ficha: T): T & { location_id: string | null; min_stock: number | null; reorder_qty: number | null; por_peso: boolean } {
  return {
    ...ficha,
    location_id: ficha.locationId,
    min_stock: ficha.minStock,
    reorder_qty: ficha.reorderQty,
    por_peso: ficha.porPeso ?? false,
  };
}

const crearSchema = z.object({
  sku: z.string().min(1).max(64),
  nombre: z.string().min(1).max(200),
  precio_centavos: z.number().int().min(0),
  por_peso: z.boolean().default(false),
  sector: z.string().max(64).default("general"),
  codigo: z.string().max(64).optional(),
  controla_vencimiento: z.boolean().default(false),
  permisos: z.array(z.string().max(64)).max(32).default([]),
  location_id: z.string().uuid().optional(),
  min_stock: z.number().int().min(0).nullable().optional(),
  reorder_qty: z.number().int().min(1).nullable().optional(),
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
      if (r) return Response.json({ productos: [conCamposHttp(r.ficha)], fuente: r.fuente });
      return Response.json({ productos: [], alta_corta: { codigo } });
    }
    const { fichas, fuente } = await listarProductos(q);
    return Response.json({ productos: fichas.map(conCamposHttp), fuente });
  } catch (e) {
    if (e instanceof BaseNoDisponible) return Response.json({ error: "base_no_disponible" }, { status: 503 });
    throw e;
  }
};

// POST /api/products — CAT-S1 alta. 409 sku o código duplicado.
// P9-13: el estado de alta sale del rol de sesión + membership; el body
// `rol` se ignora (zod lo recorta). Sin sesión vale el default dueño.
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
  const rolEfectivo = resolverRolEfectivo(request);
  if (rolEfectivo.estado === "sin_permiso") {
    return Response.json({ error: "No tenés permiso en este comercio." }, { status: 403 });
  }
  const rol = rolEfectivo.estado === "sesion" ? rolEfectivo.rol : "dueno";
  const permisos = rolEfectivo.estado === "sesion" ? rolEfectivo.permisos : b.permisos;
  if (estadoAltaDesdeRol(rol, permisos) !== "activo") {
    return Response.json({ error: "Necesitás permiso de alta de productos." }, { status: 403 });
  }
  let r: Awaited<ReturnType<typeof altaProducto>>;
  try {
    r = await altaProducto({
      sku: b.sku,
      nombre: b.nombre,
      precioCentavos: b.precio_centavos,
      porPeso: b.por_peso,
      sector: b.sector,
      ...(b.codigo !== undefined ? { codigo: b.codigo } : {}),
      controlaVencimiento: b.controla_vencimiento,
      estado: estadoAltaDesdeRol(rol, permisos),
      ...(b.location_id !== undefined ? { locationId: b.location_id } : {}),
      ...(b.min_stock !== undefined ? { minStock: b.min_stock } : {}),
      ...(b.reorder_qty !== undefined ? { reorderQty: b.reorder_qty } : {}),
      ...(b.foto !== undefined ? { foto: b.foto } : {}),
    });
  } catch (e) {
    if (e instanceof BaseNoDisponible) return Response.json({ error: "base_no_disponible" }, { status: 503 });
    throw e;
  }
  if (!r.ok) {
    if (r.codigo === "UBICACION_DESCONOCIDA") return Response.json({ error: "ubicacion desconocida" }, { status: 422 });
    if (r.codigo === "UMBRAL_INVALIDO") return Response.json({ error: r.error }, { status: 422 });
    return Response.json({ error: r.codigo === "SKU_DUPLICADO" ? "sku duplicado" : "codigo duplicado" }, { status: 409 });
  }
  return Response.json(conCamposHttp(r.ficha), { status: 201 });
};

// PATCH /api/products?sku= — actualiza nombre/precio/sector/archivado.
// ALR-S1 suma min_stock (entero >= 0, null limpia) y reorder_qty (entero >
// 0, null limpia): solo Dueño y encargado (403 al empleado); el resto de
// los campos sigue sin exigir rol, como hasta ahora.
// P9-13: el rol sale de sesión + membership; el body `rol` se ignora.
export const PATCH: APIRoute = async ({ request, url }) => {
  const sku = (url.searchParams.get("sku") ?? "").trim().toUpperCase();
  if (!sku) return Response.json({ error: "falta sku" }, { status: 422 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "json invalido" }, { status: 422 });
  }
  const parsed = z.object({ nombre: z.string().min(1).max(200).optional(), precio_centavos: z.number().int().min(0).optional(), por_peso: z.boolean().optional(), sector: z.string().max(64).optional(), location_id: z.string().uuid().nullable().optional(), archivado: z.boolean().optional(), min_stock: z.number().int().min(0).nullable().optional(), reorder_qty: z.number().int().min(1).nullable().optional(), codigo: z.string().max(64).optional() }).safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 422 });
  const rolEfectivo = resolverRolEfectivo(request);
  if (rolEfectivo.estado === "sin_permiso") {
    return Response.json({ error: "No tenés permiso en este comercio." }, { status: 403 });
  }
  const rol = rolEfectivo.estado === "sesion" ? rolEfectivo.rol : "dueno";
  const tocaUmbrales = parsed.data.min_stock !== undefined || parsed.data.reorder_qty !== undefined;
  if (tocaUmbrales && !puedeEditarUmbrales(rol)) {
    return Response.json({ error: "solo dueno o encargado editan umbrales" }, { status: 403 });
  }
  let r: Awaited<ReturnType<typeof actualizarProducto>>;
  try {
    const parche: Record<string, any> = {
      ...(parsed.data.nombre !== undefined ? { nombre: parsed.data.nombre } : {}),
      ...(parsed.data.precio_centavos !== undefined ? { precioCentavos: parsed.data.precio_centavos } : {}),
      ...(parsed.data.por_peso !== undefined ? { porPeso: parsed.data.por_peso } : {}),
      ...(parsed.data.sector !== undefined ? { sector: parsed.data.sector } : {}),
      ...(parsed.data.location_id !== undefined ? { locationId: parsed.data.location_id } : {}),
      ...(parsed.data.archivado !== undefined ? { archivado: parsed.data.archivado } : {}),
      ...(parsed.data.min_stock !== undefined ? { minStock: parsed.data.min_stock } : {}),
      ...(parsed.data.reorder_qty !== undefined ? { reorderQty: parsed.data.reorder_qty } : {}),
    };
    if (parsed.data.codigo !== undefined) parche.codigo = parsed.data.codigo;
    r = await actualizarProducto(sku, parche);
  } catch (e) {
    if (e instanceof BaseNoDisponible) return Response.json({ error: "base_no_disponible" }, { status: 503 });
    throw e;
  }
  if (!r.ok) {
    if (r.codigo === "UBICACION_DESCONOCIDA") return Response.json({ error: "ubicacion desconocida" }, { status: 422 });
    if (r.codigo === "UMBRAL_INVALIDO") return Response.json({ error: r.error }, { status: 422 });
    if (r.codigo === "FLAG_IRREVERSIBLE") return Response.json({ error: r.error }, { status: 422 });
    if (r.codigo === "CODIGO_DUPLICADO") return Response.json({ error: "codigo duplicado" }, { status: 409 });
    return Response.json({ error: "desconocido" }, { status: 404 });
  }
  return Response.json(conCamposHttp(r.ficha));
};
