import type { APIRoute } from "astro";
import { correrJob } from "../../../lib/jobs-tenant.js";
import { ejecutarVencimientoOcr } from "../../../jobs/vencer-ocr.js";

export const prerender = false;

// X-Tenant-Id corre por tenant (SEC4-S2).
export const POST: APIRoute = async ({ request }) =>
  correrJob(request, async () => Response.json(await ejecutarVencimientoOcr(), { status: 200 }));
