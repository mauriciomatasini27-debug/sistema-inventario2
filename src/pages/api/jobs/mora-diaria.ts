import type { APIRoute } from "astro";
import { ejecutarMoraDiaria } from "../../../jobs/mora-diaria.js";

export const prerender = false;

// POST /api/jobs/mora-diaria — reconciliación diaria PA7 (06:00 BA).
// Solo con X-Job-Secret (el middleware deja pasar jobs sin sesión).
export const POST: APIRoute = async ({ request }) => {
  const secret = process.env.JOBS_SECRET;
  if (!secret || request.headers.get("X-Job-Secret") !== secret) {
    return Response.json({ error: "no autorizado" }, { status: 403 });
  }
  const r = ejecutarMoraDiaria(new Date());
  return Response.json(r, { status: 200 });
};
