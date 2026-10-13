import type { APIRoute } from "astro";
import { z } from "zod";
import { control } from "../../../lib/store.js";
import { persistirDeviceSync } from "../../../lib/control-db.js";
import { jsonError, membershipActiva, resolverSesion } from "../../../lib/control.js";
import { validarNombreDispositivo } from "../../../modules/auth/dispositivos.js";

export const prerender = false;

const bodySchema = z.object({
  tenant_id: z.string().min(1).max(128),
  device_code: z.string().min(4).max(64),
  nombre: z.string().min(1).max(40).optional(),
});

// POST /api/devices/register — SYNC-S6 (OF9, PRD-SYNC-01).
// Registra el device del local (cualquier miembro activo; login sigue online).
// Idempotente: mismo device+tenant => 200 replay. Otro tenant => 409.
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

  const previo = control.devices.get(parsed.data.device_code);
  if (previo) {
    if (previo.tenantId !== parsed.data.tenant_id) {
      return jsonError("Ese dispositivo ya está registrado en otro comercio.", 409);
    }
    return Response.json({ device_code: previo.deviceCode, tenant_id: previo.tenantId }, { status: 200 });
  }

  const ahora = new Date().toISOString();
  control.devices.set(parsed.data.device_code, {
    deviceCode: parsed.data.device_code,
    tenantId: parsed.data.tenant_id,
    registradoPor: ctx.googleSub,
    registradoEn: ahora,
  });
  void persistirDeviceSync({
    deviceCode: parsed.data.device_code,
    tenantId: parsed.data.tenant_id,
    ultimaVistaEn: ahora,
    pendientes: 0,
    ultimaOpHlc: null,
  });
  if (parsed.data.nombre) {
    const v = validarNombreDispositivo(parsed.data.nombre);
    if (!v.ok) return jsonError("Nombre de dispositivo inválido (1 a 40 caracteres).", 422);
    control.deviceNames.set(parsed.data.device_code, v.valor ?? parsed.data.nombre.trim());
  }
  control.events.push({
    tenantId: parsed.data.tenant_id,
    tipo: "dispositivo_registrado",
    actor: ctx.googleSub,
    detalle: { device_code: parsed.data.device_code },
    creadoEn: ahora,
  });
  return Response.json(
    { device_code: parsed.data.device_code, tenant_id: parsed.data.tenant_id },
    { status: 201 },
  );
};
