import type { APIRoute } from "astro";
import { ejecutarVencimientoOcr } from "../../../jobs/vencer-ocr.js";

export const prerender = false;

// POST /api/jobs/vencer-ocr — vencimiento 7d + recuerdo 24h de borradores OCR.
// Solo con X-Job-Secret (el middleware deja pasar jobs sin sesión).
export const POST: APIRoute = async ({ request }) => {
  const secret = process.env.JOBS_SECRET;
  if (!secret || request.headers.get("X-Job-Secret") !== secret) {
    return Response.json({ error: "no autorizado" }, { status: 403 });
  }
  return Response.json(ejecutarVencimientoOcr(), { status: 200 });
};
