import type { APIRoute } from "astro";
import { control } from "../../../lib/store.js";
import { jsonError, resolverSesion } from "../../../lib/control.js";
import { persistirAuthEvent, asegurarAltaPendiente, buscarAltasPorDueno } from "../../../lib/control-db.js";
import { altaAutoservicioSchema } from "../../../lib/validation.js";
import { ejecutarAprovisionamiento } from "../../../jobs/aprovisionar.js";
import {
  decidirAlta,
  nombreDatabase,
  slugDeNombre,
} from "../../../modules/tenants/aprovisionar.js";
import { generar_codigo_vincular, normalizar_ar, VINCULAR_TTL_MIN } from "../../../modules/whatsapp/vincular.js";
import { aplicarDefaultsModulosBot } from "../../../lib/repos/bot-modulos.js";
import { sembrarUbicacionesRubro } from "../../../lib/repos/catalogo.js";
import { registrarSiembraUbicaciones } from "../../../lib/repos/siembra-ubicaciones.js";
import { VERSION_PLANTILLAS_RUBRO } from "../../../modules/onboarding/plantillas-rubro.js";
import {
  EVENTO_UBICACIONES_SEMBRADAS,
  EVENTO_UBICACIONES_SEMBRADAS_ERROR,
  ORIGEN_PLANTILLA_RUBRO,
} from "../../../modules/onboarding/ubicaciones-rubro.js";
import { sha256Hex } from "../../../modules/auth/sesiones.js";

export const prerender = false;

// POST /api/onboarding/alta — alta autoservicio ON1. El dueño sesionado crea
// su comercio sin superadmin: nombre, rubro y WhatsApp. Idempotente por
// request_key: el doble envío devuelve el tenant existente con 409.
// Delega en el runner durable con espejo en memoria y 409 también en frío.
export const POST: APIRoute = async ({ request }) => {
  const ctx = resolverSesion(request);
  if (!ctx) return jsonError("Iniciá sesión con Google para continuar.", 403);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("El cuerpo no es JSON válido.", 422);
  }
  const parsed = altaAutoservicioSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? "Datos del comercio inválidos.", 422);
  }
  const b = parsed.data;
  const requestKey =
    b.request_key ?? request.headers.get("Idempotency-Key") ?? `${ctx.googleSub}:${b.nombre_comercio}`;

  const existentes = [...control.tenants.values()].map((t) => ({
    tenantId: t.id,
    ownerGoogleSub: t.ownerGoogleSub,
    nombreComercio: t.nombreComercio,
    requestKey: t.requestKey,
  }));
  const decision = decidirAlta({
    solicitud: { ownerGoogleSub: ctx.googleSub, nombreComercio: b.nombre_comercio, plan: "demo", requestKey },
    existentes,
  });
  if (decision.accion === "reusar") {
    return Response.json(
      { error: "Ya tenés un comercio en este usuario.", tenant_id: decision.tenantId },
      { status: 409 },
    );
  }
  if (process.env.CONTROL_DATABASE_URL) {
    const frias = await buscarAltasPorDueno(ctx.googleSub);
    const fria = decidirAlta({
      solicitud: { ownerGoogleSub: ctx.googleSub, nombreComercio: b.nombre_comercio, plan: "demo", requestKey },
      existentes: frias,
    });
    if (fria.accion === "reusar") {
      return Response.json(
        { error: "Ya tenés un comercio en este usuario.", tenant_id: fria.tenantId },
        { status: 409 },
      );
    }
  }

  let numero: string | null = null;
  if (b.numero.trim()) {
    numero = normalizar_ar(b.numero);
    if (!numero) return jsonError("El número no es un celular argentino válido.", 422);
  }

  const id = crypto.randomUUID();
  let slug = slugDeNombre(b.nombre_comercio);
  if ([...control.tenants.values()].some((t) => t.slug === slug)) slug = `${slug}-${id.slice(0, 8)}`;
  const database = nombreDatabase(id);
  control.tenants.set(id, {
    id,
    nombreComercio: b.nombre_comercio.trim(),
    slug,
    estado: "aprovisionando",
    plan: "demo",
    moneda: "ARS",
    ownerGoogleSub: ctx.googleSub,
    esDemo: true,
    rubro: b.rubro,
    requestKey,
  });
  control.databases.set(id, { tenantId: id, database, estado: "pendiente" });
  const jobId = crypto.randomUUID();
  control.jobs.set(jobId, { id: jobId, tenantId: id, estado: "pendiente", intentos: 0 });
  await asegurarAltaPendiente({
    id,
    nombreComercio: b.nombre_comercio.trim(),
    slug,
    plan: "demo",
    moneda: "ARS",
    ownerGoogleSub: ctx.googleSub,
    esDemo: true,
    requestKey,
    database,
    jobId,
  });

  const corrido = await ejecutarAprovisionamiento(jobId);
  // BOT-S1: al terminar el alta se activan los módulos del bot del rubro.
  await aplicarDefaultsModulosBot(id, b.rubro);
  try {
    const sembrado = await sembrarUbicacionesRubro(id, b.rubro);
    control.events.push({
      tenantId: id,
      tipo: EVENTO_UBICACIONES_SEMBRADAS,
      actor: "sistema",
      creadoEn: new Date().toISOString(),
      detalle: {
        origen: ORIGEN_PLANTILLA_RUBRO,
        rubro: b.rubro,
        version: VERSION_PLANTILLAS_RUBRO,
        cantidad: sembrado.creadas.length,
      },
    });
    await registrarSiembraUbicaciones(id, {
      rubro: b.rubro,
      version: VERSION_PLANTILLAS_RUBRO,
      cantidad: sembrado.creadas.length,
    });
  } catch (e) {
    control.events.push({
      tenantId: id,
      tipo: EVENTO_UBICACIONES_SEMBRADAS_ERROR,
      actor: "sistema",
      creadoEn: new Date().toISOString(),
      detalle: {
        origen: ORIGEN_PLANTILLA_RUBRO,
        rubro: b.rubro,
        version: VERSION_PLANTILLAS_RUBRO,
        error: e instanceof Error ? e.message : String(e),
      },
    });
  }
  control.events.push({
    tenantId: id,
    tipo: "alta_formulario_completo",
    actor: ctx.googleSub,
    detalle: { rubro: b.rubro },
  });
  void persistirAuthEvent({ tenantId: id, tipo: "alta_comercio", actor: ctx.googleSub });

  let vincular: { codigo: string; expira_en_min: number } | null = null;
  if (numero) {
    const codigo = generar_codigo_vincular();
    const ahoraMs = Date.now();
    control.vincularCodes.set(numero, {
      codigoHash: sha256Hex(codigo),
      expiraEn: ahoraMs + VINCULAR_TTL_MIN * 60_000,
      usado: false,
      numeroRegistrado: numero,
      tenantId: id,
      googleSub: ctx.googleSub,
      intentosFallidos: 0,
    });
    vincular = { codigo, expira_en_min: VINCULAR_TTL_MIN };
  }

  return Response.json({ tenant_id: id, database, estado: corrido.estado, numero, vincular }, { status: 201 });
};
