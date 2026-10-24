import type { APIRoute } from "astro";
import { z } from "zod";
import { control } from "../../../lib/store.js";
import { exigirDuenoDeRequest } from "../../../lib/tenant-context.js";
import {
  CONSENTIMIENTO_GOOGLE_VERSION,
  construirUrlAutorizacionGmail,
  cookieEstado,
  decidirInicioGmail,
  firmarEstado,
  generarPKCE,
  leerConfigIntegracionGmail,
  normalizarEmailPrueba,
  nuevoNonce,
  nuevoState,
  vistaModoPruebaGmail,
  type DecisionInicioGmail,
} from "../../../modules/integraciones/google-oauth.js";

export const prerender = false;

const bodySchema = z.object({
  tipo: z.literal("gmail"),
  consentimiento_version: z.literal(CONSENTIMIENTO_GOOGLE_VERSION),
});

const DIEZ_MINUTOS_MS = 10 * 60 * 1000;

function esFormulario(request: Request): boolean {
  const tipo = request.headers.get("content-type") ?? "";
  return tipo.includes("application/x-www-form-urlencoded") || tipo.includes("multipart/form-data");
}

function responderBloqueo(request: Request, decision: Extract<DecisionInicioGmail, { iniciar: false }>): Response {
  const vista = vistaModoPruebaGmail({ decision, hayConexion: false, esDueno: true });
  const texto = vista.textoLimite ?? "No se pudo iniciar la conexión.";
  const error = decision.motivo === "fuera_de_lista" ? "fuera_de_lista_prueba" : "lista_prueba_invalida";
  if (!esFormulario(request)) return Response.json({ error }, { status: 403 });
  const html = `<!doctype html><html lang="es"><meta charset="utf-8"><title>Gmail</title><p id="limite-lista-prueba">${texto}</p><p><a href="/panel/integraciones">Volver</a></p></html>`;
  return new Response(html, {
    status: 403,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}

function responderError(request: Request, payload: Record<string, unknown>, status: number): Response {
  if (!esFormulario(request)) return Response.json(payload, { status });
  const codigo = String(payload.error ?? "error");
  const texto =
    codigo === "consentimiento_invalido"
      ? "El consentimiento no es la versión vigente."
      : codigo === "integracion_no_configurada"
        ? "Gmail no está configurado en este servidor."
        : "No se pudo iniciar la conexión.";
  const html = `<!doctype html><html lang="es"><meta charset="utf-8"><title>Gmail</title><p>${texto}</p><p><a href="/panel/integraciones">Volver</a></p></html>`;
  return new Response(html, {
    status,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}

async function leerBody(request: Request): Promise<unknown> {
  if (!esFormulario(request)) return request.json();
  const form = await request.formData();
  return {
    tipo: form.get("tipo"),
    consentimiento_version: form.get("consentimiento_version"),
  };
}

export const POST: APIRoute = async ({ request }) => {
  const dueno = exigirDuenoDeRequest(request);
  if (!dueno.ok) return dueno.respuesta;

  let body: unknown;
  try {
    body = await leerBody(request);
  } catch {
    return Response.json({ error: "json invalido" }, { status: 422 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return responderError(
      request,
      { error: "consentimiento_invalido", version: CONSENTIMIENTO_GOOGLE_VERSION },
      422,
    );
  }

  // GGL-S12: el gate corre antes del redirect. Fuera de la lista no hay OAuth.
  const email = control.users.get(dueno.ctx.googleSub)?.email ?? "";
  const decision = decidirInicioGmail({ email });
  if (!decision.iniciar) return responderBloqueo(request, decision);

  let config;
  try {
    config = leerConfigIntegracionGmail();
  } catch {
    return responderError(request, { error: "integracion_no_configurada" }, 503);
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
    return responderError(request, { error: "integracion_no_configurada" }, 503);
  }

  const location = construirUrlAutorizacionGmail({
    config,
    state,
    nonce,
    codeChallenge: pkce.challenge,
    loginHint: normalizarEmailPrueba(email) ?? undefined,
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
