import type { APIRoute } from "astro";
import { z } from "zod";
import { control } from "../../../lib/store.js";
import {
  extraerSesionDeCookie,
  sha256Hex,
} from "../../../modules/auth/sesiones.js";
import {
  aplicarCierre,
  decidirCierrePropio,
  listarSesionesPropias,
} from "../../../modules/auth/dispositivos.js";
import { jsonError, resolverSesion } from "../../../lib/control.js";
import { persistirAuthEvent, revocarSesionDb } from "../../../lib/control-db.js";

export const prerender = false;

// GET /api/auth/sesiones — "Mi cuenta → Dispositivos" (AU9.1): lista mis
// sesiones activas con dispositivo, última actividad y marca de actual.
// Nunca devuelve el id plano: solo el hash para operar el cierre.
export const GET: APIRoute = async ({ request }) => {
  const ctx = resolverSesion(request);
  if (!ctx) return jsonError("Iniciá sesión con Google para continuar.", 403);
  const idPlano = extraerSesionDeCookie(request.headers.get("cookie"));
  const actual = idPlano ? sha256Hex(idPlano) : "";
  const visibles = listarSesionesPropias({
    sesiones: [...control.sessions.values()],
    googleSub: ctx.googleSub,
    idActualHash: actual,
    nombres: control.deviceNames,
  });
  return Response.json({ sesiones: visibles }, { status: 200 });
};

const cerrarSchema = z
  .object({
    id_hash: z.string().min(1).max(256).optional(),
    todas_menos_actual: z.boolean().optional(),
  })
  .refine((b) => b.id_hash !== undefined || b.todas_menos_actual === true, {
    message: "Indicá id_hash o todas_menos_actual.",
  });

// POST /api/auth/sesiones — cierre propio (AU9.1): una sesión o todas las
// demás. No revoca la membership: el usuario puede volver a entrar (AU9.2).
export const POST: APIRoute = async ({ request }) => {
  const ctx = resolverSesion(request);
  if (!ctx) return jsonError("Iniciá sesión con Google para continuar.", 403);
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
  const idPlano = extraerSesionDeCookie(request.headers.get("cookie"));
  const actual = idPlano ? sha256Hex(idPlano) : "";
  const todas = [...control.sessions.values()];
  const objetivo = parsed.data.todas_menos_actual === true ? "todas_menos_actual" : (parsed.data.id_hash ?? "");
  const d = decidirCierrePropio({
    objetivoHash: objetivo as string | "todas_menos_actual",
    idActualHash: actual,
    sesiones: todas,
    googleSub: ctx.googleSub,
  });
  if (!d.permite) {
    return jsonError(d.motivo === "ya_cerrada" ? "Esa sesión ya estaba cerrada." : "Sesión no encontrada.", d.motivo === "ya_cerrada" ? 409 : 404);
  }
  const ahora = new Date();
  let hashes: string[];
  if (objetivo === "todas_menos_actual") {
    hashes = todas
      .filter((s) => s.googleSub === ctx.googleSub && s.idHash !== actual && !s.revocadaAt)
      .map((s) => s.idHash);
  } else {
    hashes = [objetivo as string];
  }
  const cerradas = aplicarCierre({ sesiones: todas, hashes, ahora });
  for (const h of hashes) {
    const s = control.sessions.get(h);
    if (s) {
      s.revocadaAt = ahora.toISOString();
      s.motivo = "cierre_propio";
      void revocarSesionDb(h, "cierre_propio");
    }
  }
  control.events.push({ tenantId: ctx.tenantId, tipo: "sesion_cerrada", actor: ctx.googleSub, detalle: { cerradas }, creadoEn: ahora.toISOString() });
  void persistirAuthEvent({ tenantId: ctx.tenantId, tipo: "sesion_cerrada", actor: ctx.googleSub, detalle: { cerradas } });
  // La PWA borra los datos locales al ver 403 en la siguiente request (AU9.4).
  return Response.json({ cerradas }, { status: 200 });
};
