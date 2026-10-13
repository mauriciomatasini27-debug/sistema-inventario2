import type { APIRoute } from "astro";
import { resolverSesion } from "../../../lib/control.js";
import { detectar_intencion, extraer_termino, decidir_respuesta, formatear_stock } from "../../../modules/whatsapp/consulta.js";
import { BaseNoDisponible } from "../../../lib/server-db.js";
import { listarProductosConsulta } from "../../../lib/repos/whatsapp.js";

export const prerender = false;

// GET /api/whatsapp/consult?term=&comercio= — consulta interna de stock/precio.
// Requiere sesión (ruta interna, no webhook público): sin sesión => 403.
// Reglas capa 1 (consulta.ts); difusa pg_trgm vive en el adaptador real.
// PERS-S4: con DB viva busca en products (nombre real); sin DB cae a memoria.
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
  const busqueda = extraer_termino(term).toLowerCase();
  let filas: Awaited<ReturnType<typeof listarProductosConsulta>>["filas"];
  let fuente: "db" | "memoria";
  try {
    const r = await listarProductosConsulta();
    filas = r.filas;
    fuente = r.fuente;
  } catch (e) {
    if (e instanceof BaseNoDisponible) return Response.json({ error: "base_no_disponible" }, { status: 503 });
    throw e;
  }
  if (fuente === "db") {
    const candidatos = filas
      .filter((p) => !busqueda || p.sku.toLowerCase().includes(busqueda) || p.nombre.toLowerCase().includes(busqueda))
      .slice(0, 20)
      .map((p) => ({
        sku: p.sku,
        nombre: p.nombre,
        score: !busqueda || p.sku.toLowerCase() === busqueda || p.nombre.toLowerCase() === busqueda ? 1 : 0.5,
      }));
    const d = decidir_respuesta(candidatos);
    if (d.kind === "sin_resultados") return Response.json({ intencion, decision: "sin_resultados", fuente: "db" });
    if (d.kind === "desambiguar") {
      return Response.json({ intencion, decision: "desambiguar", opciones: d.opciones.map((o) => o.sku), fuente: "db" });
    }
    const prod = filas.find((p) => p.sku === d.sku)!;
    const texto = formatear_stock({
      nombre: prod.nombre,
      stock: prod.stock,
      umbral: 5,
      precioCentavos: prod.precio,
      comercio,
    });
    return Response.json({ intencion, decision: "directo", sku: d.sku, texto, fuente: "db" });
  }
  const candidatos = filas
    .filter((p) => !busqueda || p.sku.toLowerCase().includes(busqueda))
    .map((p) => ({
      sku: p.sku,
      nombre: p.sku,
      score: !busqueda || p.sku.toLowerCase() === busqueda ? 1 : 0.5,
    }));
  const d = decidir_respuesta(candidatos);
  if (d.kind === "sin_resultados") return Response.json({ intencion, decision: "sin_resultados", fuente: "memoria" });
  if (d.kind === "desambiguar") {
    return Response.json({ intencion, decision: "desambiguar", opciones: d.opciones.map((o) => o.sku), fuente: "memoria" });
  }
  const prod = filas.find((p) => p.sku === d.sku)!;
  const texto = formatear_stock({
    nombre: prod.sku,
    stock: prod.stock,
    umbral: 5,
    precioCentavos: prod.precio,
    comercio,
  });
  return Response.json({ intencion, decision: "directo", sku: d.sku, texto, fuente: "memoria" });
};
