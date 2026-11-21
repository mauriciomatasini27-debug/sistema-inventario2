import type { APIRoute } from "astro";
import { z } from "zod";
import { BaseNoDisponible } from "../../../../lib/server-db.js";
import {
  dataIdDesdeCuerpoMp,
  permiteBypassTestMpWebhook,
  verificarFirmaMpWebhook,
} from "../../../../lib/mp-webhook-firma.js";
import { reclamarEventoMp } from "../../../../lib/repos/mp-webhooks.js";
import {
  aplicarEstadoPreapprovalMp,
  planIdDeReasonMp,
  registrarCobroMpPorPreapproval,
  registrarEstadoCobroMp,
  tenantIdDePreapproval,
} from "../../../../lib/repos/planes.js";
import {
  consultarPagoAutorizadoMp,
  consultarPagoMp,
  consultarPreapprovalMp,
  normalizarEstadoPagoMp,
  normalizarEstadoPreapprovalMp,
} from "../../../../modules/planes/proveedor.js";

export const prerender = false;

// POST /api/billing/webhooks/mercadopago — CH-S4 / P1-80 / P1-91.
// Firma Mercado Pago (x-signature + x-request-id + data.id) antes de tocar DB.
// Sin MP_WEBHOOK_SECRET: solo con MP_WEBHOOK_ALLOW_TEST=1, x-test:true y NODE_ENV !== production.
// Contrato real: el body trae type + data.id; el estado se consulta a MP y se
// persiste en subscriptions. El payload interno {preapproval_id, estado}
// sigue aceptándose para los tests y el corte anterior.

const esquemaCuerpo = z.object({
  preapproval_id: z.string().min(1).max(128),
  estado: z.enum(["activo", "gracia", "suspendido"]),
  occurred_at: z.string().datetime().optional(),
  data: z.object({ id: z.string().min(1).max(256) }).optional(),
});

const TOPICOS_CONSULTA = new Set([
  "subscription_preapproval",
  "subscription_authorized_payment",
  "payment",
]);

function tipoDesdeCuerpoMp(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const tipo = (body as { type?: unknown }).type;
  return typeof tipo === "string" && tipo.trim() ? tipo.trim() : null;
}

function idDesdeCuerpoMp(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const data = (body as { data?: unknown }).data;
  if (!data || typeof data !== "object") return null;
  const id = (data as { id?: unknown }).id;
  if (typeof id === "string" && id.trim()) return id.trim();
  if (typeof id === "number" && Number.isFinite(id)) return String(id);
  return null;
}

function idEventoDesdeCuerpoMp(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const id = (body as { id?: unknown }).id;
  if (typeof id === "string" && id.trim()) return id.trim();
  if (typeof id === "number" && Number.isFinite(id)) return String(id);
  return null;
}

// P1-91: MP reintenta el mismo aviso (mismo id) y manda avisos distintos para el mismo
// preapproval (authorized, paused, cancelled): la clave lleva el id del aviso.
function claveEventoMp(tipo: string, dataId: string, eventoId: string | null, estado: string | null): string {
  return eventoId ? `${tipo}:${eventoId}` : `${tipo}:${dataId}:${estado ?? "desconocido"}`;
}

function respuestaMpNoDisponible(motivo: "sin_credenciales" | "red" | "http"): Response {
  const status = motivo === "sin_credenciales" ? 503 : 502;
  return Response.json({ error: "mp_no_disponible", motivo }, { status });
}

async function procesarPreapproval(preapprovalId: string, eventoId: string | null): Promise<Response> {
  const consulta = await consultarPreapprovalMp(preapprovalId);
  if (!consulta.ok) return respuestaMpNoDisponible(consulta.motivo);
  const datos = consulta.datos;
  const estado = normalizarEstadoPreapprovalMp(datos.status);
  const tenantId =
    typeof datos.external_reference === "string" && datos.external_reference.trim()
      ? datos.external_reference.trim()
      : undefined;
  // P1-91: el estado se aplica antes del reclamo: si la base falla, el evento no
  // queda marcado y MP puede reintentarlo. Las escrituras son idempotentes.
  if (estado) {
    await aplicarEstadoPreapprovalMp({
      preapprovalId,
      tenantId,
      planId: planIdDeReasonMp(datos.reason),
      estado,
    });
  }
  const clave = claveEventoMp("subscription_preapproval", preapprovalId, eventoId, estado);
  const nuevo = await reclamarEventoMp(clave, preapprovalId, estado ?? "desconocido", tenantId);
  if (!nuevo) return Response.json({ duplicado: true, key: clave }, { status: 200 });
  if (!estado) {
    return Response.json({ tipo: "subscription_preapproval", id: preapprovalId, estado: "ignorado" });
  }
  return Response.json({ tipo: "subscription_preapproval", id: preapprovalId, estado });
}

