import type { APIRoute } from "astro";
import { z } from "zod";
import { control } from "../../../lib/store.js";
import { esDueno, exigirReauthReciente, jsonError, resolverSesion } from "../../../lib/control.js";
import { persistirAuthEvent, persistirPinDispositivo } from "../../../lib/control-db.js";

export const prerender = false;

const bodySchema = z.object({
  tenant_id: z.string().min(1).max(128),
  device_code: z.string().min(1).max(64),
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
  const tenant = control.tenants.get(parsed.data.tenant_id);
  if (!tenant || !esDueno(parsed.data.tenant_id, ctx.googleSub)) {
    return jsonError("No tenés permiso en este comercio.", 403);
  }
  const reauth = exigirReauthReciente(ctx);
  if (reauth) return reauth;
  if (!control.devicePins.has(parsed.data.device_code)) {
    return jsonError("Definí el PIN antes de bloquear.", 409);
  }
  const ahora = new Date().toISOString();
  control.deviceLocks.set(parsed.data.device_code, { bloqueado: true, bloqueadoEn: ahora, bloqueadoPor: ctx.googleSub });
  const pin = control.devicePins.get(parsed.data.device_code)!;
  void persistirPinDispositivo({ deviceCode: parsed.data.device_code, pinHash: pin.pinHash, bloqueado: true });
  control.events.push({
    tenantId: parsed.data.tenant_id,
    tipo: "mostrador_bloqueado",
    actor: ctx.googleSub,
    detalle: { device_code: parsed.data.device_code },
    creadoEn: ahora,
  });
  void persistirAuthEvent({
    tenantId: parsed.data.tenant_id,
    tipo: "mostrador_bloqueado",
    actor: ctx.googleSub,
    detalle: { device_code: parsed.data.device_code },
  });
  return Response.json({ device_code: parsed.data.device_code, bloqueado: true }, { status: 200 });
};
