import type { APIRoute } from "astro";
import { correrJobVencimientos } from "../../../lib/jobs-tenant.js";
import { listarVencimientos, marcarAvisados } from "../../../lib/repos/caja.js";
import { avisosVencimientosCaja } from "../../../jobs/vencimientos-caja.js";

export const prerender = false;

// POST /api/jobs/vencimientos-caja — CAJA-S3 aviso a 3 días.
// Sin secreto corre en el contexto actual solo en single; en multi exige
// X-Job-Secret válido (M1, 401). Con secreto válido usa correrJob con
// fan-out por tenant (SEC-04/ADR-0077). Marca avisado_el en los pendientes
// que vencen dentro de 3 días (idempotente: el segundo corre avisa 0) y
// devuelve los avisados; el canal se conecta después.
export const POST: APIRoute = async (ctx) => {
  const request = ctx.request;
  const correr = async (): Promise<Response> => {
    const ahoraMs = Date.now();
    const ahoraIso = new Date(ahoraMs).toISOString();
    const lista = await listarVencimientos();
    const candidatos = avisosVencimientosCaja(lista, ahoraMs);
    const marcados = new Set(await marcarAvisados(candidatos.map((c) => c.id), ahoraIso));
    return Response.json({ avisados: candidatos.filter((c) => marcados.has(c.id)) });
  };
  return correrJobVencimientos(request, correr, correr);
};
