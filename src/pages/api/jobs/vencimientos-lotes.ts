import type { APIRoute } from "astro";
import { correrJobVencimientos } from "../../../lib/jobs-tenant.js";
import { clasificarLotes, darDeBajaVencidos, listarLotes } from "../../../lib/repos/lotes.js";

export const prerender = false;

// POST /api/jobs/vencimientos-lotes — CAT-S4 alertas 15/7/3d + baja de
// vencidos como merma + expone a bot promos. Clasifica los lotes del tenant
export const POST: APIRoute = async (ctx) => {
  const request = ctx.request;
  const correr = async (): Promise<Response> => {
    const lotes = await listarLotes();
    const clasificacion = clasificarLotes(lotes, Date.now());
    const bajas_merma = await darDeBajaVencidos(clasificacion.vencidos);
    return Response.json({ ...clasificacion, bajas_merma });
  };
  return correrJobVencimientos(request, correr, correr);
};
