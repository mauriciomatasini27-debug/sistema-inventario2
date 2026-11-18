import type { APIRoute } from "astro";
import { encolarIngesta } from "../../../lib/repos/gmail-cola.js";
import { resolverRutaWatch } from "../../../lib/repos/gmail-watch.js";
import { ErrorOAuthGoogle } from "../../../modules/integraciones/google-oauth.js";
import {
  decodificarPushPubSub,
  leerConfigPubSub,
  verificarPushPubSub,
} from "../../../modules/integraciones/pubsub.js";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  let config;
  try {
    config = leerConfigPubSub();
  } catch {
    return new Response(null, { status: 503 });
  }

  try {
    await verificarPushPubSub({
      authorization: request.headers.get("authorization"),
      audience: config.audience,
      emailEsperado: config.email,
    });
  } catch (e) {
    if (e instanceof ErrorOAuthGoogle) {
      return new Response(null, { status: 401 });
    }
    throw e;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response(null, { status: 204 });
  }
  const push = decodificarPushPubSub(body);
  if (!push) return new Response(null, { status: 204 });

  let ruta;
  try {
    ruta = await resolverRutaWatch(push.email);
  } catch {
    return new Response(null, { status: 503 });
  }
  if (!ruta) return new Response(null, { status: 204 });

  try {
    await encolarIngesta({
      tenantId: ruta.tenantId,
      connectionId: ruta.connectionId,
      historyId: push.historyId,
      messageId: push.messageId,
      motivo: "push",
    });
  } catch (e) {
    console.warn("[gmail] no se pudo encolar el push:", e instanceof Error ? e.message : "error");
    return new Response(null, { status: 500 });
  }
  return new Response(null, { status: 204 });
};
