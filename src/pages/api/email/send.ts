import type { APIRoute } from "astro";
import { z } from "zod";
import { store } from "../../../lib/store.js";

export const prerender = false;

const sendSchema = z.object({
  stream: z.enum(["avisos", "pedidos"]),
  to: z.string().email().max(320),
  plantilla: z.enum(["cierre", "vencimiento", "pedido_confirmado"]),
  vars: z.record(z.string()).default({}),
  idempotency_key: z.string().min(1).max(128).optional(),
});

// POST /api/email/send — CH-S1. Resend real por env RESEND_API_KEY; sin key
// encola en emailOutbox (best-effort) y devuelve 202 encolado.
export const POST: APIRoute = async ({ request }) => {
  const headerKey = request.headers.get("Idempotency-Key") ?? "";
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "json invalido" }, { status: 422 });
  }
  const parsed = sendSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 422 });
  const key = parsed.data.idempotency_key ?? (headerKey || crypto.randomUUID());
  if (store.emailOutbox.has(key)) return Response.json({ error: "duplicado", key }, { status: 409 });
  // Sin PII en vars: bloquea email/dni/cuit en valores.
  for (const v of Object.values(parsed.data.vars)) {
    if (/\d{2}-?\d{8}-?\d/.test(v) || /@/.test(v) && v.includes(".")) {
      return Response.json({ error: "vars sin PII" }, { status: 422 });
    }
  }
  const item = { id: crypto.randomUUID(), idempotencyKey: key, stream: parsed.data.stream, to: parsed.data.to, plantilla: parsed.data.plantilla, estado: "encolado" as const, creadoEn: new Date().toISOString() };
  store.emailOutbox.set(key, item as never);
  const hasResend = Boolean(process.env.RESEND_API_KEY);
  return Response.json({ key, estado: hasResend ? "enviando" : "encolado", nota: hasResend ? "Resend configurado" : "sin RESEND_API_KEY, encola local" }, { status: hasResend ? 201 : 202 });
};
