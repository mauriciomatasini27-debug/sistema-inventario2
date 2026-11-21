import type { APIRoute } from "astro";
import { z } from "zod";
import { control } from "../../../lib/store.js";
import { exigirReauthReciente, jsonError, membershipActiva, resolverSesion, type ContextoAuth } from "../../../lib/control.js";
import { cerrarCuenta } from "../../../lib/cierre-cuenta.js";
import { decidir_cierre, type MotivoNoCierre } from "../../../modules/tenants/cierre-cuenta.js";

export const prerender = false;

// P10-91: POST /api/plan/cerrar-cuenta — el dueño cierra la cuenta del
// comercio desde /panel/plan. Exige reauth reciente con Google (AU10) y el
// nombre del comercio escrito. El tenant sale de la sesión, nunca del body.

const bodySchema = z.object({ nombre_comercio: z.string().max(120) });

function tenantDeSesion(ctx: ContextoAuth): string | null {
  if (ctx.tenantId && control.tenants.has(ctx.tenantId)) return ctx.tenantId;
  const activas = [...control.memberships.values()].filter(
    (m) => m.googleSub === ctx.googleSub && m.estado === "activo" && control.tenants.has(m.tenantId),
  );
  return activas.length === 1 ? activas[0]!.tenantId : null;
}

const ERRORES: Record<MotivoNoCierre, [string, number]> = {
  no_dueno: ["Solo el Dueño puede cerrar la cuenta.", 403],
  ya_cerrada: ["La cuenta ya está cerrada.", 409],
  estado_invalido: ["La cuenta todavía no está lista para cerrarse.", 409],
  nombre_no_coincide: ["El nombre no coincide con el del comercio.", 422],
};

export const POST: APIRoute = async ({ request }) => {
  const ctx = resolverSesion(request);
  if (!ctx) return jsonError("Iniciá sesión con Google para continuar.", 403);
  const tenantId = tenantDeSesion(ctx);
  const tenant = tenantId ? control.tenants.get(tenantId) : undefined;
  if (!tenantId || !tenant) return jsonError("No tenés permiso en este comercio.", 403);
  const m = membershipActiva(tenantId, ctx.googleSub);
  if (!m || m.rol !== "dueno") return jsonError(ERRORES.no_dueno[0], ERRORES.no_dueno[1]);
  const reauth = exigirReauthReciente(ctx);
  if (reauth) return reauth;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("El cuerpo no es JSON válido.", 422);
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return jsonError("Escribí el nombre del comercio.", 422);
  const d = decidir_cierre({
    esDueno: true,
    estado: tenant.estado,
    nombreComercio: tenant.nombreComercio,
    nombreEscrito: parsed.data.nombre_comercio,
  });
  if (!d.ok) {
    const [msg, status] = ERRORES[d.motivo];
    return jsonError(msg, status);
  }
  const r = await cerrarCuenta({ tenantId, googleSub: ctx.googleSub });
  return Response.json(
    { ok: true, mp_pendiente: r.mpPendientes.length > 0, email_encolado: r.emailEncolado },
    { status: 200 },
  );
};
