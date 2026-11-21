import type { APIRoute } from "astro";
import { z } from "zod";
import { control } from "../../../../lib/store.js";
import {
  aplicarCierre,
  decidirCierreDeDueno,
  listarSesionesDeMiembro,
} from "../../../../modules/auth/dispositivos.js";
import { extraerSesionDeCookie, sha256Hex } from "../../../../modules/auth/sesiones.js";
import { esDueno, exigirReauthReciente, jsonError, resolverSesion } from "../../../../lib/control.js";
import { persistirAuthEvent, revocarSesionDb } from "../../../../lib/control-db.js";
import { notificarAlertaSeguridad } from "../../../../lib/alertas-seguridad.js";

export const prerender = false;

// (AU9.2, solo Dueño): sesiones activas de un miembro del comercio.
export const GET: APIRoute = async ({ request, params }) => {
  const ctx = resolverSesion(request);
  if (!ctx) return jsonError("Iniciá sesión con Google para continuar.", 403);
  const tenantId = params.id ?? "";
  const tenant = control.tenants.get(tenantId);
  if (!tenant || !esDueno(tenantId, ctx.googleSub)) {
    return jsonError("No tenés permiso para ver este comercio.", 403);
  }
  const objetivo = new URL(request.url).searchParams.get("google_sub") ?? "";
  if (!objetivo) return jsonError("Falta google_sub.", 422);
  const idPlano = extraerSesionDeCookie(request.headers.get("cookie"));
  const visibles = listarSesionesDeMiembro({
    sesiones: [...control.sessions.values()],
    googleSubObjetivo: objetivo,
    idActualHash: idPlano ? sha256Hex(idPlano) : "",
    nombres: control.deviceNames,
  });
  return Response.json({ sesiones: visibles }, { status: 200 });
};

const cerrarSchema = z.object({
  google_sub: z.string().min(1).max(256),
  id_hash: z.string().min(1).max(256).optional(),
  todas: z.boolean().optional(),
});

// Cierra sesiones sin revocar el acceso: el usuario puede volver a entrar
// con Google. Para quitar el acceso está "Revocar acceso" (AU7).
export const POST: APIRoute = async ({ request, params }) => {
  const ctx = resolverSesion(request);
  if (!ctx) return jsonError("Iniciá sesión con Google para continuar.", 403);
  const tenantId = params.id ?? "";
  const tenant = control.tenants.get(tenantId);
  if (!tenant || !esDueno(tenantId, ctx.googleSub)) {
    return jsonError("No tenés permiso para ver este comercio.", 403);
  }
  const reauth = exigirReauthReciente(ctx);
  if (reauth) return reauth;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("El cuerpo no es JSON válido.", 422);
  }
  const parsed = cerrarSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? "Datos inválidos.", 422);
  }
  const todas = [...control.sessions.values()];
  const delObjetivo = todas.filter(
    (s) => s.googleSub === parsed.data.google_sub && s.tenantId === tenantId && !s.revocadaAt,
  );
  let hashes: string[];
  if (parsed.data.todas === true) {
    if (delObjetivo.length === 0) return jsonError("Sin sesiones activas.", 404);
    hashes = delObjetivo.map((s) => s.idHash);
  } else {
    if (!parsed.data.id_hash) return jsonError("Falta id_hash.", 422);
    const obj = todas.find((s) => s.idHash === parsed.data.id_hash && s.googleSub === parsed.data.google_sub);
    const d = decidirCierreDeDueno({ esDueno: true, objetivo: obj });
    if (!d.permite) {
      return jsonError(d.motivo === "ya_cerrada" ? "Esa sesión ya estaba cerrada." : "Sesión no encontrada.", d.motivo === "ya_cerrada" ? 409 : 404);
    }
    hashes = [parsed.data.id_hash];
  }
  const ahora = new Date();
  aplicarCierre({ sesiones: todas, hashes, ahora });
  for (const h of hashes) {
    const s = control.sessions.get(h);
    if (s) {
      s.revocadaAt = ahora.toISOString();
      s.motivo = "cierre_remoto_dueno";
      void revocarSesionDb(h, "cierre_remoto_dueno");
    }
  }
  control.events.push({
    tenantId,
    tipo: "sesion_cerrada_remota",
    actor: ctx.googleSub,
    detalle: { objetivo: parsed.data.google_sub, cerradas: hashes.length },
    creadoEn: ahora.toISOString(),
  });
  void persistirAuthEvent({
    tenantId,
    tipo: "sesion_cerrada_remota",
    actor: ctx.googleSub,
    detalle: { objetivo: parsed.data.google_sub, cerradas: hashes.length },
  });
  void notificarAlertaSeguridad({
    evento: "sesion_cerrada_remota",
    tenantId,
    googleSubDestino: parsed.data.google_sub,
    detalle: `${hashes.length} cerrada(s)`,
  });
  return Response.json({ cerradas: hashes.length }, { status: 200 });
};
