import type { APIRoute } from "astro";
import { leerVarEntorno } from "../../lib/env.js";
import { fechaAR } from "../../lib/fecha-ar.js";
import {
  CLAVE_LLM_LANDING,
  ProveedorLandingFake,
  manejarMensajeLanding,
} from "../../modules/landing/chat.js";
import type { ProveedorLLM } from "../../modules/ia/proveedor.js";

export const prerender = false;

function ipDe(request: Request, clientAddress: string | undefined): string {
  const reenviada = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (reenviada) return reenviada;
  return clientAddress ?? "anon";
}

// POST /api/landing-chat — LP4-S2/S4/S5: chat público aislado, sin DB ni store,
// sin function calling, con cupo de 20 mensajes por IP/sesión por día.
export const POST: APIRoute = async ({ request, clientAddress }) => {
  let cuerpo: unknown;
  try {
    cuerpo = await request.json();
  } catch (error) {
    console.warn("[landing-chat] cuerpo inválido", error);
    return Response.json({ error: "cuerpo inválido" }, { status: 400 });
  }
  const mensaje = typeof cuerpo === "object" && cuerpo !== null
    ? (cuerpo as { mensaje?: unknown }).mensaje
    : undefined;
  const sesionId = typeof cuerpo === "object" && cuerpo !== null
    ? (cuerpo as { sesionId?: unknown }).sesionId
    : undefined;
  if (typeof mensaje !== "string" || mensaje.trim().length === 0) {
    return Response.json({ error: "mensaje requerido" }, { status: 400 });
  }
  const clave = leerVarEntorno(CLAVE_LLM_LANDING satisfies "LANDING_LLM_KEY");
  const proveedor: ProveedorLLM = new ProveedorLandingFake({ clavePresente: clave.length > 0 });
  const ip = ipDe(request, clientAddress);
  const claveUso = `${typeof sesionId === "string" && sesionId.length > 0 ? sesionId : ip}:${fechaAR()}`;
  const respuesta = await manejarMensajeLanding({ mensaje: mensaje.trim(), claveUso, proveedor });
  return Response.json(
    {
      texto: respuesta.texto,
      deriva: respuesta.deriva,
      whatsapp: respuesta.whatsapp ?? null,
      formulario: respuesta.formulario ?? null,
      porCupo: respuesta.porCupo,
    },
    { status: 200 },
  );
};
