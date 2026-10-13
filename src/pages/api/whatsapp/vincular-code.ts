import type { APIRoute } from "astro";
import { z } from "zod";
import { control } from "../../../lib/store.js";
import { jsonError, membershipActiva, resolverSesion } from "../../../lib/control.js";
import { persistirAuthEvent, persistirCodigoWhatsapp } from "../../../lib/control-db.js";
import { generar_codigo_vincular, normalizar_ar, VINCULAR_TTL_MIN } from "../../../modules/whatsapp/vincular.js";
import { enmascararNumero, numeroOcupadoPorOtro, puedeUsarBot } from "../../../modules/auth/bot.js";
import { sha256Hex } from "../../../modules/auth/sesiones.js";

export const prerender = false;

const bodySchema = z.object({
  tenant_id: z.string().min(1).max(128),
  numero: z.string().min(1).max(32),
});

// POST /api/whatsapp/vincular-code — el miembro genera el código de 6 dígitos
// para vincular su número (B1.1/B1.2). El plano se devuelve una sola vez para
// mostrar en la web; se guarda hash con vencimiento 10 min. Gratis (sin
// plantilla): el usuario escribe VINCULAR <codigo> al número central.
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
  // AU11.3: el Empleado necesita el interruptor "Puede usar el bot".
  if (!puedeUsarBot({ rol: m.rol, puedeUsarBot: m.puedeUsarBot })) {
    return jsonError("El dueño debe habilitarte el uso del bot desde Usuarios.", 403);
  }
  const numero = normalizar_ar(parsed.data.numero);
  if (!numero) return jsonError("El número no es un celular argentino válido.", 422);
  // AU11.5: un número solo opera como un usuario a la vez.
  if (
    numeroOcupadoPorOtro({
      vinculos: [...control.botLinks.entries()].map(([numeroE164, l]) => ({ numeroE164, googleSub: l.googleSub, estado: l.estado })),
      numero,
      googleSub: ctx.googleSub,
    })
  ) {
    return jsonError("Ese número ya está vinculado a otro usuario. Desvinculalo primero.", 409);
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
  void persistirCodigoWhatsapp({
    numeroE164: numero,
    codigoHash: sha256Hex(codigo),
    metodo: "vincular",
    expiraEn: new Date(ahoraMs + VINCULAR_TTL_MIN * 60_000),
  });
  control.events.push({
    tenantId: parsed.data.tenant_id,
    tipo: "vinculo_codigo_generado",
    actor: ctx.googleSub,
    detalle: { numero: enmascararNumero(numero) },
    creadoEn: new Date().toISOString(),
  });
  void persistirAuthEvent({
    tenantId: parsed.data.tenant_id,
    tipo: "vinculo_codigo_generado",
    actor: ctx.googleSub,
    detalle: { numero: enmascararNumero(numero) },
  });
  return Response.json({ codigo, expira_en_min: VINCULAR_TTL_MIN }, { status: 201 });
};
