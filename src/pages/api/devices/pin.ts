import type { APIRoute } from "astro";
import { z } from "zod";
import { control } from "../../../lib/store.js";
import { hashearPin, validarPin } from "../../../modules/auth/pin.js";
import { esDueno, exigirReauthReciente, jsonError, resolverSesion } from "../../../lib/control.js";
import { persistirAuthEvent, persistirPinDispositivo } from "../../../lib/control-db.js";

export const prerender = false;

const bodySchema = z.object({
  tenant_id: z.string().min(1).max(128),
  device_code: z.string().min(1).max(64),
  pin: z.string().min(4).max(6),
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
  if (!validarPin(parsed.data.pin)) return jsonError("PIN inválido (4 a 6 dígitos).", 422);
  const ahora = new Date().toISOString();
  const pinHash = hashearPin(parsed.data.pin);
  control.devicePins.set(parsed.data.device_code, { pinHash, actualizadoEn: ahora });
  control.pinFallos.delete(parsed.data.device_code);
  void persistirPinDispositivo({ deviceCode: parsed.data.device_code, pinHash, bloqueado: control.deviceLocks.get(parsed.data.device_code)?.bloqueado ?? false });
  control.events.push({
    tenantId: parsed.data.tenant_id,
    tipo: "pin_definido",
    actor: ctx.googleSub,
    detalle: { device_code: parsed.data.device_code },
    creadoEn: ahora,
  });
  void persistirAuthEvent({
    tenantId: parsed.data.tenant_id,
    tipo: "pin_definido",
    actor: ctx.googleSub,
    detalle: { device_code: parsed.data.device_code },
  });
  return Response.json({ device_code: parsed.data.device_code, ok: true }, { status: 200 });
};
