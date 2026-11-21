import type { APIRoute } from "astro";
import { z } from "zod";
import { BaseNoDisponible } from "../../../lib/server-db.js";
import { encolarEnvio } from "../../../lib/repos/email.js";

export const prerender = false;

const sendSchema = z.object({
  stream: z.enum(["avisos", "pedidos"]),
  to: z.string().email().max(320),
  plantilla: z.enum(["cierre", "vencimiento", "pedido_confirmado"]),
  vars: z.record(z.string(), z.string()).default({}),
  idempotency_key: z.string().min(1).max(128).optional(),
});

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
  // Sin PII en vars: bloquea email/dni/cuit en valores.
  for (const v of Object.values(parsed.data.vars)) {
    if (/\d{2}-?\d{8}-?\d/.test(v) || /@/.test(v) && v.includes(".")) {
      return Response.json({ error: "vars sin PII" }, { status: 422 });
    }
  }
  let r: Awaited<ReturnType<typeof encolarEnvio>>;
  try {
    r = await encolarEnvio({ key, stream: parsed.data.stream, to: parsed.data.to, plantilla: parsed.data.plantilla, vars: parsed.data.vars });
  } catch (e) {
    if (e instanceof BaseNoDisponible) return Response.json({ error: "base_no_disponible" }, { status: 503 });
    throw e;
  }
  if (!r.ok) return Response.json({ error: "duplicado", key }, { status: 409 });
  const hasResend = Boolean(process.env.RESEND_API_KEY);
  if (r.fuente === "db") {
    return Response.json({ key, estado: hasResend ? "enviando" : "encolado", nota: hasResend ? "Resend configurado" : "sin RESEND_API_KEY, encola local", fuente: "db" }, { status: hasResend ? 201 : 202 });
  }
  return Response.json({ key, estado: hasResend ? "enviando" : "encolado", nota: hasResend ? "Resend configurado" : "sin RESEND_API_KEY, encola local" }, { status: hasResend ? 201 : 202 });
};
