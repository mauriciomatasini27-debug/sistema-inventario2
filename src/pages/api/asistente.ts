import type { APIRoute } from "astro";
import { z } from "zod";
import { control } from "../../lib/store.js";
import { jsonError, membershipActiva, resolverSesion, type ContextoAuth } from "../../lib/control.js";
import { BaseNoDisponible } from "../../lib/server-db.js";
import { planIncluye } from "../../lib/repos/planes.js";
import { crearRegistroUsoIA } from "../../lib/repos/ia-uso.js";
import { crearLecturasIA } from "../../lib/repos/ia-lecturas.js";
import { fechaAR, mesAR } from "../../lib/fecha-ar.js";
import { medidorAsistente } from "../../lib/plan-panel.js";
import { CUPO_ASISTENTE_POR_DEFECTO, crearAsistente, detectar_intencion } from "../../modules/ia/asistente.js";
import { cifrasDeHerramienta } from "../../modules/ia/cifras.js";
import { preguntasSugeridas } from "../../modules/ia/preguntas.js";
import { reporteDeHerramienta } from "../../modules/ia/reportes.js";
import { ProveedorLLMFake, crear_proveedor_llm_desde_env } from "../../modules/ia/proveedor.js";

export const prerender = false;

// IA-S4 (PRD-IA-01, ADR-0039/0044/0045): acceso al asistente desde /panel.
// El tenant y el rol salen de la sesión + membership activa, nunca del body.
// El plan se chequea antes de crear el proveedor: módulo apagado no llama al
// LLM ni registra uso.

function tenantDeSesion(ctx: ContextoAuth): string | null {
  if (ctx.tenantId && control.tenants.has(ctx.tenantId)) return ctx.tenantId;
  const activas = [...control.memberships.values()].filter(
    (m) => m.googleSub === ctx.googleSub && m.estado === "activo" && control.tenants.has(m.tenantId),
  );
  return activas.length === 1 ? activas[0]!.tenantId : null;
}

function explicacionFueraDePlan(planId: string | null): string {
  return planId === null
    ? "Sin plan activo, el asistente IA no está disponible."
    : "Tu plan no incluye el asistente IA.";
}

const bodySchema = z.object({
  pregunta: z
    .string()
    .trim()
    .min(1, "La pregunta no puede estar vacía.")
    .max(500, "La pregunta es demasiado larga."),
});

export const GET: APIRoute = async ({ request }) => {
  const ctx = resolverSesion(request);
  if (!ctx) return jsonError("Iniciá sesión con Google para continuar.", 403);
  const tenantId = tenantDeSesion(ctx);
  if (!tenantId) return jsonError("No tenés permiso en este comercio.", 403);
  const membresia = membershipActiva(tenantId, ctx.googleSub);
  if (!membresia) {
    return jsonError("No tenés permiso en este comercio.", 403);
  }
  try {
    const inc = await planIncluye(tenantId, "asistente_ia");
    const preguntas = inc.incluida
      ? preguntasSugeridas(crearLecturasIA(), membresia.rol)
      : [];
    // DASH-S9: el medidor del drawer sale de la misma fórmula que /panel/plan y
    // el bloqueo del POST, con el uso del mes en hora AR.
    let cupo: Record<string, unknown> | null = null;
    if (inc.incluida) {
      const uso = await crearRegistroUsoIA().usoDelMes(tenantId, mesAR());
      const medidor = medidorAsistente({ usado: uso.consultas, cupoDeclarado: inc.cupo, hoy: fechaAR() });
      cupo = {
        usado: medidor.usado,
        cupo: medidor.cupo,
        restante: medidor.restante,
        agotado: medidor.agotado,
        reinicia_el: medidor.reinicia_el,
        explicacion: medidor.explicacion,
      };
    }
    return Response.json({
      incluido: inc.incluida,
      explicacion: inc.incluida ? "" : explicacionFueraDePlan(inc.planId),
      preguntas,
      ...(cupo === null ? {} : { cupo }),
    });
  } catch (e) {
    if (e instanceof BaseNoDisponible) return Response.json({ error: "base_no_disponible" }, { status: 503 });
    throw e;
  }
};

export const POST: APIRoute = async ({ request }) => {
  const ctx = resolverSesion(request);
  if (!ctx) return jsonError("Iniciá sesión con Google para continuar.", 403);
  const tenantId = tenantDeSesion(ctx);
  if (!tenantId) return jsonError("No tenés permiso en este comercio.", 403);
  const membresia = membershipActiva(tenantId, ctx.googleSub);
  if (!membresia) return jsonError("No tenés permiso en este comercio.", 403);

  let cuerpo: unknown;
  try {
    cuerpo = await request.json();
  } catch {
    return Response.json({ error: "El cuerpo no es JSON válido." }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(cuerpo);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Datos inválidos." },
      { status: 400 },
    );
  }

  let inclusion;
  try {
    inclusion = await planIncluye(tenantId, "asistente_ia");
  } catch (e) {
    if (e instanceof BaseNoDisponible) return Response.json({ error: "base_no_disponible" }, { status: 503 });
    throw e;
  }
  if (!inclusion.incluida) {
    return Response.json(
      { error: explicacionFueraDePlan(inclusion.planId), codigo: "fuera_de_plan" },
      { status: 403 },
    );
  }

  const cupo =
    typeof inclusion.cupo === "number" ? inclusion.cupo : CUPO_ASISTENTE_POR_DEFECTO;
  // Sin ASSISTANT_LLM_KEY el proveedor es el fake, que devuelve el prompt
  // crudo: en producción eso no se le muestra a nadie.
  const proveedor = crear_proveedor_llm_desde_env();
  if (proveedor instanceof ProveedorLLMFake) {
    return Response.json(
      { error: "El asistente IA todavía no está configurado.", codigo: "asistente_no_configurado" },
      { status: 503 },
    );
  }
  const registro = crearRegistroUsoIA();
  const asistente = crearAsistente({
    proveedor,
    registro,
    lecturas: crearLecturasIA(),
    cupoConsultasPorMes: cupo,
  });
  const herramienta = detectar_intencion(parsed.data.pregunta, asistente.catalogo);
  const respuesta = await asistente.preguntar(
    { tenantId, rol: membresia.rol },
    parsed.data.pregunta,
  );
  if (respuesta.motivo === "sin_cupo") {
    const uso = await registro.usoDelMes(tenantId, mesAR());
    const medidor = medidorAsistente({ usado: uso.consultas, cupoDeclarado: inclusion.cupo, hoy: fechaAR() });
    const explicacion = medidor.explicacion || respuesta.texto;
    return Response.json(
      {
        codigo: "sin_cupo",
        error: explicacion,
        texto: explicacion,
        reinicia_el: medidor.reinicia_el,
      },
      { status: 429 },
    );
  }
  const salida: Record<string, unknown> = {
    texto: respuesta.texto,
    rechazada: respuesta.rechazada,
    ...(respuesta.herramienta ? { herramienta: respuesta.herramienta } : {}),
  };
  if (herramienta === null) salida["fueraDeCatalogo"] = true;
  if (!respuesta.rechazada && respuesta.herramienta && respuesta.datos !== undefined) {
    salida["cifras"] = cifrasDeHerramienta(respuesta.herramienta, respuesta.datos);
    salida["reporte"] = reporteDeHerramienta(respuesta.herramienta);
  }
  return Response.json(salida);
};
