import type { APIRoute } from "astro";
import { z } from "zod";
import { control } from "../../../lib/store.js";
import { jsonError, membershipActiva, resolverSesion, type ContextoAuth } from "../../../lib/control.js";
import { BaseNoDisponible } from "../../../lib/server-db.js";
import { planDe } from "../../../modules/planes/catalogo.js";
import { leerCatalogo, solicitarSuscripcionPlan } from "../../../lib/repos/planes.js";

export const prerender = false;

// P1-91 (PRD-PLAN-03 PLAN3-S3): el Dueño pide la suscripción real de MP.
// El body arma la preaprobación sin plan con el monto del catálogo tal cual
// (los ARS los define Mauri; no se convierte ni se publica precio). Devuelve
// init_point para que la web mande al checkout. El tenant sale de la sesión.

function tenantDeSesion(ctx: ContextoAuth): string | null {
  if (ctx.tenantId && control.tenants.has(ctx.tenantId)) return ctx.tenantId;
  const activas = [...control.memberships.values()].filter(
    (m) => m.googleSub === ctx.googleSub && m.estado === "activo" && control.tenants.has(m.tenantId),
  );
  return activas.length === 1 ? activas[0]!.tenantId : null;
}

const suscribirSchema = z.object({ plan: z.string().min(1, "Plan requerido.") });

export const POST: APIRoute = async ({ request }) => {
  const ctx = resolverSesion(request);
  if (!ctx) return jsonError("Iniciá sesión con Google para continuar.", 403);
  const tenantId = tenantDeSesion(ctx);
  if (!tenantId) return jsonError("No tenés permiso en este comercio.", 403);
  const m = membershipActiva(tenantId, ctx.googleSub);
  if (!m || m.rol !== "dueno") return jsonError("Solo el Dueño puede suscribirse.", 403);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("El cuerpo no es JSON válido.", 422);
  }
  const parsed = suscribirSchema.safeParse(body);
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? "Datos inválidos.", 422);

  const payerEmail = control.users.get(ctx.googleSub)?.email ?? "";
  if (!payerEmail) return jsonError("Falta el email del Dueño para el cobro.", 422);

  try {
    const catalogo = await leerCatalogo();
    const plan = planDe(catalogo, parsed.data.plan);
    const backUrl = new URL("/panel/plan", request.url).toString();
    const r = await solicitarSuscripcionPlan({
      tenantId,
      planId: plan.id,
      payerEmail,
      backUrl,
    });
    if (!r.ok) {
      const status = r.motivo === "sin_credenciales" ? 503 : 502;
      return jsonError(r.motivo === "sin_credenciales" ? "mp_sin_credenciales" : "mp_no_disponible", status);
    }
    return Response.json(
      { preapproval_id: r.preapprovalId, init_point: r.initPoint, plan: plan.id },
      { status: 201 },
    );
  } catch (e) {
    if (e instanceof BaseNoDisponible) return Response.json({ error: "base_no_disponible" }, { status: 503 });
    if (e instanceof Error && e.message.startsWith("plan desconocido")) {
      return jsonError(`Plan desconocido: ${parsed.data.plan}.`, 422);
    }
    throw e;
  }
};
