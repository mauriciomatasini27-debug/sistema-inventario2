import type { APIRoute } from "astro";
import { ingerirOcr, respuestaIngesta } from "../../../lib/ocr-ingesta.js";

export const prerender = false;

// POST /api/ocr/jobs — ingesta WA/Gmail con Idempotency-Key = wamid/message-id.
// Cáscara fina: la ingesta vive en `src/lib/ocr-ingesta.ts`, compartida con el
// webhook de WhatsApp. E2: clave repetida → 200 con job existente sin
// reprocesar. E3: no comprobante → 415. C1: el job se procesa inline
// (en_cola → listo); C2 lo atiende pg-boss manteniendo este contrato.
export const POST: APIRoute = async ({ request }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "json invalido" }, { status: 422 });
  }
  const r = await ingerirOcr({ idempotencyKey: request.headers.get("Idempotency-Key") ?? "", body });
  const http = respuestaIngesta(r);
  return Response.json(http.body, { status: http.status });
};