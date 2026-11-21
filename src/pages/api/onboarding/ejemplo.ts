import type { APIRoute } from "astro";
import { control } from "../../../lib/store.js";
import { jsonError, membershipActiva, resolverSesion } from "../../../lib/control.js";
import { ejemploSchema } from "../../../lib/validation.js";
import { expira_ejemplo, plantilla_ejemplo } from "../../../modules/onboarding/ejemplo.js";
import { nombreDatabase } from "../../../modules/tenants/aprovisionar.js";

export const prerender = false;

// La demo vive separada con es_demo true, modo simulado y banda fija.
export const POST: APIRoute = async ({ request }) => {
  const ctx = resolverSesion(request);
  if (!ctx) return jsonError("Iniciá sesión con Google para continuar.", 403);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("El cuerpo no es JSON válido.", 422);
  }
  const parsed = ejemploSchema.safeParse(body);
  if (!parsed.success) return jsonError("Datos inválidos.", 422);
  const m = membershipActiva(parsed.data.tenant_id, ctx.googleSub);
  if (!m) return jsonError("No tenés permiso en este comercio.", 403);
  const ahora = new Date();

  if (parsed.data.accion === "descartar") {
    const ejemplo = [...control.ejemplos.values()].find((e) => e.tenantRealId === parsed.data.tenant_id);
    if (ejemplo) {
      const t = control.tenants.get(ejemplo.tenantDemoId);
      if (t) t.estado = "baja";
      control.ejemplos.delete(ejemplo.tenantDemoId);
    }
    return Response.json({ activo: false });
  }

  const existente = [...control.ejemplos.values()].find((e) => e.tenantRealId === parsed.data.tenant_id);
  if (existente) {
    return Response.json({
      activo: true,
      tenant_demo_id: existente.tenantDemoId,
      banda: "Estás viendo datos de ejemplo",
    });
  }
  const demoId = crypto.randomUUID();
  const plantilla = plantilla_ejemplo(parsed.data.rubro);
  control.tenants.set(demoId, {
    id: demoId,
    nombreComercio: `Ejemplo ${parsed.data.rubro}`,
    slug: `ejemplo-${demoId.slice(0, 8)}`,
    estado: "activo",
    plan: "demo",
    moneda: "ARS",
    ownerGoogleSub: ctx.googleSub,
    esDemo: true,
    trialHasta: expira_ejemplo(ahora),
  });
  control.databases.set(demoId, { tenantId: demoId, database: nombreDatabase(demoId), estado: "lista" });
  control.ejemplos.set(demoId, {
    tenantDemoId: demoId,
    tenantRealId: parsed.data.tenant_id,
    rubro: parsed.data.rubro,
    creadoAt: ahora.toISOString(),
    expiraAt: expira_ejemplo(ahora),
  });
  void plantilla;
  return Response.json(
    { activo: true, tenant_demo_id: demoId, banda: "Estás viendo datos de ejemplo" },
    { status: 201 },
  );
};
