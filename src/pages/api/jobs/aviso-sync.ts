import type { APIRoute } from "astro";
import { correrJob } from "../../../lib/jobs-tenant.js";
import { ejecutarAvisoSyncDuro } from "../../../jobs/aviso-sync.js";

export const prerender = false;

// Solo con X-Job-Secret. Con base viva lee `device_sync_state` del comercio
// y reclama cada nivel con UPDATE condicional (sin doble aviso); en multi
// sin base responde 503 por tenant (fail-closed) y en single sin base lee
// la memoria. En multi sin X-Tenant-Id corre por tenant (SEC4-S2).
export const POST: APIRoute = async ({ request }) =>
  correrJob(request, async () => Response.json(await ejecutarAvisoSyncDuro(new Date()), { status: 200 }));
