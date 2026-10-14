import type { APIRoute } from "astro";
import { z } from "zod";

export const prerender = false;

const NOMBRES = ["cierre_caja", "recomendacion_mensual", "aplica_precio_programado", "verifica_inmutables", "envio_matutino"] as const;

const cola = new Map<string, { nombre: string; payload: unknown; runAt: string }>();

// POST /api/jobs/enqueue — CH-S3 pg-boss mismo repo (descriptor + memoria).
// 201 nuevo, 409 key repetida, 422 nombre/run_at inválido.
export const POST: APIRoute = async ({ request }) => {
  const key = request.headers.get("Idempotency-Key") ?? "";
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "json invalido" }, { status: 422 });
  }
  const parsed = z.object({ nombre: z.enum(NOMBRES), payload: z.record(z.string(), z.unknown()).default({}), run_at: z.string().datetime().optional(), idempotency_key: z.string().min(1).max(128).optional() }).safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 422 });
  const k = parsed.data.idempotency_key ?? (key || crypto.randomUUID());
  if (cola.has(k)) return Response.json({ error: "duplicado", key: k }, { status: 409 });
  const runAt = parsed.data.run_at ?? new Date().toISOString();
  cola.set(k, { nombre: parsed.data.nombre, payload: parsed.data.payload, runAt });
  return Response.json({ key: k, nombre: parsed.data.nombre, run_at: runAt }, { status: 201 });
};

export const GET: APIRoute = async () => {
  return Response.json({ jobs: [...cola.entries()].map(([key, v]) => ({ key, ...v })) });
};
