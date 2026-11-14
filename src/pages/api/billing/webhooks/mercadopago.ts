import type { APIRoute } from "astro";
import { z } from "zod";
import { BaseNoDisponible } from "../../../../lib/server-db.js";
import {
  dataIdDesdeCuerpoMp,
  esProduccionMpWebhook,
  verificarFirmaMpWebhook,
} from "../../../../lib/mp-webhook-firma.js";
import { reclamarEventoMp } from "../../../../lib/repos/mp-webhooks.js";
import { registrarEstadoCobroMp } from "../../../../lib/repos/planes.js";

export const prerender = false;

// POST /api/billing/webhooks/mercadopago — CH-S4 / P1-78.
// Firma Mercado Pago (x-signature + x-request-id + data.id) antes de tocar DB.
// Sin MP_WEBHOOK_SECRET: solo tests con x-test:true y NODE_ENV !== production.

const esquemaCuerpo = z.object({
  preapproval_id: z.string().min(1).max(128),
  estado: z.enum(["activo", "gracia", "suspendido"]),
  occurred_at: z.string().datetime().optional(),
  data: z.object({ id: z.string().min(1).max(256) }).optional(),
});

export const POST: APIRoute = async ({ request, url }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "json invalido" }, { status: 422 });
  }

  const secreto = process.env.MP_WEBHOOK_SECRET ?? "";
  const esTest = request.headers.get("x-test") === "true";
  const enProd = esProduccionMpWebhook();
  const dataId = url.searchParams.get("data.id") ?? dataIdDesdeCuerpoMp(body);

  if (!secreto) {
    if (enProd) {
      return Response.json({ error: "sin secreto configurado" }, { status: 401 });
    }
    if (!esTest) {
      return Response.json({ error: "sin secreto configurado" }, { status: 401 });
    }
  } else {
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