import type { APIRoute } from "astro";
import { control } from "../../../lib/store.js";
import { jsonError, membershipActiva, resolverSesion } from "../../../lib/control.js";
import { claveOnboarding, estadoInicial } from "../../../modules/onboarding/estado.js";
import { pasos_para_rol } from "../../../modules/onboarding/tour.js";
import { calcular_checklist } from "../../../modules/onboarding/checklist.js";

export const prerender = false;

// GET /api/onboarding/estado?tenant_id= — tour más checklist más video.
// Barato y cacheable del lado cliente. Sin datos de negocio.
export const GET: APIRoute = async ({ request }) => {
  const ctx = resolverSesion(request);
  if (!ctx) return jsonError("Iniciá sesión con Google para continuar.", 403);
  const url = new URL(request.url);
  const tenantId = url.searchParams.get("tenant_id") ?? "";
  if (!tenantId) return jsonError("Falta el comercio.", 422);
  const m = membershipActiva(tenantId, ctx.googleSub);
  if (!m) return jsonError("No tenés permiso en este comercio.", 403);
  const clave = claveOnboarding(ctx.googleSub, tenantId);
  const estado = control.onboardingState.get(clave) ?? estadoInicial(ctx.googleSub, tenantId);
  const pasos = pasos_para_rol(m.rol, m.permisos);
  const tenant = control.tenants.get(tenantId);
  const whatsappVerificado = [...control.botLinks.values()].some(
    (l) => l.tenantId === tenantId && l.googleSub === ctx.googleSub && l.estado === "verificado",
  );
  const checklist = calcular_checklist({
    productos: 0,
    productosConUmbral: 0,
    proveedores: 0,
    invitaciones: 0,
    whatsappVerificado,
  });
  const ejemplo = [...control.ejemplos.values()].find((e) => e.tenantRealId === tenantId) ?? null;
  return Response.json({
    comercio: tenant ? { nombre: tenant.nombreComercio, estado: tenant.estado, plan: tenant.plan } : null,
    whatsapp: { verificado: whatsappVerificado },
    tour: { version: estado.tourVersion, ultimo_paso: estado.tourUltimoPaso, estado: estado.tourEstado, pasos },
    checklist: { listos: checklist.listos, total: checklist.total, pasos: checklist.pasos, oculta: estado.checklistOculta },
    video: { visto: estado.videoVisto, progreso: estado.videoProgreso },
    ejemplo: ejemplo ? { activo: true, tenant_demo_id: ejemplo.tenantDemoId, banda: "Estás viendo datos de ejemplo" } : { activo: false },
  });
};
