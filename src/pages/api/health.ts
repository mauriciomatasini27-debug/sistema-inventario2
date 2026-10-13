import type { APIRoute } from "astro";

export const prerender = false;

// GET /api/health — SYNC-S3 (OF5): ping para el indicador verde/ámbar.
// Nunca usa navigator.onLine; el cliente pinge acá y combina con pendientes.
export const GET: APIRoute = async () => {
  return Response.json({ ok: true, ahora: new Date().toISOString() }, { status: 200 });
};
