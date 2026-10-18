import type { APIRoute } from "astro";
import { z } from "zod";
import { control } from "../../../lib/store.js";
import { jsonError, membershipActiva, resolverSesion, type ContextoAuth } from "../../../lib/control.js";
import { BaseNoDisponible } from "../../../lib/server-db.js";
import { cambioDePlan, planDe, type PlanId } from "../../../modules/planes/catalogo.js";
import { fechaCambioDePlan, inicioDiaAR } from "../../../modules/planes/ciclo.js";
import { leerCatalogo, leerSuscripcionActiva, programarCambioPlan } from "../../../lib/repos/planes.js";

export const prerender = false;

// PLAN-S4 (PRD-PLAN-01, ADR-0047): el Dueño pide cambiar de plan. Bajar se
// programa a fin de período sin reintegro; subir espera al proveedor de cobro
// (PLAN-S3) y responde 409; el mismo plan cancela un cambio programado. El
// tenant y el rol salen de la sesión + membership activa, nunca del body.

function tenantDeSesion(ctx: ContextoAuth): string | null {
  if (ctx.tenantId && control.tenants.has(ctx.tenantId)) return ctx.tenantId;
  const activas = [...control.memberships.values()].filter(
    (m) => m.googleSub === ctx.googleSub && m.estado === "activo" && control.tenants.has(m.tenantId),
  );
  return activas.length === 1 ? activas[0]!.tenantId : null;
}

const cambiarSchema = z.object({ plan: z.string().min(1, "Plan requerido." ) });

export const POST: APIRoute = async ({ request }) => {
  const ctx = resolverSesion(request);
  if (!ctx) return jsonError("Iniciá sesión con Google para continuar.", 403);
  const tenantId = tenantDeSesion(ctx);
  if (!tenantId) return jsonError("No tenés permiso en este comercio.", 403);
  const m = membershipActiva(tenantId, ctx.googleSub);
  if (!m || m.rol !== "dueno") return jsonError("Solo el Dueño puede cambiar de plan.", 403);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("El cuerpo no es JSON válido.", 422);
  }
  const parsed = cambiarSchema.safeParse(body);
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? "Datos inválidos.", 422);

  const ahora = new Date();
  try {
    const catalogo = await leerCatalogo();
    let destinoId: PlanId;
    try {
      destinoId = planDe(catalogo, parsed.data.plan).id;
    } catch {
      return jsonError(`Plan desconocido: ${parsed.data.plan}.`, 422);
    }
    const activa = await leerSuscripcionActiva(tenantId);
    if (!activa) return jsonError("sin_suscripcion", 409);

    if (destinoId === activa.planId) {
      if (activa.planProgramado != null) {
        await programarCambioPlan({ tenantId, suscripcionId: activa.id, planProgramado: null, hasta: null });
        control.events.push({
          tenantId,
          tipo: "plan_cambio_cancelado",
          actor: ctx.googleSub,
          detalle: { plan_actual: activa.planId },
          creadoEn: ahora.toISOString(),
        });
      }
      return Response.json({ efecto: "sin_cambio", plan_actual: activa.planId, plan_programado: null, fecha_cambio: null });
    }

    // El prorrateo de subida lo calcula PLAN-S3 con el proveedor de cobro;
    // acá solo se decide el efecto (sin_cambio ya se cortó arriba).
    const efecto = cambioDePlan({ actualId: activa.planId, destinoId, diaDelCiclo: 1, diasCiclo: 30 });
    if (efecto.efecto !== "fin_de_ciclo") return jsonError("requiere_cobro", 409);

    const fechaCambio = fechaCambioDePlan({ desde: activa.desde ?? null, hasta: activa.hasta ?? null, ahora });
    await programarCambioPlan({
      tenantId,
      suscripcionId: activa.id,
      planProgramado: efecto.planProgramado,
      hasta: inicioDiaAR(fechaCambio),
    });
    control.events.push({
      tenantId,
      tipo: "plan_baja_programada",
      actor: ctx.googleSub,
      detalle: { plan_actual: activa.planId, plan_programado: efecto.planProgramado, fecha_cambio: fechaCambio },
      creadoEn: ahora.toISOString(),
    });
    return Response.json({
      efecto: "fin_de_ciclo",
      plan_actual: activa.planId,
      plan_programado: efecto.planProgramado,
      fecha_cambio: fechaCambio,
    });
  } catch (e) {
    if (e instanceof BaseNoDisponible) return Response.json({ error: "base_no_disponible" }, { status: 503 });
    throw e;
  }
};
