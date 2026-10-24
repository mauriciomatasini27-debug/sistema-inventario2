import type { APIRoute } from "astro";
import { resolverSesion } from "../../../lib/control.js";
import { consulta_con_detalle, detectar_intencion, formatear_stock } from "../../../modules/whatsapp/consulta.js";
import { BaseNoDisponible } from "../../../lib/server-db.js";
import { consultarNombre } from "../../../lib/repos/busqueda-nombre.js";
import { textoDetalleSiCorresponde } from "../../../lib/repos/consulta-lotes.js";

export const prerender = false;

// GET /api/whatsapp/consult?term=&comercio= — consulta interna de stock/precio.
// Requiere sesión (ruta interna, no webhook público): sin sesión => 403.
export const GET: APIRoute = async ({ request, url }) => {
  const ctx = resolverSesion(request);
  if (!ctx) return Response.json({ error: "requiere sesión" }, { status: 403 });
  const term = url.searchParams.get("term") ?? "";
  // BOT2-S4: "detalle de X" busca X y, si controla vencimiento, lista lotes.
  const pedido = consulta_con_detalle(term);
  const textoBusqueda = pedido && pedido.texto !== "" ? pedido.texto : term;
  if (!textoBusqueda.trim()) return Response.json({ error: "falta term" }, { status: 422 });
  const comercio = url.searchParams.get("comercio") ?? "Mi comercio";
  const intencion = detectar_intencion(textoBusqueda);
  if (intencion !== "stock" && intencion !== "precio") {
    return Response.json({ intencion, decision: "sin_resultados" });
  }
  try {
    const { origen, resolucion } = await consultarNombre({ tenantId: ctx.tenantId, texto: textoBusqueda });
    const fuente = origen;
    if (resolucion.kind === "sin_resultados") {
      return Response.json({
        intencion,
        decision: "sin_resultados",
        fuente,
        ...(resolucion.sugerencia ? { sugerencia: resolucion.sugerencia.sku } : {}),
      });
    }
    if (resolucion.kind === "precisar") {
      return Response.json({ intencion, decision: "precisar", total: resolucion.total, fuente });
    }
    if (resolucion.kind === "desambiguar") {
      return Response.json({ intencion, decision: "desambiguar", opciones: resolucion.opciones.map((o) => o.sku), fuente });
    }
    let texto = formatear_stock({
      nombre: resolucion.ficha.nombre,
      stock: resolucion.ficha.stock,
      umbral: resolucion.ficha.umbral,
      precioCentavos: resolucion.ficha.precioCentavos,
      comercio,
    });
    if (pedido) {
      const detalle = await textoDetalleSiCorresponde({
        tenantId: ctx.tenantId,
        sku: resolucion.ficha.sku,
        nombre: resolucion.ficha.nombre,
        comercio,
      });
      if (detalle) texto = detalle;
    }
    return Response.json({ intencion, decision: "directo", sku: resolucion.ficha.sku, texto, fuente });
  } catch (e) {
    if (e instanceof BaseNoDisponible) return Response.json({ error: "base_no_disponible" }, { status: 503 });
    throw e;
  }
};
