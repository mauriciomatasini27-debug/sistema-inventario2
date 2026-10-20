import type { APIRoute } from "astro";
import { correrJob } from "../../../lib/jobs-tenant.js";
import { ejecutarJobGmail } from "../../../jobs/gmail.js";
import { reclamarJobsGmail } from "../../../lib/repos/gmail-cola.js";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  return correrJob(request, async (tenantId) => {
    const jobs = await reclamarJobsGmail({ tenantId, limite: 10 });
    const resultados = [];
    for (const job of jobs) {
      const estado = await ejecutarJobGmail(job);
      resultados.push({ id: job.id, tenant_id: job.tenantId, estado });
    }
    return Response.json({ procesados: resultados.length, resultados }, { status: 200 });
  });
};
