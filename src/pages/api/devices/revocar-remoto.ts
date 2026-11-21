import type { APIRoute } from "astro";
import { z } from "zod";
import { control } from "../../../lib/store.js";
import { esDueno, exigirReauthReciente, jsonError, resolverSesion } from "../../../lib/control.js";
import { persistirAuthEvent } from "../../../lib/control-db.js";

export const prerender = false;

const bodySchema = z.object({
  tenant_id: z.string().min(1).max(128),
  device_code: z.string().min(1).max(64),
  motivo: z.string().max(200).default("revocado"),
});

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
  if (!esDueno(parsed.data.tenant_id, ctx.googleSub)) {
    return jsonError("No tenés permiso en este comercio.", 403);
  }
  const reauth = exigirReauthReciente(ctx);
  if (reauth) return reauth;
  const ahora = new Date().toISOString();
  control.deviceLocks.set(parsed.data.device_code, {
    bloqueado: true,
    bloqueadoEn: ahora,
    bloqueadoPor: ctx.googleSub,
  });
  let grantsRevocados = 0;
  for (const [id, g] of control.offlineGrants.entries()) {
    if (g.deviceCode === parsed.data.device_code && !g.revocadoEn) {
      g.revocadoEn = ahora;
      control.offlineGrants.set(id, g);
      grantsRevocados += 1;
    }
  }
  control.events.push({
    tenantId: parsed.data.tenant_id,
    tipo: "dispositivo_revocado_remoto",
    actor: ctx.googleSub,
    detalle: { device_code: parsed.data.device_code, motivo: parsed.data.motivo, grants: grantsRevocados },
    creadoEn: ahora,
  });
  void persistirAuthEvent({
    tenantId: parsed.data.tenant_id,
    tipo: "dispositivo_revocado_remoto",
    actor: ctx.googleSub,
    detalle: { device_code: parsed.data.device_code },
  });
  return Response.json(
    { device_code: parsed.data.device_code, wipe: true, grants_revocados: grantsRevocados },
    { status: 200 },
  );
};
