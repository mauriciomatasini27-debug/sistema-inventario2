import type { APIRoute } from "astro";
import { ejecutarVerificacionHash } from "../../../jobs/verificar-hash.js";

export const prerender = false;

// POST /api/jobs/verificar-hash — verificación nocturna PA2.
// Solo con X-Job-Secret (el middleware deja pasar jobs sin sesión).
export const POST: APIRoute = async ({ request }) => {
  const secret = process.env.JOBS_SECRET;
  if (!secret || request.headers.get("X-Job-Secret") !== secret) {
    return Response.json({ error: "no autorizado" }, { status: 403 });
  }
  const r = ejecutarVerificacionHash(new Date());
  return Response.json(r, { status: 200 });
};
