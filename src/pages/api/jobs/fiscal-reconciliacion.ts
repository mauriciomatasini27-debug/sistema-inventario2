import type { APIRoute } from "astro";
import { correrJob } from "../../../lib/jobs-tenant.js";
import { resolverProvider } from "../../../lib/fiscal-provider.js";
import { obtenerPuertoFiscal, resolverCuitFiscal } from "../../../lib/repos/fiscal.js";
import { ejecutarReconciliacionFiscal } from "../../../jobs/fiscal-reconciliacion.js";

export const prerender = false;

// POST /api/jobs/fiscal-reconciliacion — FE-S19. Recorre los comercios con
// X-Job-Secret y drena sus comprobantes varados sin esperar a una venta nueva.
// Con un CUIT sin configurar responde `omitido` en vez de fallar el fan-out.
export const POST: APIRoute = async ({ request }) =>
  correrJob(request, async () => {
    const cuit = await resolverCuitFiscal(undefined);
    if (cuit === null) return Response.json({ omitido: "sin_cuit" });
    const r = await ejecutarReconciliacionFiscal({
      cuit,
      provider: resolverProvider(),
      puerto: obtenerPuertoFiscal(),
    });
    return Response.json(r);
  });
