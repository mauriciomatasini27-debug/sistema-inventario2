import type { APIRoute } from "astro";
import { z } from "zod";
import { control } from "../../../lib/store.js";
import { BaseNoDisponible } from "../../../lib/server-db.js";
import { leerDevice, registrarDeviceConGrant } from "../../../lib/repos/sync.js";
import { jsonError, membershipActiva, resolverSesion } from "../../../lib/control.js";
import { sha256Hex } from "../../../modules/auth/sesiones.js";
import { emitirGrantJWT } from "../../../offline/grants.js";
import { validarNombreDispositivo } from "../../../modules/auth/dispositivos.js";

export const prerender = false;

const bodySchema = z.object({
  tenant_id: z.string().min(1).max(128),
  device_code: z.string().min(4).max(64),
  nombre: z.string().min(1).max(40).optional(),
});

// POST /api/devices/register — SYNC-S6 (OF9, PRD-SYNC-01).
// Registra el device del local (cualquier miembro activo; login sigue online).
// Idempotente: mismo device+tenant => 200 replay con el mismo id. Otro tenant
// => 409. El alta crea el offline_grant inicial en la misma transacción
// (alcance venta, 72h); registrado_por/en y nombre quedan en el espejo.
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

  let previo;
  try {
    previo = await leerDevice(parsed.data.device_code, parsed.data.tenant_id);
  } catch (e) {
    if (e instanceof BaseNoDisponible) return Response.json({ error: "base_no_disponible" }, { status: 503 });
    throw e;
  }
  if (previo) {
    if (previo.tenantId !== parsed.data.tenant_id) {
      return jsonError("Ese dispositivo ya está registrado en otro comercio.", 409);
    }
    return Response.json({ device_code: previo.deviceCode, tenant_id: previo.tenantId }, { status: 200 });
  }

  const ahora = new Date().toISOString();
  const grantId = crypto.randomUUID();
  const expiraEn = new Date(Date.now() + 72 * 3600_000).toISOString();
  const token = await emitirGrantJWT({
    grantId,
    tenantId: parsed.data.tenant_id,
    deviceCode: parsed.data.device_code,
    alcance: "venta",
    expiraEn,
  });
  let creado;
  try {
    creado = await registrarDeviceConGrant(
      {
        deviceCode: parsed.data.device_code,
        tenantId: parsed.data.tenant_id,
        registradoPor: ctx.googleSub,
        registradoEn: ahora,
        grant: {
          grantId,
          tokenHash: sha256Hex(token),
          tenantId: parsed.data.tenant_id,
          googleSub: ctx.googleSub,
          deviceCode: parsed.data.device_code,
          alcance: "venta",
          expiraEn,
        },
      },
      parsed.data.tenant_id,
    );
  } catch (e) {
    if (e instanceof BaseNoDisponible) return Response.json({ error: "base_no_disponible" }, { status: 503 });
    throw e;
  }
  if (!creado.creado) {
    let vigente;
    try {
      vigente = await leerDevice(parsed.data.device_code, parsed.data.tenant_id);
    } catch (e) {
      if (e instanceof BaseNoDisponible) return Response.json({ error: "base_no_disponible" }, { status: 503 });
      throw e;
    }
    if (!vigente || vigente.tenantId !== parsed.data.tenant_id) {
      return jsonError("Ese dispositivo ya está registrado en otro comercio.", 409);
    }
    return Response.json({ device_code: vigente.deviceCode, tenant_id: vigente.tenantId }, { status: 200 });
  }
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
    {
      device_code: parsed.data.device_code,
      tenant_id: parsed.data.tenant_id,
      offline_grant: { grant_id: grantId, token, alcance: "venta", expira_en: expiraEn },
    },
    { status: 201 },
  );
};
