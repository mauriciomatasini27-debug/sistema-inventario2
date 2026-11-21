import type { APIRoute } from "astro";
import { z } from "zod";
import { control } from "../../../lib/store.js";
import { esDueno, jsonError, resolverSesion } from "../../../lib/control.js";
import { persistirAuthEvent, persistirBotLink } from "../../../lib/control-db.js";
import { normalizar_ar } from "../../../modules/whatsapp/vincular.js";
import { enmascararNumero } from "../../../modules/auth/bot.js";
import { notificarAlertaSeguridad } from "../../../lib/alertas-seguridad.js";

export const prerender = false;

const bodySchema = z.object({
  numero: z.string().min(1).max(32),
  tenant_id: z.string().min(1).max(128).optional(),
});

// Lo puede pedir el titular del vínculo o el Dueño del comercio. Revocar el
// acceso (AU7) también revoca el vínculo; acá es cambio de número o celular
// perdido sin perder el acceso.
export const POST: APIRoute = async ({ request }) => {
  const ctx = resolverSesion(request);
  if (!ctx) return jsonError("Iniciá sesión con Google para continuar.", 403);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("El cuerpo no es JSON válido.", 422);
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return jsonError("Datos inválidos.", 422);
  const numero = normalizar_ar(parsed.data.numero);
  if (!numero) return jsonError("El número no es un celular argentino válido.", 422);
  const link = control.botLinks.get(numero);
  if (!link || link.estado !== "verificado") {
    return jsonError("Ese número no está vinculado.", 404);
  }
  if (parsed.data.tenant_id && parsed.data.tenant_id !== link.tenantId) {
    return jsonError("Ese número no está vinculado.", 404);
  }
  const esTitular = link.googleSub === ctx.googleSub;
  const esDuenoLink = esDueno(link.tenantId, ctx.googleSub);
  if (!esTitular && !esDuenoLink) {
    return jsonError("No tenés permiso para desvincular ese número.", 403);
  }
  const ahora = new Date().toISOString();
  control.botLinks.set(numero, { ...link, estado: "revocado", revocadoAt: ahora });
  void persistirBotLink({ tenantId: link.tenantId, googleSub: link.googleSub, numero, estado: "revocado" });
  control.events.push({
    tenantId: link.tenantId,
    tipo: "bot_desvinculado",
    actor: ctx.googleSub,
    detalle: { numero: enmascararNumero(numero), por_dueno: !esTitular },
    creadoEn: ahora,
  });
  void persistirAuthEvent({
    tenantId: link.tenantId,
    tipo: "bot_desvinculado",
    actor: ctx.googleSub,
    detalle: { numero: enmascararNumero(numero), por_dueno: !esTitular },
  });
  void notificarAlertaSeguridad({
    evento: "bot_desvinculado",
    tenantId: link.tenantId,
    googleSubDestino: link.googleSub,
    detalle: enmascararNumero(numero),
  });
  return Response.json({ ok: true }, { status: 200 });
};
