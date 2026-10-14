import type { APIRoute } from "astro";
import { z } from "zod";
import { validar_cuit } from "../../../modules/fiscal/fiscal.js";
import { BaseNoDisponible, intentarPersistir } from "../../../lib/server-db.js";
import { exigirReauthReciente, resolverSesion } from "../../../lib/control.js";
import { exigirDuenoDeRequest, tenantDeRequest, type TenantResuelto } from "../../../lib/tenant-context.js";
import { fiscalSettings } from "../../../db/schema-fiscal.js";

export const prerender = false;

const settingsSchema = z.object({
  cuit: z.string().min(11).max(13),
  razon_social: z.string().min(1).max(200),
  domicilio: z.string().min(1).max(300),
  condicion_iva: z.enum(["monotributo", "exento", "responsable_inscripto"]),
  iibb: z.string().max(32).optional(),
  inicio_actividades: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  pto_vta: z.string().regex(/^\d{1,5}$/),
  modo: z.enum(["automatico", "manual", "desactivado"]).default("automatico"),
});

// Memoria monoproceso (slice): tenant -> settings. DB es copia best-effort.
const memoria = new Map<string, unknown>();

// POST /api/fiscal/settings — solo Dueño con reauth reciente; el tenant lo resuelve el servidor.
export const POST: APIRoute = async ({ request }) => {
  const dueno = exigirDuenoDeRequest(request);
  if (!dueno.ok) return dueno.respuesta;
  const reauth = exigirReauthReciente(dueno.ctx);
  if (reauth) return reauth;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "json invalido" }, { status: 422 });
  }
  const parsed = settingsSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 422 });
  const digitos = parsed.data.cuit.replace(/\D/g, "");
  if (!validar_cuit(digitos)) return Response.json({ error: "CUIT inválido" }, { status: 422 });
  const tenant = dueno.tenantId;
  memoria.set(tenant, { ...parsed.data, cuit: digitos, actualizado_en: new Date().toISOString() });
  try {
    await intentarPersistir((db) =>
      db.insert(fiscalSettings).values({ cuit: digitos, condicionIva: parsed.data.condicion_iva, puntoVenta: parsed.data.pto_vta, modo: parsed.data.modo }).onConflictDoNothing(),
      tenant,
    );
  } catch (e) {
    if (e instanceof BaseNoDisponible) return Response.json({ error: "base_no_disponible" }, { status: 503 });
    throw e;
  }
  return Response.json({ tenant_id: tenant, ...parsed.data, cuit: digitos }, { status: 201 });
};

export const GET: APIRoute = async ({ request }) => {
  const ctx = resolverSesion(request);
  if (!ctx) return Response.json({ error: "Iniciá sesión con Google para continuar." }, { status: 403 });
  const t: TenantResuelto = tenantDeRequest(request);
  if (!t.ok) return t.respuesta;
  const guardado = memoria.get(t.tenantId) as Record<string, unknown> | undefined;
  if (!guardado) return Response.json({ tenant_id: t.tenantId, modo: "automatico" });
  return Response.json({ tenant_id: t.tenantId, ...guardado });
};
