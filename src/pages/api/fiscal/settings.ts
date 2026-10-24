import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { validar_cuit } from "../../../modules/fiscal/fiscal.js";
import {
  leerCadenaFiscal,
  registrarCambioFiscal,
  revertirCadenaFiscal,
  versionDesdeFila,
  type FichaFiscal,
} from "../../../modules/fiscal/version-settings.js";
import { BaseNoDisponible, intentarLeer, intentarPersistir } from "../../../lib/server-db.js";
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

// POST /api/fiscal/settings — solo Dueño con reauth reciente (AU10).
// FE-S3: CUIT, condición IVA y punto de venta se versionan en memoria.
// El índice único por tenant (ADR-0074) deja una sola fila vigente.
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
  const ahora = new Date().toISOString();
  const ficha: FichaFiscal = {
    cuit: digitos,
    razon_social: parsed.data.razon_social,
    domicilio: parsed.data.domicilio,
    condicion_iva: parsed.data.condicion_iva,
    inicio_actividades: parsed.data.inicio_actividades,
    pto_vta: parsed.data.pto_vta,
    modo: parsed.data.modo,
    ...(parsed.data.iibb !== undefined ? { iibb: parsed.data.iibb } : {}),
  };
  const antes = leerCadenaFiscal(tenant);
  let previaExterna = null;
  if (antes.versiones.length === 0) {
    try {
      const fila = await intentarLeer(async (db) => {
        const filas = await db.select().from(fiscalSettings).where(eq(fiscalSettings.tenantId, tenant)).limit(1);
        return filas[0] ?? null;
      }, tenant);
      if (fila) previaExterna = versionDesdeFila(fila, ahora);
    } catch (e) {
      if (e instanceof BaseNoDisponible) return Response.json({ error: "base_no_disponible" }, { status: 503 });
      throw e;
    }
  }
  const { cadena, decision } = registrarCambioFiscal(tenant, previaExterna, ficha, ahora, dueno.ctx.googleSub);
  try {
    await intentarPersistir((db) =>
      db.insert(fiscalSettings).values({
        tenantId: tenant,
        cuit: digitos,
        condicionIva: ficha.condicion_iva,
        puntoVenta: ficha.pto_vta,
        modo: ficha.modo,
      }).onConflictDoUpdate({
        target: fiscalSettings.tenantId,
        set: { cuit: digitos, condicionIva: ficha.condicion_iva, puntoVenta: ficha.pto_vta, modo: ficha.modo },
      }),
      tenant,
    );
  } catch (e) {
    revertirCadenaFiscal(tenant, antes);
    if (e instanceof BaseNoDisponible) return Response.json({ error: "base_no_disponible" }, { status: 503 });
    throw e;
  }
  const auditoria = decision.tipo === "alta" || decision.tipo === "cambio"
    ? cadena.auditoria.at(-1) ?? null
    : null;
  return Response.json({ tenant_id: tenant, ...ficha, version: decision.version.version, auditoria }, { status: 201 });
};

export const GET: APIRoute = async ({ request }) => {
  const ctx = resolverSesion(request);
  if (!ctx) return Response.json({ error: "Iniciá sesión con Google para continuar." }, { status: 403 });
  const t: TenantResuelto = tenantDeRequest(request);
  if (!t.ok) return t.respuesta;
  const cadena = leerCadenaFiscal(t.tenantId);
  const vigente = cadena.versiones.at(-1) ?? null;
  let fila: { cuit: string; condicionIva: string; puntoVenta: string; modo: string } | null = null;
  try {
    fila = await intentarLeer(async (db) => {
      const filas = await db.select().from(fiscalSettings).where(eq(fiscalSettings.tenantId, t.tenantId)).limit(1);
      return filas[0] ?? null;
    }, t.tenantId);
  } catch (e) {
    if (!(e instanceof BaseNoDisponible)) throw e;
  }
  if (fila) {
    return Response.json({
      tenant_id: t.tenantId,
      cuit: fila.cuit,
      condicion_iva: fila.condicionIva,
      pto_vta: fila.puntoVenta,
      modo: fila.modo,
      ...(vigente
        ? {
            razon_social: vigente.ficha.razon_social,
            domicilio: vigente.ficha.domicilio,
            inicio_actividades: vigente.ficha.inicio_actividades,
            ...(vigente.ficha.iibb !== undefined ? { iibb: vigente.ficha.iibb } : {}),
          }
        : {}),
      version: vigente?.version ?? null,
      auditoria: cadena.auditoria,
    });
  }
  if (!vigente) return Response.json({ tenant_id: t.tenantId, modo: "automatico", version: null, auditoria: [] });
  return Response.json({
    tenant_id: t.tenantId,
    ...vigente.ficha,
    version: vigente.version,
    auditoria: cadena.auditoria,
    actualizado_en: vigente.vigente_desde,
  });
};
