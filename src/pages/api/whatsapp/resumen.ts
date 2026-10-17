import type { APIRoute } from "astro";
import { control } from "../../../lib/store.js";
import { jsonError, membershipActiva, resolverSesion, type ContextoAuth } from "../../../lib/control.js";
import { BaseNoDisponible } from "../../../lib/server-db.js";
import { leerResumenConsultasBot } from "../../../lib/repos/bot-consultas.js";
import { estadoNumeroCentral } from "../../../modules/whatsapp/tarjeta-bot.js";
import { ultimoEnvioCloud } from "../../../lib/whatsapp-salud.js";

export const prerender = false;

// DASH-S3 (ADR-0034/0036): resumen read-only de la tarjeta `Bot` de /panel.
// El tenant sale de la sesión + membership activa, nunca del request. Nunca
// devuelve teléfonos: solo conteos y el estado en texto del número central.

function tenantDeSesion(ctx: ContextoAuth): string | null {
  if (ctx.tenantId && control.tenants.has(ctx.tenantId)) return ctx.tenantId;
  const activas = [...control.memberships.values()].filter(
    (m) => m.googleSub === ctx.googleSub && m.estado === "activo" && control.tenants.has(m.tenantId),
  );
  return activas.length === 1 ? activas[0]!.tenantId : null;
}

// El número central todavía no está dado de alta (P9-3): sin las credenciales
// de envío el estado honesto es "sin configurar".
function credencialesConfiguradas(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.WHATSAPP_PHONE_NUMBER_ID && env.WHATSAPP_TOKEN);
}

export const GET: APIRoute = async ({ request }) => {
  const ctx = resolverSesion(request);
  if (!ctx) return jsonError("Iniciá sesión con Google para continuar.", 403);
  const tenantId = tenantDeSesion(ctx);
  if (!tenantId) return jsonError("No tenés permiso en este comercio.", 403);
  const m = membershipActiva(tenantId, ctx.googleSub);
  if (!m) return jsonError("No tenés permiso en este comercio.", 403);
  const ahoraMs = Date.now();
  let resumen: Awaited<ReturnType<typeof leerResumenConsultasBot>>;
  try {
    resumen = await leerResumenConsultasBot(tenantId, ahoraMs);
  } catch (e) {
    if (e instanceof BaseNoDisponible) return Response.json({ error: "base_no_disponible" }, { status: 503 });
    throw e;
  }
  return Response.json({
    consultas_hoy: resumen.hoy,
    ultima_consulta_en: resumen.ultimaEnMs === null ? null : new Date(resumen.ultimaEnMs).toISOString(),
    numero_central: estadoNumeroCentral({
      credencialesConfiguradas: credencialesConfiguradas(),
      ultimoEnvio: ultimoEnvioCloud(),
    }),
  });
};
