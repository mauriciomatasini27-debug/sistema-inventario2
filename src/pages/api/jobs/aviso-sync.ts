import type { APIRoute } from "astro";
import { correrJob } from "../../../lib/jobs-tenant.js";
import { ejecutarAvisoSync } from "../../../jobs/aviso-sync.js";

export const prerender = false;

// POST /api/jobs/aviso-sync — job diario SYNC-S4 (24/60/72h + cuarentena).
// Solo con X-Job-Secret. Lee la memoria del comercio: en multi sin
// X-Tenant-Id corre por tenant (SEC4-S2).
export const POST: APIRoute = async ({ request }) =>
  correrJob(request, async () => Response.json(ejecutarAvisoSync(new Date()), { status: 200 }));
