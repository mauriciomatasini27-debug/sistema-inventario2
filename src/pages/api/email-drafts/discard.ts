import type { APIRoute } from "astro";
import { z } from "zod";
import { exigirDuenoDeRequest } from "../../../lib/tenant-context.js";
import { BaseNoDisponible } from "../../../lib/server-db.js";
import { descartarBorradorGmail } from "../../../lib/repos/gmail-borradores.js";

export const prerender = false;

const SIN_CACHE = { "Cache-Control": "no-store" };

const descartarSchema = z.object({
  draft_id: z.string().min(1).max(128),
});

export const POST: APIRoute = async ({ request }) => {
  const dueno = exigirDuenoDeRequest(request);
  if (!dueno.ok) return dueno.respuesta;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "json invalido" }, { status: 422, headers: SIN_CACHE });
  }
  const parsed = descartarSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 422, headers: SIN_CACHE });
  }
  const b = parsed.data;
  let r: Awaited<ReturnType<typeof descartarBorradorGmail>>;
  try {
    r = await descartarBorradorGmail({ tenantId: dueno.tenantId, draftId: b.draft_id });
  } catch (e) {
    if (e instanceof BaseNoDisponible) {
      return Response.json({ error: "base_no_disponible" }, { status: 503, headers: SIN_CACHE });
    }
    throw e;
  }
  if (!r.ok) {
    return Response.json({ error: r.error, codigo: r.codigo }, { status: r.status, headers: SIN_CACHE });
  }
  return Response.json(
    { ok: true, draft_id: b.draft_id, estado: "descartado", creado: r.creado },
    { headers: SIN_CACHE },
  );
};
