import type { APIRoute } from "astro";
import { resolverSesion } from "../../../lib/control.js";
import { detectar_intencion, extraer_termino, formatear_stock } from "../../../modules/whatsapp/consulta.js";
import { BaseNoDisponible } from "../../../lib/server-db.js";
import { consultarNombre } from "../../../lib/repos/busqueda-nombre.js";

export const prerender = false;

// GET /api/whatsapp/consult?term=&comercio= — consulta interna de stock/precio.
// Requiere sesión (ruta interna, no webhook público): sin sesión => 403.
export const GET: APIRoute = async ({ request, url }) => {
  const ctx = resolverSesion(request);
  if (!ctx) return Response.json({ error: "requiere sesión" }, { status: 403 });
  const term = url.searchParams.get("term") ?? "";
  if (!term.trim()) return Response.json({ error: "falta term" }, { status: 422 });
  const comercio = url.searchParams.get("comercio") ?? "Mi comercio";
  const intencion = detectar_intencion(term);
  if (intencion !== "stock" && intencion !== "precio") {
    return Response.json({ intencion, decision: "sin_resultados" });
  }
  try {
    const { origen, resolucion } = await consultarNombre({ tenantId: ctx.tenantId, texto: term });
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
    const texto = formatear_stock({
      nombre: resolucion.ficha.nombre,
      stock: resolucion.ficha.stock,
      umbral: resolucion.ficha.umbral,
      precioCentavos: resolucion.ficha.precioCentavos,
      comercio,
    });
    return Response.json({ intencion, decision: "directo", sku: resolucion.ficha.sku, texto, fuente });
  } catch (e) {
    if (e instanceof BaseNoDisponible) return Response.json({ error: "base_no_disponible" }, { status: 503 });
    throw e;
  }
};
