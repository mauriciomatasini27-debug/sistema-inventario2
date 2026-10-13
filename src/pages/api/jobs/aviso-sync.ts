import type { APIRoute } from "astro";
import { ejecutarAvisoSync } from "../../../jobs/aviso-sync.js";

export const prerender = false;

// POST /api/jobs/aviso-sync — job diario SYNC-S4 (24/60/72h + cuarentena).
// Solo con X-Job-Secret (el middleware deja pasar jobs sin sesión).
export const POST: APIRoute = async ({ request }) => {
  const secret = process.env.JOBS_SECRET;
  if (!secret || request.headers.get("X-Job-Secret") !== secret) {
    return Response.json({ error: "no autorizado" }, { status: 403 });
  }
  const r = ejecutarAvisoSync(new Date());
  return Response.json(r, { status: 200 });
};
