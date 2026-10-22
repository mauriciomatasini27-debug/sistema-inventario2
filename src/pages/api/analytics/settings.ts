import type { APIRoute } from "astro";
import { z } from "zod";
import { control } from "../../../lib/store.js";
import { jsonError, membershipActiva, resolverSesion, type ContextoAuth } from "../../../lib/control.js";
import { guardarRotationSettings, leerRotationSettings } from "../../../lib/repos/rotation-settings.js";
import { BaseNoDisponible } from "../../../lib/server-db.js";
import { rotationSettingsSchema } from "../../../lib/validation-analytics.js";
import type { RotationSettings } from "../../../modules/analytics/tipos.js";

export const prerender = false;

function tenantDeSesion(ctx: ContextoAuth): string | null {
  if (ctx.tenantId && control.tenants.has(ctx.tenantId)) return ctx.tenantId;
  const activas = [...control.memberships.values()].filter(
    (m) => m.googleSub === ctx.googleSub && m.estado === "activo" && control.tenants.has(m.tenantId),
  );
  return activas.length === 1 ? activas[0]!.tenantId : null;
}

type DuenoResuelto = { ok: true; tenantId: string } | { ok: false; respuesta: Response };

function exigirDueno(request: Request): DuenoResuelto {
  const ctx = resolverSesion(request);
  if (!ctx) return { ok: false, respuesta: jsonError("Iniciá sesión con Google para continuar.", 403) };
  const tenantId = tenantDeSesion(ctx);
  if (!tenantId) return { ok: false, respuesta: jsonError("No tenés permiso en este comercio.", 403) };
  const m = membershipActiva(tenantId, ctx.googleSub);
  if (!m || m.rol !== "dueno") {
    return { ok: false, respuesta: jsonError("Solo el Dueño puede gestionar la configuración de reportes.", 403) };
  }
  return { ok: true, tenantId };
}

function aDominio(b: z.infer<typeof rotationSettingsSchema>): RotationSettings {
  return {
    ventanaCoberturaDias: b.ventana_cobertura_dias,
    dormidoN: b.dormido_n,
    dormidoX: b.dormido_x,
    coberturaReponerDias: b.cobertura_reponer_dias,
    abcCorteA_bp: b.abc_corte_a_bp,
    abcCorteB_bp: b.abc_corte_b_bp,
    abcMinDias: b.abc_min_dias,
    markupMinBp: b.markup_min_bp,
  };
}

// GET /api/analytics/settings — configuración vigente de rotación (solo Dueño).
export const GET: APIRoute = async ({ request }) => {
  const auth = exigirDueno(request);
  if (!auth.ok) return auth.respuesta;
  try {
    return Response.json({ settings: await leerRotationSettings() });
  } catch (e) {
    if (e instanceof BaseNoDisponible) return Response.json({ error: "base_no_disponible" }, { status: 503 });
    throw e;
  }
};

// PUT /api/analytics/settings — body completo; reemplaza la fila única.
export const PUT: APIRoute = async ({ request }) => {
  const auth = exigirDueno(request);
  if (!auth.ok) return auth.respuesta;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "json invalido" }, { status: 422 });
  }
  const parsed = rotationSettingsSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "configuración inválida" }, { status: 422 });
  try {
    const settings = await guardarRotationSettings(aDominio(parsed.data));
    return Response.json({ settings });
  } catch (e) {
    if (e instanceof BaseNoDisponible) return Response.json({ error: "base_no_disponible" }, { status: 503 });
    throw e;
  }
};
