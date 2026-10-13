import type { APIRoute } from "astro";
import { control } from "../../../../lib/store.js";
import { esDueno, exigirReauthReciente, jsonError, resolverSesion } from "../../../../lib/control.js";
import { persistirAuthEvent } from "../../../../lib/control-db.js";
import {
  enmascararEmail,
  esEventoDeComercio,
  formatearEvento,
  sanitizarDetalle,
} from "../../../../modules/auth/auditoria.js";

export const prerender = false;

function nombreCorto(googleSub: string | undefined, propio: string): string {
  if (!googleSub) return "Sistema";
  if (googleSub === propio) return "Vos";
  const u = control.users.get(googleSub);
  if (u?.nombre) return u.nombre;
  if (u?.email) return enmascararEmail(u.email);
  return "Un miembro";
}

// GET /api/tenants/:id/actividad — "Usuarios → Actividad" (AU12.2, solo
// Dueño): eventos del comercio con texto legible. En monoproceso se lee de
// control filtrado por tenant (réplica lógica del audit_log del comercio;
// en producción esa réplica vive en la base del tenant).
// ?formato=csv es exportación de auditoría: solo Dueño con reauth (AU12.4).
export const GET: APIRoute = async ({ request, params, url }) => {
  const ctx = resolverSesion(request);
  if (!ctx) return jsonError("Iniciá sesión con Google para continuar.", 403);
  const tenantId = params.id ?? "";
  const tenant = control.tenants.get(tenantId);
  // E5: mismo 403 para inexistente y ajeno.
  if (!tenant || !esDueno(tenantId, ctx.googleSub)) {
    return jsonError("No tenés permiso para ver este comercio.", 403);
  }
  const formato = url.searchParams.get("formato") ?? "json";
  if (formato !== "json" && formato !== "csv") return jsonError("Formato inválido (json o csv).", 422);
  if (formato === "csv") {
    const reauth = exigirReauthReciente(ctx);
    if (reauth) return reauth;
  }
  const limiteRaw = Number(url.searchParams.get("limite") ?? "50");
  const limite = Number.isFinite(limiteRaw) ? Math.min(200, Math.max(1, Math.floor(limiteRaw))) : 50;
  const eventos = control.events
    .filter((e) => e.tenantId === tenantId && esEventoDeComercio(e.tipo))
    .slice(-limite)
    .reverse()
    .map((e) => {
      const det = (sanitizarDetalle(e.detalle) ?? {}) as Record<string, unknown>;
      const objetivo = typeof det.objetivo === "string" ? nombreCorto(det.objetivo, ctx.googleSub) : undefined;
      return {
        tipo: e.tipo,
        fecha: e.creadoEn ?? null,
        actor: e.actor ?? null,
        texto: formatearEvento({
          tipo: e.tipo,
          actorNombre: nombreCorto(e.actor, ctx.googleSub),
          objetivoNombre: objetivo,
          fechaISO: e.creadoEn,
          detalle: det,
        }),
        detalle: det,
      };
    });
  if (formato === "csv") {
    const ahora = new Date().toISOString();
    control.events.push({ tenantId, tipo: "exportacion_actividad", actor: ctx.googleSub, creadoEn: ahora });
    void persistirAuthEvent({ tenantId, tipo: "exportacion_actividad", actor: ctx.googleSub });
    const filas = ["tipo;fecha;texto", ...eventos.map((e) => `${e.tipo};${e.fecha ?? ""};${JSON.stringify(e.texto)}`)];
    return new Response(filas.join("\n"), {
      status: 200,
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="actividad-${tenantId}.csv"` },
    });
  }
  return Response.json({ eventos, total: eventos.length }, { status: 200 });
};
