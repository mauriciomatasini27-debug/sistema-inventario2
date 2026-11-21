import type { APIRoute } from "astro";
import { z } from "zod";
import { control } from "../../../lib/store.js";
import { jsonError, membershipActiva, resolverSesion } from "../../../lib/control.js";
import { bienvenidaSchema } from "../../../lib/validation.js";
import { normalizar_ar } from "../../../modules/whatsapp/vincular.js";
import { ejecutarBienvenida } from "../../../jobs/bienvenida.js";

export const prerender = false;

const extraSchema = bienvenidaSchema.extend({
  nombre: z.string().max(80).default(""),
  comercio: z.string().max(80).default("Mi comercio"),
  escribio_primero: z.boolean().default(false),
  ventana_abierta: z.boolean().default(false),
  opt_in: z.boolean().default(false),
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
  const parsed = extraSchema.safeParse(body);
  if (!parsed.success) return jsonError("Datos inválidos.", 422);
  const m = membershipActiva(parsed.data.tenant_id, ctx.googleSub);
  if (!m) return jsonError("No tenés permiso en este comercio.", 403);
  const numero = normalizar_ar(parsed.data.numero);
  if (!numero) return jsonError("El número no es un celular argentino válido.", 422);
  const tenant = control.tenants.get(parsed.data.tenant_id);
  if (!tenant || tenant.estado !== "activo") {
    return jsonError("El comercio todavía se está preparando.", 409);
  }
  const r = ejecutarBienvenida({
    tenantId: parsed.data.tenant_id,
    numero,
    nombre: parsed.data.nombre,
    comercio: tenant.nombreComercio,
    escribioPrimero: parsed.data.escribio_primero,
    ventanaAbierta: parsed.data.ventana_abierta,
    optIn: parsed.data.opt_in,
  });
  return Response.json({ canal: r.canal, enviada: r.enviada }, { status: r.enviada ? 201 : 200 });
};
