import type { APIRoute } from "astro";
import { gateJob } from "../../../lib/tenant-context.js";
import { correrJob } from "../../../lib/jobs-tenant.js";
import { clasificarLotes, darDeBajaVencidos, listarLotes } from "../../../lib/repos/lotes.js";

export const prerender = false;

// POST /api/jobs/vencimientos-lotes — CAT-S4 alertas 15/7/3d + baja de
// vencidos como merma + expone a bot promos. Clasifica los lotes del tenant
// que resuelve gateJob (en single, el contexto actual como hoy), da de baja
// los vencidos (MERMA idempotente) y devuelve promos_vencer para el bot
// (motivo "vencer"). Sin request corre sobre el contexto actual.
export const POST: APIRoute = async (ctx) => {
  const request = (ctx as unknown as { request?: Request } | undefined)?.request;
  const correr = async (): Promise<Response> => {
    const lotes = await listarLotes();
    const clasificacion = clasificarLotes(lotes, Date.now());
    const bajas_merma = await darDeBajaVencidos(clasificacion.vencidos);
    return Response.json({ ...clasificacion, bajas_merma });
  };
  if (!request) return correr();
  // Sin secreto corre en el contexto actual como hoy; correrJob reevalúa el gate.
  if (!gateJob(request)) return correr();
  return correrJob(request, correr);
};
