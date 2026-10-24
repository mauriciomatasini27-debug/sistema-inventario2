import type { APIRoute } from "astro";
import { control } from "../../../lib/store.js";
import { jsonError, membershipActiva, resolverSesion, type ContextoAuth } from "../../../lib/control.js";
import { BaseNoDisponible } from "../../../lib/server-db.js";
import { listarHistorial, modoHistorial, type PaginaHistorial } from "../../../lib/repos/bot-turnos.js";
import { parsearConsultaHistorial, personasDelFiltro } from "../../../modules/bot/historial.js";

export const prerender = false;

function tenantDeSesion(ctx: ContextoAuth): string | null {
  if (ctx.tenantId && control.tenants.has(ctx.tenantId)) return ctx.tenantId;
  const activas = [...control.memberships.values()].filter(
    (m) => m.googleSub === ctx.googleSub && m.estado === "activo" && control.tenants.has(m.tenantId),
  );
  return activas.length === 1 ? activas[0]!.tenantId : null;
}

export const GET: APIRoute = async ({ request }) => {
  const ctx = resolverSesion(request);
  if (!ctx) return jsonError("Iniciá sesión con Google para continuar.", 403);
  const tenantId = tenantDeSesion(ctx);
  if (!tenantId) return jsonError("No tenés permiso en este comercio.", 403);
  const m = membershipActiva(tenantId, ctx.googleSub);
  if (!m) return jsonError("No tenés permiso en este comercio.", 403);

  const url = new URL(request.url);
  const parsed = parsearConsultaHistorial(
    {
      persona: url.searchParams.get("persona"),
      desde: url.searchParams.get("desde"),
      hasta: url.searchParams.get("hasta"),
      cursor: url.searchParams.get("cursor"),
    },
    { tenantId, rol: m.rol, googleSub: ctx.googleSub },
  );
  if (!parsed.ok) return jsonError("Revisá la fecha o el cursor.", 400);

  const ahoraMs = Date.now();
  const modo = await modoHistorial(tenantId, ahoraMs);

  const memberships = [...control.memberships.values()]
    .filter((x) => x.tenantId === tenantId)
    .map((x) => ({
      googleSub: x.googleSub,
      rol: x.rol,
      estado: x.estado,
      nombre: control.users.get(x.googleSub)?.nombre ?? control.users.get(x.googleSub)?.email ?? x.googleSub,
    }));
  const personas = personasDelFiltro({ rol: m.rol, memberships });

  if (modo.tipo === "solo-lectura") {
    let pagina: PaginaHistorial = { filas: Object.freeze([]), cursor: null };
    try {
      pagina = await listarHistorial(parsed.consulta);
    } catch (e) {
      if (!(e instanceof BaseNoDisponible)) throw e;
    }
    return Response.json({
      soloLectura: true,
      aviso: modo.aviso,
      filas: pagina.filas,
      cursor: pagina.cursor,
      personas,
    });
  }

  let pagina;
  try {
    pagina = await listarHistorial(parsed.consulta);
  } catch (e) {
    if (e instanceof BaseNoDisponible) return jsonError("La base del comercio no está disponible.", 503);
    throw e;
  }

  return Response.json({
    soloLectura: false,
    filas: pagina.filas,
    cursor: pagina.cursor,
    personas,
  });
};
