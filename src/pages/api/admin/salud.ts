import type { APIRoute } from "astro";
import { control } from "../../../lib/store.js";
import { adminStore } from "../../../lib/admin-store.js";
import { exigirAdmin } from "./_guard.js";

export const prerender = false;

// GET /api/admin/salud — contadores por tenant (PA4). Solo gestión: id, plan,
// estado visto y contadores. Nunca email/nombre del comerciante, nunca negocio.
export const GET: APIRoute = async ({ request }) => {
  const admin = exigirAdmin(request);
  if (admin instanceof Response) return admin;

  const tenantId = new URL(request.url).searchParams.get("tenant_id");
  if (tenantId) {
    const h = adminStore.health.get(tenantId);
    if (!h) return Response.json({ error: "No tenés permiso para ver el panel." }, { status: 404 });
    return Response.json({ salud: [serializar(h)] }, { status: 200 });
  }

  // Sin reader corriendo: proyección en vivo desde control (foto, no negocio).
  if (adminStore.health.size === 0) {
    const proyeccion = [...control.tenants.values()].map((t) => ({
      tenantId: t.id,
      plan: t.plan,
      estadoVisto: t.estado,
      ticketsHoy: 0,
      demosPurgadas: 0,
      cobrosCentavos: "0",
      ultimaSenalEn: null,
      actualizadoEn: new Date().toISOString(),
      fuente: "proyeccion",
    }));
    return Response.json({ salud: proyeccion }, { status: 200 });
  }
  return Response.json({ salud: [...adminStore.health.values()].map(serializar) }, { status: 200 });
};

function serializar(h: {
  tenantId: string;
  plan: string;
  estadoVisto: string;
  ticketsHoy: number;
  demosPurgadas: number;
  cobrosCentavos: bigint;
  ultimaSenalEn: string | null;
  actualizadoEn: string;
}): Record<string, unknown> {
  return {
    tenantId: h.tenantId,
    plan: h.plan,
    estadoVisto: h.estadoVisto,
    ticketsHoy: h.ticketsHoy,
    demosPurgadas: h.demosPurgadas,
    cobrosCentavos: h.cobrosCentavos.toString(),
    ultimaSenalEn: h.ultimaSenalEn,
    actualizadoEn: h.actualizadoEn,
    fuente: "senales",
  };
}
