import type { APIRoute } from "astro";
import { z } from "zod";
import { auditar, exigirAdmin } from "./_guard.js";

export const prerender = false;

const rollouts = new Map<string, { id: string; tenantId: string; estado: string; intentos: number }>();

// POST /api/admin/rollouts/reintentar — OP-S1/S2 202 rollout_id.
export const POST: APIRoute = async ({ request }) => {
  const admin = exigirAdmin(request);
  if (admin instanceof Response) return admin;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "El cuerpo no es JSON válido." }, { status: 422 });
  }
  const parsed = z.object({ rollout_id: z.string().min(1).max(128) }).safeParse(body);
  if (!parsed.success) return Response.json({ error: "Datos inválidos." }, { status: 422 });
  const r = rollouts.get(parsed.data.rollout_id) ?? { id: parsed.data.rollout_id, tenantId: "demo", estado: "pendiente", intentos: 0 };
  r.intentos += 1;
  r.estado = "reintentando";
  rollouts.set(r.id, r);
  auditar({ kind: "rollout_reintentado", tenantId: r.tenantId }, (admin as { googleSub: string }).googleSub, "panel");
  return Response.json({ rollout_id: r.id, estado: r.estado, intentos: r.intentos }, { status: 202 });
};

export const GET: APIRoute = async ({ request }) => {
  const admin = exigirAdmin(request);
  if (admin instanceof Response) return admin;
  return Response.json({ rollouts: [...rollouts.values()] });
};
