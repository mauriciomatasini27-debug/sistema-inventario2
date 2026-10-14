import type { APIRoute } from "astro";
import { exigirReauthReciente, resolverSesion, membershipActiva } from "../../../lib/control.js";
import { calcular_rotacion } from "../../../modules/analytics/agregador.js";
import { fuente_memoria } from "../../../modules/analytics/fuente.js";
import { armar_csv, auditar_export, decidir_modo_export } from "../../../modules/analytics/export.js";
import { puede_exportar } from "../../../modules/analytics/permisos.js";
import type { Grant, SkuRot } from "../../../modules/analytics/tipos.js";

export const prerender = false;

// GET /api/analytics/export?formato=csv&desde=&hasta= — RT8 P0.
// Solo Dueño (403 + mensaje en castellano). CSV UTF-8 con BOM. PDF P0:
// mismo snapshot, documento básico generado en servidor (ver nota).
// >2000 filas: 202 con estado pendiente (worker); el caller reintenta.
export const GET: APIRoute = async ({ request, url }) => {
  const formato = url.searchParams.get("formato") ?? "csv";
  const desde = url.searchParams.get("desde") ?? "";
  const hasta = url.searchParams.get("hasta") ?? "";
  if (formato !== "csv" && formato !== "pdf") {
    return Response.json({ error: "formato inválido (csv o pdf)" }, { status: 422 });
  }
  if (!desde || !hasta || hasta < desde) {
    return Response.json({ error: "rango de fechas inválido" }, { status: 422 });
  }
  let grant: Grant = { rol: "dueno", permisos: [] };
  let actor = "dueno";
  const ctx = resolverSesion(request);
  if (ctx?.tenantId) {
    const m = membershipActiva(ctx.tenantId, ctx.googleSub);
    if (!m) return Response.json({ error: "No tenés permiso para ver este comercio." }, { status: 403 });
    grant = m.rol === "dueno" ? { rol: "dueno", permisos: [] } : { rol: "empleado", permisos: [] };
    actor = ctx.googleSub;
  }
  if (!puede_exportar(grant)) {
    return Response.json({ error: "No tenés permiso para exportar reportes." }, { status: 403 });
  }
  // AU10.1: exportar es acción sensible, solo Dueño con reauth reciente.
  // Sin sesión (modo demo local) se mantiene el comportamiento anterior.
  if (ctx) {
    const reauth = exigirReauthReciente(ctx);
    if (reauth) return reauth;
  }
  const { movimientos, catalogo } = fuente_memoria();
  const r = calcular_rotacion({
    movimientos,
    stockInicial: new Map<SkuRot, number>(),
    catalogo,
    params: { desde, hasta, hoy: hasta, ventanaCoberturaDias: 28 },
  });
  if (!r.ok) return Response.json({ error: "ventana inválida" }, { status: 422 });
  const modo = decidir_modo_export(r.valor.length);
  const audit = auditar_export({ actor, formato: formato as "csv" | "pdf", filas: r.valor.length, desde, hasta });
  void audit;
  if (modo === "worker") {
    return Response.json({ estado: "pendiente", filas: r.valor.length }, { status: 202 });
  }
  if (formato === "pdf") {
    // P0: PDF básico en servidor como texto estructurado; la maquetación
    // completa (paginado, fórmulas, identificador único) queda para P1 con
    // worker de cola de jobs (RT8.3).
    const lineas = r.valor.map((f) => `${f.sku} ${f.nombre}: neto ${f.neto}, rot ${f.rotacion ?? "n/d"}`).join("\n");
    const pdf = `Reporte rotación ${desde}..${hasta}\nGenerado ${new Date().toISOString()} por ${actor}\n\n${lineas}\n`;
    return new Response(pdf, {
      status: 200,
      headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="rotacion-${desde}-${hasta}.pdf"` },
    });
  }
  const csv = armar_csv({ filas: r.valor, desde, hasta, generadoEn: new Date().toISOString(), generador: actor });
  return new Response(csv, {
    status: 200,
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="rotacion-${desde}-${hasta}.csv"` },
  });
};
