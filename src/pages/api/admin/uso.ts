import type { APIRoute } from "astro";
import { fechaAR, parseFechaAR } from "../../../lib/fecha-ar.js";
import { adminStore } from "../../../lib/admin-store.js";
import { jsonError } from "../../../lib/control.js";
import { control } from "../../../lib/store.js";
import { filasUsoMargen } from "../../../modules/admin/uso-margen.js";
import { exigirAdminListo } from "./_guard.js";

export const prerender = false;

// ADMIN-USO-DIARIO: GET de gestión. Arma cada fila con id, slug y plan; no
// copia el nombre del comercio ni abre la base del tenant (ADR-0006).
export const GET: APIRoute = async ({ request }) => {
  const admin = await exigirAdminListo(request);
  if (admin instanceof Response) return admin;

  const url = new URL(request.url);
  const pedido = url.searchParams.get("dia");
  const dia = pedido ?? fechaAR();
  if (!parseFechaAR(dia)) return jsonError("El día tiene que ser AAAA-MM-DD.", 422);

  let tenants = [...control.tenants.values()].map((t) => ({ id: t.id, slug: t.slug, plan: t.plan }));
  const tenantId = url.searchParams.get("tenant_id");
  if (tenantId) {
    tenants = tenants.filter((t) => t.id === tenantId);
    if (tenants.length === 0) return jsonError("Tenant desconocido.", 404);
  }

  return Response.json({
    dia,
    uso: filasUsoMargen({ tenants, usos: [...adminStore.usoDiario.values()], dia }),
  });
};
