import type { APIRoute } from "astro";
import { z } from "zod";
import { validar_watch_event } from "../../../modules/utilities/ingesta_gmail.js";

export const prerender = false;

// POST /api/gmail/webhook — push PubSub {email, historyId}. Siempre 200 para
// no reintentar en loop; el trabajo real lo hace history.list 15min.
export const POST: APIRoute = async ({ request }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: true, nota: "body inválido, se ignora para no reintentar" });
  }
  const parsed = z.object({ email: z.string().email(), historyId: z.string().min(1) }).safeParse(body);
  if (!parsed.success) return Response.json({ ok: true, nota: "evento incompleto" });
  const errores = validar_watch_event({ email: parsed.data.email, historyId: parsed.data.historyId });
  if (errores.length > 0) return Response.json({ ok: true, nota: "evento inválido" });
  return Response.json({ ok: true, job: "gmail_history_fallback", desde: parsed.data.historyId });
};
