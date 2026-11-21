import type { APIRoute } from "astro";
import { analyticsQuerySchema } from "../../../lib/validation-analytics.js";
import { resolverSesion, membershipActiva } from "../../../lib/control.js";
import { calcular_rotacion } from "../../../modules/analytics/agregador.js";
import { consultar_tablero } from "../../../modules/analytics/tablero.js";
import { fuente_memoria } from "../../../modules/analytics/fuente.js";
import { puede_ver_tablero, recortar_para_rol } from "../../../modules/analytics/permisos.js";
import type { Grant, SkuRot } from "../../../modules/analytics/tipos.js";

export const prerender = false;

// GET /api/analytics/tablero — RT7 tablero (filtros + orden + cursor 50).
// Sin sesión (slice-0): grant dueno, como POST /api/sales. Con sesión se
// resuelve rol por membership; Empleado sin permiso ve 403.
export const GET: APIRoute = async ({ request, url }) => {
  const q = Object.fromEntries(url.searchParams.entries());
  const parsed = analyticsQuerySchema.safeParse(q);
  if (!parsed.success) return Response.json({ error: "filtros inválidos" }, { status: 422 });
  const b = parsed.data;
  if (b.hasta < b.desde) return Response.json({ error: "rango de fechas inválido" }, { status: 422 });

  let grant: Grant = { rol: "dueno", permisos: [] };
  const ctx = resolverSesion(request);
  if (ctx?.tenantId) {
    const m = membershipActiva(ctx.tenantId, ctx.googleSub);
    if (!m) return Response.json({ error: "No tenés permiso para ver este comercio." }, { status: 403 });
    grant =
      m.rol === "dueno"
        ? { rol: "dueno", permisos: [] }
        : { rol: "empleado", permisos: [...(m.permisos as string[])] };
  }
  if (!puede_ver_tablero(grant)) {
    return Response.json({ error: "No tenés permiso para ver la rotación." }, { status: 403 });
  }
  if (grant.rol === "empleado" && (b.orden === "valorizado" || b.orden === "rotacion")) {
    if (b.orden === "valorizado") {
      return Response.json({ error: "No tenés permiso para ver la ganancia." }, { status: 403 });
    }
  }

  const { movimientos, catalogo } = fuente_memoria();
  const r = calcular_rotacion({
    movimientos,
    stockInicial: new Map<SkuRot, number>(),
    catalogo,
    params: {
      desde: b.desde,
      hasta: b.hasta,
      hoy: b.hasta,
      ventanaCoberturaDias: Number(b.cobertura_ventana_dias) as 14 | 28 | 56,
    },
  });
  if (!r.ok) return Response.json({ error: "ventana inválida" }, { status: 422 });
  const vista = consultar_tablero(r.valor, {
    texto: b.texto,
    categoria: b.categoria,
    ubicacion: b.ubicacion,
    orden: b.orden,
    dir: b.dir,
    limite: b.limite,
    cursor: b.cursor ?? null,
  });
  const recortadas = recortar_para_rol(vista.items, grant);
  const aStr = (f: object, k: "costoCentavos" | "valorizadoCentavos" | "ingresosCentavos" | "gananciaCentavos") => {
    const v = (f as Record<string, unknown>)[k];
    return typeof v === "bigint" ? v.toString() : undefined;
  };
  return Response.json(
    {
      desde: b.desde,
      hasta: b.hasta,
      datos_actualizados: new Date().toISOString(),
      items: recortadas.map((f) => ({
        ...f,
        costoCentavos: aStr(f, "costoCentavos"),
        valorizadoCentavos: aStr(f, "valorizadoCentavos"),
        ingresosCentavos: aStr(f, "ingresosCentavos"),
        gananciaCentavos: aStr(f, "gananciaCentavos"),
      })),
      next_cursor: vista.nextCursor,
    },
    { status: 200 },
  );
};
