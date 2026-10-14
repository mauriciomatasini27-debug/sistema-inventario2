import type { APIRoute } from "astro";
import { gateJob } from "../../../lib/tenant-context.js";
import { conTenant } from "../../../lib/tenant-mode.js";
import { BaseNoDisponible } from "../../../lib/server-db.js";
import { clasificarLotes, listarLotes } from "../../../lib/repos/lotes.js";

export const prerender = false;

// POST /api/jobs/vencimientos-lotes — CAT-S4 alertas 15/7/3d + expone a bot promos.
// Clasifica los lotes del tenant que resuelve gateJob (en single, el contexto
// actual como hoy). Sin request corre sobre el contexto actual.
export const POST: APIRoute = async (ctx) => {
  const request = (ctx as unknown as { request?: Request } | undefined)?.request;
  const correr = async (): Promise<Response> => {
    let lotes: Awaited<ReturnType<typeof listarLotes>>;
    try {
      lotes = await listarLotes();
    } catch (e) {
      if (e instanceof BaseNoDisponible) return Response.json({ error: "base_no_disponible" }, { status: 503 });
      throw e;
    }
    return Response.json(clasificarLotes(lotes, Date.now()));
  };
  if (!request) return correr();
  const g = gateJob(request);
  if (!g) return correr();
  if (!g.ok) return g.respuesta;
  return conTenant(g.tenantId, correr);
};
