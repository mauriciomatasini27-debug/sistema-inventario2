import type { APIRoute } from "astro";
import { z } from "zod";
import { control } from "../../../lib/store.js";
import { persistirOfflineGrant, revocarOfflineGrantDb } from "../../../lib/control-db.js";
import { jsonError, membershipActiva, resolverSesion } from "../../../lib/control.js";
import { sha256Hex } from "../../../modules/auth/sesiones.js";
import { emitirGrantJWT } from "../../../offline/grants.js";
import type { AlcanceGrant } from "../../../offline/types.js";

export const prerender = false;

const ALCANCES: readonly AlcanceGrant[] = ["venta", "stock", "caja", "fiado_cobro"];

const bodySchema = z.object({
  tenant_id: z.string().min(1).max(128),
  device_code: z.string().min(4).max(64),
  alcance: z.enum(["venta", "stock", "caja", "fiado_cobro"]),
  vence_en_horas: z.number().int().min(24).max(168).default(72),
});

// POST /api/sync/offline-grants — SYNC-S5 (OF9, PRD-SYNC-01) + SYNC-S7 JWT.
// Emite grant offline (72h def, rango 24h-7d) como JWT HS256 verificable sin DB.
// Payload: grant_id, tenant_id, device_code, alcance, exp. En memoria/DB solo
// queda sha256(token). Solo online (exige cookie de sesión).
// Sensibles (sueldos, retiro dueño, topes, cierre) no son AlcanceGrant: 422.
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

  const grantId = crypto.randomUUID();
  const expiraEn = new Date(Date.now() + parsed.data.vence_en_horas * 3600_000).toISOString();
  // SYNC-S7: token JWT firmada, verificable offline sin DB.
  const token = await emitirGrantJWT({
    grantId,
    tenantId: parsed.data.tenant_id,
    deviceCode: parsed.data.device_code,
    alcance: parsed.data.alcance,
    expiraEn,
  });
  control.offlineGrants.set(grantId, {
    grantId,
    tokenHash: sha256Hex(token),
    tenantId: parsed.data.tenant_id,
    googleSub: ctx.googleSub,
    deviceCode: parsed.data.device_code,
    alcance: parsed.data.alcance,
    expiraEn,
  });
  void persistirOfflineGrant({
    grantId,
    tokenHash: sha256Hex(token),
    tenantId: parsed.data.tenant_id,
    googleSub: ctx.googleSub,
    deviceCode: parsed.data.device_code,
    alcance: parsed.data.alcance,
    expiraEn,
  });
  control.events.push({
    tenantId: parsed.data.tenant_id,
    tipo: "offline_grant_emitido",
    actor: ctx.googleSub,
    detalle: { device_code: parsed.data.device_code, alcance: parsed.data.alcance },
    creadoEn: new Date().toISOString(),
  });
  return Response.json(
    {
      grant_id: grantId,
      token,
      tenant_id: parsed.data.tenant_id,
      device_code: parsed.data.device_code,
      alcance: parsed.data.alcance,
      expira_en: expiraEn,
    },
    { status: 201 },
  );
};

// DELETE /api/sync/offline-grants?grant_id= — revoca (Dueño o propio).
// Revocado => cuarentena post-revocación: el device exige revalidar online.
export const DELETE: APIRoute = async ({ request }) => {
  const ctx = resolverSesion(request);
  if (!ctx) return jsonError("Iniciá sesión con Google para continuar.", 403);
  const grantId = new URL(request.url).searchParams.get("grant_id");
  if (!grantId) return jsonError("Falta grant_id.", 422);
  const g = control.offlineGrants.get(grantId);
  if (!g) return jsonError("Grant desconocido.", 404);
  const m = membershipActiva(g.tenantId, ctx.googleSub);
  if (!m) return jsonError("No tenés permiso en este comercio.", 403);
  if (m.rol !== "dueno" && g.googleSub !== ctx.googleSub) {
    return jsonError("No tenés permiso para revocar este grant.", 403);
  }
  g.revocadoEn = new Date().toISOString();
  control.offlineGrants.set(grantId, g);
  void revocarOfflineGrantDb(grantId);
  control.events.push({
    tenantId: g.tenantId,
    tipo: "offline_grant_revocado",
    actor: ctx.googleSub,
    detalle: { device_code: g.deviceCode },
    creadoEn: g.revocadoEn,
  });
  return Response.json({ grant_id: grantId, revocado_en: g.revocadoEn }, { status: 200 });
};
