import type { APIRoute } from "astro";
import { z } from "zod";
import { control } from "../../../lib/store.js";
import { validarNombreDispositivo } from "../../../modules/auth/dispositivos.js";
import { esDueno, exigirReauthReciente, jsonError, resolverSesion } from "../../../lib/control.js";
import { persistirAuthEvent } from "../../../lib/control-db.js";

export const prerender = false;

const bodySchema = z.object({
  tenant_id: z.string().min(1).max(128),
  device_code: z.string().min(1).max(64),
  nombre: z.string().min(1).max(40),
});

// ("PC del mostrador", AU9.3). El nombre se muestra en Dispositivos y en el
// historial de movimientos.
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
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? "Datos inválidos.", 422);
  }
  const tenant = control.tenants.get(parsed.data.tenant_id);
  if (!tenant || !esDueno(parsed.data.tenant_id, ctx.googleSub)) {
    return jsonError("No tenés permiso en este comercio.", 403);
  }
  const reauth = exigirReauthReciente(ctx);
  if (reauth) return reauth;
  const v = validarNombreDispositivo(parsed.data.nombre);
  if (!v.ok) return jsonError("Nombre de dispositivo inválido (1 a 40 caracteres).", 422);
  control.deviceNames.set(parsed.data.device_code, v.valor ?? parsed.data.nombre.trim());
  control.events.push({
    tenantId: parsed.data.tenant_id,
    tipo: "dispositivo_nombrado",
    actor: ctx.googleSub,
    detalle: { device_code: parsed.data.device_code },
    creadoEn: new Date().toISOString(),
  });
  void persistirAuthEvent({
    tenantId: parsed.data.tenant_id,
    tipo: "dispositivo_nombrado",
    actor: ctx.googleSub,
    detalle: { device_code: parsed.data.device_code },
  });
  return Response.json({ device_code: parsed.data.device_code, nombre: v.valor }, { status: 200 });
};
