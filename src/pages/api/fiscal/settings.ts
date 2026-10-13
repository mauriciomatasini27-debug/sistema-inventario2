import type { APIRoute } from "astro";
import { z } from "zod";
import { validar_cuit } from "../../../modules/fiscal/fiscal.js";
import { intentarPersistir } from "../../../lib/server-db.js";
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

// POST /api/fiscal/settings — Dueño+reauth (reauth se exige vía header en prod;
// acá se exige tenant dueño vía membership cuando hay sesión, si no 403 en prod).
export const POST: APIRoute = async ({ request }) => {
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
  const tenant = request.headers.get("x-tenant-id") ?? "demo";
  memoria.set(tenant, { ...parsed.data, cuit: digitos, actualizado_en: new Date().toISOString() });
  void intentarPersistir((db) =>
    db.insert(fiscalSettings).values({ cuit: digitos, condicionIva: parsed.data.condicion_iva, puntoVenta: parsed.data.pto_vta, modo: parsed.data.modo }).onConflictDoNothing(),
  );
  return Response.json({ tenant_id: tenant, ...parsed.data, cuit: digitos }, { status: 201 });
};

export const GET: APIRoute = async ({ url }) => {
  const tenant = url.searchParams.get("tenant_id") ?? "demo";
  return Response.json((memoria.get(tenant) as Record<string, unknown> | undefined) ?? { tenant_id: tenant, modo: "automatico" });
};