async function procesarPagoAutorizado(pagoId: string, eventoId: string | null): Promise<Response> {
  const consulta = await consultarPagoAutorizadoMp(pagoId);
  if (!consulta.ok) return respuestaMpNoDisponible(consulta.motivo);
  const preapprovalId =
    typeof consulta.datos.preapproval_id === "string" ? consulta.datos.preapproval_id : "";
  const estado = normalizarEstadoPagoMp(consulta.datos);
  const clave = claveEventoMp("subscription_authorized_payment", pagoId, eventoId, estado);
  const tenantId = preapprovalId ? await tenantIdDePreapproval(preapprovalId) : undefined;
  if (preapprovalId && estado === "rechazado") {
    await registrarCobroMpPorPreapproval({ preapprovalId, estado: "gracia" });
  } else if (preapprovalId && estado === "aprobado") {
    await registrarCobroMpPorPreapproval({ preapprovalId, estado: "activo" });
  }
  const nuevo = await reclamarEventoMp(
    clave,
    preapprovalId || pagoId,
    estado ?? "desconocido",
    tenantId,
  );
  if (!nuevo) return Response.json({ duplicado: true, key: clave }, { status: 200 });
  return Response.json({ tipo: "subscription_authorized_payment", id: pagoId, estado });
}

async function procesarPago(pagoId: string, eventoId: string | null): Promise<Response> {
  const consulta = await consultarPagoMp(pagoId);
  if (!consulta.ok) return respuestaMpNoDisponible(consulta.motivo);
  const preapprovalId =
    typeof consulta.datos.preapproval_id === "string" ? consulta.datos.preapproval_id : "";
  const estado = normalizarEstadoPagoMp(consulta.datos);
  const clave = claveEventoMp("payment", pagoId, eventoId, estado);
  const tenantId = preapprovalId ? await tenantIdDePreapproval(preapprovalId) : undefined;
  const nuevo = await reclamarEventoMp(
    clave,
    preapprovalId || pagoId,
    estado ?? "desconocido",
    tenantId,
  );
  if (!nuevo) return Response.json({ duplicado: true, key: clave }, { status: 200 });
  if (preapprovalId && estado === "rechazado") {
    await registrarCobroMpPorPreapproval({ preapprovalId, estado: "gracia" });
  }
  return Response.json({ tipo: "payment", id: pagoId, estado });
}

async function procesarEventoMp(tipo: string, dataId: string, eventoId: string | null): Promise<Response> {
  if (!TOPICOS_CONSULTA.has(tipo)) return Response.json({ ignorado: true, tipo });
  if (!dataId) return Response.json({ error: "data.id requerido" }, { status: 422 });
  try {
    if (tipo === "subscription_preapproval") return await procesarPreapproval(dataId, eventoId);
    if (tipo === "subscription_authorized_payment") {
      return await procesarPagoAutorizado(dataId, eventoId);
    }
    return await procesarPago(dataId, eventoId);
  } catch (e) {
    if (e instanceof BaseNoDisponible) {
      return Response.json({ error: "base_no_disponible" }, { status: 503 });
    }
    throw e;
  }
}

export const POST: APIRoute = async ({ request, url }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "json invalido" }, { status: 422 });
  }

  const secreto = process.env.MP_WEBHOOK_SECRET ?? "";
  const esTest = request.headers.get("x-test") === "true";
  const bypassSinFirma = !secreto && permiteBypassTestMpWebhook() && esTest;
  const dataId =
    url.searchParams.get("data.id") ?? idDesdeCuerpoMp(body) ?? dataIdDesdeCuerpoMp(body);

  if (!secreto && !bypassSinFirma) {
    return Response.json({ error: "sin secreto configurado" }, { status: 401 });
  }
  if (secreto) {
    const verificacion = verificarFirmaMpWebhook({
      xSignature: request.headers.get("x-signature"),
      xRequestId: request.headers.get("x-request-id"),
      dataId,
      secreto,
    });
    if (!verificacion.ok) {
      const error =
        verificacion.codigo === "ts_viejo"
          ? "firma expirada"
          : verificacion.codigo === "firma_ausente"
            ? "firma ausente"
            : verificacion.codigo === "sin_secreto"
              ? "sin secreto configurado"
              : "firma inválida";
      return Response.json({ error }, { status: 401 });
    }
  }

  const tipo = url.searchParams.get("type") ?? tipoDesdeCuerpoMp(body);
  if (tipo) return procesarEventoMp(tipo, dataId ?? "", idEventoDesdeCuerpoMp(body));

  const parsed = esquemaCuerpo.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 422 });

  const k = `${parsed.data.preapproval_id}:${parsed.data.estado}`;
  try {
    const nuevo = await reclamarEventoMp(k, parsed.data.preapproval_id, parsed.data.estado);
    if (!nuevo) return Response.json({ error: "duplicado", key: k }, { status: 409 });
    registrarEstadoCobroMp({
      preapprovalId: parsed.data.preapproval_id,
      estado: parsed.data.estado,
      occurredAt: parsed.data.occurred_at,
    });
  } catch (e) {
    if (e instanceof BaseNoDisponible) return Response.json({ error: "base_no_disponible" }, { status: 503 });
    throw e;
  }
  return Response.json({ preapproval_id: parsed.data.preapproval_id, estado: parsed.data.estado }, { status: 201 });
};
