import type { APIRoute } from "astro";
import { control } from "../../../lib/store.js";
import { jsonError, membershipActiva, resolverSesion } from "../../../lib/control.js";
import { bienvenidaSchema } from "../../../lib/validation.js";
import { generar_codigo_vincular, normalizar_ar, VINCULAR_TTL_MIN } from "../../../modules/whatsapp/vincular.js";
import { sha256Hex } from "../../../modules/auth/sesiones.js";
import { mensaje_numero_en_uso } from "../../../modules/onboarding/empleado.js";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const ctx = resolverSesion(request);
  if (!ctx) return jsonError("Iniciá sesión con Google para continuar.", 403);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("El cuerpo no es JSON válido.", 422);
  }
  const parsed = bienvenidaSchema.safeParse(body);
  if (!parsed.success) return jsonError("Datos inválidos.", 422);
  const m = membershipActiva(parsed.data.tenant_id, ctx.googleSub);
  if (!m || m.rol !== "empleado") return jsonError("Solo el empleado puede vincular su número.", 403);
  const numero = normalizar_ar(parsed.data.numero);
  if (!numero) return jsonError("El número no es un celular argentino válido.", 422);
  for (const link of control.botLinks.values()) {
    if (link.estado === "activo" && (link as unknown as { numero?: string }).numero === numero) {
      return jsonError(mensaje_numero_en_uso(), 409);
    }
  }
  const codigo = generar_codigo_vincular();
  const ahoraMs = Date.now();
  control.vincularCodes.set(numero, {
    codigoHash: sha256Hex(codigo),
    expiraEn: ahoraMs + VINCULAR_TTL_MIN * 60_000,
    usado: false,
    numeroRegistrado: numero,
    tenantId: parsed.data.tenant_id,
    googleSub: ctx.googleSub,
    intentosFallidos: 0,
  });
  return Response.json({ codigo, expira_en_min: VINCULAR_TTL_MIN }, { status: 201 });
};
