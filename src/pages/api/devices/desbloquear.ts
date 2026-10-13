import type { APIRoute } from "astro";
import { z } from "zod";
import { control } from "../../../lib/store.js";
import { estaBloqueadoPin, registrarFalloPin, validarPin, verificarPin } from "../../../modules/auth/pin.js";
import { jsonError, membershipActiva, resolverSesion } from "../../../lib/control.js";
import { persistirAuthEvent, persistirPinDispositivo } from "../../../lib/control-db.js";

export const prerender = false;

const bodySchema = z.object({
  tenant_id: z.string().min(1).max(128),
  device_code: z.string().min(1).max(64),
  pin: z.string().min(4).max(6),
});

// POST /api/devices/desbloquear — abre el mostrador con el PIN (P1-3).
// Exige sesión del comercio pero NO reauth: el PIN es la prueba.
// Rate-limit 5 intentos + 5 min por dispositivo, auditado sin el plano.
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
  const m = membershipActiva(parsed.data.tenant_id, ctx.googleSub);
  if (!m) return jsonError("No tenés permiso en este comercio.", 403);
  if (!validarPin(parsed.data.pin)) return jsonError("PIN inválido.", 422);
  const ahoraMs = Date.now();
  if (estaBloqueadoPin(control.pinFallos.get(parsed.data.device_code), ahoraMs)) {
    return jsonError("Demasiados intentos. Esperá unos minutos.", 429);
  }
  const guardado = control.devicePins.get(parsed.data.device_code);
  if (!guardado) return jsonError("Sin PIN definido.", 409);
  if (!verificarPin(parsed.data.pin, guardado.pinHash)) {
    control.pinFallos.set(parsed.data.device_code, registrarFalloPin(control.pinFallos.get(parsed.data.device_code), ahoraMs));
    const ahora = new Date().toISOString();
    control.events.push({ tenantId: parsed.data.tenant_id, tipo: "pin_fallido", actor: ctx.googleSub, creadoEn: ahora });
    void persistirAuthEvent({ tenantId: parsed.data.tenant_id, tipo: "pin_fallido", actor: ctx.googleSub });
    return jsonError("PIN incorrecto.", 403);
  }
  control.pinFallos.delete(parsed.data.device_code);
  const ahora = new Date().toISOString();
  control.deviceLocks.set(parsed.data.device_code, { bloqueado: false });
  void persistirPinDispositivo({ deviceCode: parsed.data.device_code, pinHash: guardado.pinHash, bloqueado: false });
  control.events.push({
    tenantId: parsed.data.tenant_id,
    tipo: "mostrador_desbloqueado",
    actor: ctx.googleSub,
    detalle: { device_code: parsed.data.device_code },
    creadoEn: ahora,
  });
  void persistirAuthEvent({
    tenantId: parsed.data.tenant_id,
    tipo: "mostrador_desbloqueado",
    actor: ctx.googleSub,
    detalle: { device_code: parsed.data.device_code },
  });
  return Response.json({ device_code: parsed.data.device_code, bloqueado: false }, { status: 200 });
};
