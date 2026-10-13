import type { APIRoute } from "astro";
import { ejecutarPurgaDemos } from "../../../jobs/purga-demos.js";

export const prerender = false;

// POST /api/jobs/purgar-demos — purga demos con trial vencido (ON2, 14d).
// Solo con X-Job-Secret (el middleware deja pasar jobs sin sesión).
export const POST: APIRoute = async ({ request }) => {
  const secret = process.env.JOBS_SECRET;
  if (!secret || request.headers.get("X-Job-Secret") !== secret) {
    return Response.json({ error: "no autorizado" }, { status: 403 });
  }
  const r = ejecutarPurgaDemos(new Date());
  return Response.json(r, { status: 200 });
};
