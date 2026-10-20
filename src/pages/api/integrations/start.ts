import type { APIRoute } from "astro";
import { z } from "zod";
import { exigirDuenoDeRequest } from "../../../lib/tenant-context.js";
import {
  CONSENTIMIENTO_GOOGLE_VERSION,
  construirUrlAutorizacionGmail,
  cookieEstado,
  firmarEstado,
  generarPKCE,
  leerConfigIntegracionGmail,
  nuevoNonce,
  nuevoState,
} from "../../../modules/integraciones/google-oauth.js";

export const prerender = false;

const bodySchema = z.object({
  tipo: z.literal("gmail"),
  consentimiento_version: z.literal(CONSENTIMIENTO_GOOGLE_VERSION),
});

const DIEZ_MINUTOS_MS = 10 * 60 * 1000;

// POST /api/integrations/start — solo Dueño y con consentimiento versionado.
// Devuelve un 303 a Google y deja en una cookie HttpOnly el state firmado.
export const POST: APIRoute = async ({ request }) => {
  const dueno = exigirDuenoDeRequest(request);
  if (!dueno.ok) return dueno.respuesta;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "json invalido" }, { status: 422 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "consentimiento_invalido", version: CONSENTIMIENTO_GOOGLE_VERSION },
      { status: 422 },
    );
  }

  let config;
  try {
    config = leerConfigIntegracionGmail();
  } catch {
    return Response.json({ error: "integracion_no_configurada" }, { status: 503 });
  }

  const pkce = generarPKCE();
  const state = nuevoState();
  const nonce = nuevoNonce();
  let firmado: string;
  try {
    firmado = firmarEstado({
      state,
      verifier: pkce.verifier,
      nonce,
      tenantId: dueno.tenantId,
      googleSub: dueno.ctx.googleSub,
      tipo: "gmail",
      exp: Date.now() + DIEZ_MINUTOS_MS,
    });
  } catch {
    return Response.json({ error: "integracion_no_configurada" }, { status: 503 });
  }

  const location = construirUrlAutorizacionGmail({
    config,
    state,
    nonce,
    codeChallenge: pkce.challenge,
  });
  return new Response(null, {
    status: 303,
    headers: {
      Location: location,
      "Set-Cookie": cookieEstado(firmado),
      "Cache-Control": "no-store",
    },
  });
};
