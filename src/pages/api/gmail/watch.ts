import type { APIRoute } from "astro";
import { z } from "zod";

export const prerender = false;

// Estado monoproceso watch Gmail (CS): userId -> {historyId, expiration}.
const watches = new Map<string, { historyId: string; expiration: string; topic: string }>();

// POST /api/gmail/watch — registra users.watch (stub local + descriptor real).
export const POST: APIRoute = async ({ request }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "json invalido" }, { status: 422 });
  }
  const parsed = z.object({ user_id: z.string().email().max(320), topic: z.string().min(1).max(300) }).safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 422 });
  const historyId = crypto.randomUUID();
  const expiration = new Date(Date.now() + 7 * 86400_000).toISOString();
  watches.set(parsed.data.user_id, { historyId, expiration, topic: parsed.data.topic });
  return Response.json({ user_id: parsed.data.user_id, historyId, expiration, renuevo_en: "24h", fallback: "history.list 15min" }, { status: 201 });
};
