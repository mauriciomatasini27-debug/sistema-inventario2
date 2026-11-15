import type { APIRoute } from "astro";
import { adminStore } from "../../../lib/admin-store.js";
import { exigirAdminListo } from "./_guard.js";

export const prerender = false;

// GET /api/admin/actos?limite= — últimos actos (PA2). Sin prev_hash crudo ni
// detalle con PII: hash corto + kind + tenant + actor + fecha + origen.
export const GET: APIRoute = async ({ request }) => {
  const admin = await exigirAdminListo(request);
  if (admin instanceof Response) return admin;

  const url = new URL(request.url);
  const limite = Math.min(Math.max(Number(url.searchParams.get("limite") ?? 50) || 50, 1), 200);
  const tenantId = url.searchParams.get("tenant_id") ?? url.searchParams.get("tenant");
  const desde = url.searchParams.get("desde") ?? "";
  const hasta = url.searchParams.get("hasta") ?? "";
  const actos = adminStore.actos
    .filter((a) => !tenantId || a.tenantId === tenantId)
    .filter((a) => !desde || a.creadoEn >= desde)
    .filter((a) => !hasta || a.creadoEn <= hasta)
    .slice(-limite)
    .reverse()
    .map((a) => ({
      hash: a.hash.slice(0, 8),
      kind: a.actoKind,
      tenantId: a.tenantId,
      actor: a.actorGoogleSub.slice(0, 12) + "…",
      creadoEn: a.creadoEn,
      origen: a.origen,
    }));
  return Response.json({ actos }, { status: 200 });
}
