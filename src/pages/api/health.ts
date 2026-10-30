import type { APIRoute } from "astro";
import { leerVarEntorno } from "../../lib/env.js";

export const prerender = false;

// GET /api/health — SYNC-S3 (OF5): ping para el indicador verde/ámbar.
// Nunca usa navigator.onLine; el cliente pinge acá y combina con pendientes.
// Flags env (solo presencia, sin valores): diagnostican deploy Vercel sin
// filtrar secretos. Quitar cuando Production lea las vars.
export const GET: APIRoute = async () => {
  const tieneGoogle = Boolean(
    leerVarEntorno("GOOGLE_LOGIN_CLIENT_ID") &&
      leerVarEntorno("GOOGLE_LOGIN_CLIENT_SECRET") &&
      leerVarEntorno("GOOGLE_LOGIN_REDIRECT"),
  );
  const tieneDb = Boolean(
    leerVarEntorno("CONTROL_DATABASE_URL") && leerVarEntorno("TENANT_DATABASE_URL"),
  );
  const tieneJobs = Boolean(leerVarEntorno("JOBS_SECRET"));
  return Response.json(
    { ok: true, ahora: new Date().toISOString(), tieneGoogle, tieneDb, tieneJobs },
    { status: 200 },
  );
};
