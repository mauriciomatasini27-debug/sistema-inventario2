import type { APIRoute } from "astro";
import { gateJob } from "../../../lib/tenant-context.js";
import { correrJob } from "../../../lib/jobs-tenant.js";
import { listarVencimientos, marcarAvisados } from "../../../lib/repos/caja.js";
import { avisosVencimientosCaja } from "../../../jobs/vencimientos-caja.js";

export const prerender = false;

// POST /api/jobs/vencimientos-caja — CAJA-S3 aviso a 3 días.
// Corre con X-Job-Secret con fan-out por tenant (SEC-04/ADR-0077); sin
// secreto corre en el contexto actual como hoy. Marca avisado_el en los
// pendientes que vencen dentro de 3 días (idempotente: el segundo corre
// avisa 0) y devuelve los avisados; el canal se conecta después.
export const POST: APIRoute = async (ctx) => {
  const request = (ctx as unknown as { request?: Request } | undefined)?.request;
  const correr = async (): Promise<Response> => {
    const ahoraMs = Date.now();
    const ahoraIso = new Date(ahoraMs).toISOString();
    const lista = await listarVencimientos();
    const candidatos = avisosVencimientosCaja(lista, ahoraMs);
    const marcados = new Set(await marcarAvisados(candidatos.map((c) => c.id), ahoraIso));
    return Response.json({ avisados: candidatos.filter((c) => marcados.has(c.id)) });
  };
  if (!request) return correr();
  // Sin secreto corre en el contexto actual como hoy; correrJob reevalúa el gate.
  if (!gateJob(request)) return correr();
  return correrJob(request, correr);
};
