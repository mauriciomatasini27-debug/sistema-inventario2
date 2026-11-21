import type { APIRoute } from "astro";
import { ejecutarRetencionClientes } from "../../../jobs/retencion-clientes.js";

export const prerender = false;

// P10-90: POST /api/jobs/retencion-clientes, diario. Solo con X-Job-Secret.
export const POST: APIRoute = async ({ request }) => {
  const secret = process.env.JOBS_SECRET;
  if (!secret || request.headers.get("X-Job-Secret") !== secret) {
    return Response.json({ error: "no autorizado" }, { status: 403 });
  }
  const r = await ejecutarRetencionClientes(new Date());
  return Response.json(r, { status: 200 });
};
