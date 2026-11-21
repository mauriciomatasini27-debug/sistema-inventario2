import type { APIRoute } from "astro";
import { z } from "zod";
import { persistirPlanTenant, listarYSincronizarTenantsControl } from "../../../../lib/control-db.js";
import { contarMiembrosActivos } from "../../../../lib/control.js";
import { control } from "../../../../lib/store.js";
import { aplicarUpgradeInmediato, leerSuscripcionActiva } from "../../../../lib/repos/planes.js";
import {
  esPlanAdmin,
  limiteUsuariosDe,
  planCatalogoDe,
  type PlanAdmin,
} from "../../../../modules/tenants/planes-admin.js";
import { auditar, exigirAdminMutante, leerJson } from "../_guard.js";

export const prerender = false;

// POST /api/admin/tenants/plan — cambia el plan del comercio.
// No pide confirmo_id: no es una acción destructiva. Motivo es optativo.
// Si el cupo de usuarios del plan nuevo queda por debajo de los miembros
// actuales, se permite igual: no se echa a nadie, pero no se pueden invitar más.

async function sincronizarSuscripcion(tenantId: string, plan: PlanAdmin): Promise<void> {
  const activa = await leerSuscripcionActiva(tenantId);
  if (!activa) return;
  const destino = planCatalogoDe(plan);
  if (activa.planId === destino && activa.planProgramado == null) return;
  await aplicarUpgradeInmediato({ tenantId, suscripcionId: activa.id, planId: destino });
}

export const POST: APIRoute = async ({ request }) => {
  const admin = await exigirAdminMutante(request);
  if (admin instanceof Response) return admin;
  const body = await leerJson(request);
  if (body instanceof Response) return body;
  const parsed = z
    .object({
      tenant_id: z.string().min(1),
      plan: z.string().min(1),
      motivo: z.string().max(280).optional(),
    })
    .safeParse(body);
  if (!parsed.success) return Response.json({ error: "Datos inválidos." }, { status: 422 });
  if (!esPlanAdmin(parsed.data.plan)) {
    return Response.json({ error: "El plan es inválido. Usá demo, base o plus." }, { status: 422 });
  }
  const plan = parsed.data.plan;
  let t = control.tenants.get(parsed.data.tenant_id);
  if (!t) {
    await listarYSincronizarTenantsControl();
    t = control.tenants.get(parsed.data.tenant_id);
  }
  if (!t) return Response.json({ error: "Tenant desconocido." }, { status: 404 });

  const ocupados = contarMiembrosActivos(t.id);
  const limiteNuevo = limiteUsuariosDe(plan);
  const usuarios = {
    ocupados,
    limite_anterior: limiteUsuariosDe(t.plan),
    limite_nuevo: limiteNuevo,
  };
  const excede_cupo = ocupados > limiteNuevo;

  if (t.plan === plan) {
    return Response.json({ tenant_id: t.id, plan, ya: true, usuarios, excede_cupo }, { status: 200 });
  }

  const de = t.plan;
  t.plan = plan;
  const persistio = await persistirPlanTenant(t.id, plan);
  if (!persistio && process.env.CONTROL_DATABASE_URL) {
    t.plan = de;
    return Response.json({ error: "No se pudo guardar el plan. Probá de nuevo." }, { status: 503 });
  }
  try {
    await sincronizarSuscripcion(t.id, plan);
  } catch (e) {
    console.warn("no se pudo sincronizar la suscripción al cambiar el plan", e instanceof Error ? e.message : e);
  }

  const motivo = parsed.data.motivo?.trim();
  auditar(
    motivo
      ? { kind: "cambio_plan", tenantId: t.id, de, a: plan, motivo }
      : { kind: "cambio_plan", tenantId: t.id, de, a: plan },
    admin.googleSub,
    "panel",
  );
  return Response.json({ tenant_id: t.id, plan, de, usuarios, excede_cupo }, { status: 200 });
};
