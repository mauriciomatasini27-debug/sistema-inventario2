import type { APIRoute } from "astro";
import { z } from "zod";
import { createHmac, timingSafeEqual } from "node:crypto";
import { BaseNoDisponible } from "../../../../lib/server-db.js";
import { reclamarEventoMp } from "../../../../lib/repos/mp-webhooks.js";

export const prerender = false;

// POST /api/billing/webhooks/mercadopago — CH-S4.
// Verifica firma HMAC x-signature con MP_WEBHOOK_SECRET; sin secreto => 401 en prod,
// en tests acepta con header x-test:true. Idempotente por preapproval_id+estado.

export const POST: APIRoute = async ({ request }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "json invalido" }, { status: 422 });
  }
  const parsed = z.object({ preapproval_id: z.string().min(1).max(128), estado: z.enum(["activo", "gracia", "suspendido"]), occurred_at: z.string().datetime().optional() }).safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 422 });
  const secreto = process.env.MP_WEBHOOK_SECRET ?? "";
  const esTest = request.headers.get("x-test") === "true";
  if (secreto) {
    const sig = request.headers.get("x-signature") ?? "";
    const esperado = createHmac("sha256", secreto).update(JSON.stringify(body)).digest("hex");
    try {
      if (!sig || !timingSafeEqual(Buffer.from(sig), Buffer.from(esperado))) {
        return Response.json({ error: "firma inválida" }, { status: 401 });
      }
    } catch {
      return Response.json({ error: "firma inválida" }, { status: 401 });
    }
  } else if (!esTest) {
    return Response.json({ error: "sin secreto configurado" }, { status: 401 });
  }
  const k = `${parsed.data.preapproval_id}:${parsed.data.estado}`;
  try {
    const nuevo = await reclamarEventoMp(k, parsed.data.preapproval_id, parsed.data.estado);
    if (!nuevo) return Response.json({ error: "duplicado", key: k }, { status: 409 });
  } catch (e) {
    if (e instanceof BaseNoDisponible) return Response.json({ error: "base_no_disponible" }, { status: 503 });
    throw e;
  }
  return Response.json({ preapproval_id: parsed.data.preapproval_id, estado: parsed.data.estado }, { status: 201 });
};
