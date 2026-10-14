import type { APIRoute } from "astro";
import { gateJob } from "../../../lib/tenant-context.js";
import { correrJob } from "../../../lib/jobs-tenant.js";
import { clasificarLotes, listarLotes } from "../../../lib/repos/lotes.js";

export const prerender = false;

// POST /api/jobs/vencimientos-lotes — CAT-S4 alertas 15/7/3d + expone a bot promos.
// Clasifica los lotes del tenant que resuelve gateJob (en single, el contexto
// actual como hoy). Sin request corre sobre el contexto actual.
export const POST: APIRoute = async (ctx) => {
  const request = (ctx as unknown as { request?: Request } | undefined)?.request;
  const correr = async (): Promise<Response> => {
    const lotes = await listarLotes();
    return Response.json(clasificarLotes(lotes, Date.now()));
  };
  if (!request) return correr();
  // Sin secreto corre en el contexto actual como hoy; correrJob reevalúa el gate.
  if (!gateJob(request)) return correr();
  return correrJob(request, correr);
};
