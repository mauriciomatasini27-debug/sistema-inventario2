import type { APIRoute } from "astro";
import { control } from "../../../lib/store.js";
import { jsonError, membershipActiva, resolverSesion, type ContextoAuth } from "../../../lib/control.js";
import { armarPantallaDestinatarios, parsearEleccion } from "../../../modules/alertas/destinatarios.js";
import { cargarPersonasAlerta, guardarEleccion } from "../../../lib/repos/alerta-prefs.js";

export const prerender = false;

function tenantDeSesion(ctx: ContextoAuth): string | null {
  if (ctx.tenantId && control.tenants.has(ctx.tenantId)) return ctx.tenantId;
  const activas = [...control.memberships.values()].filter(
    (m) => m.googleSub === ctx.googleSub && m.estado === "activo" && control.tenants.has(m.tenantId),
  );
  return activas.length === 1 ? activas[0]!.tenantId : null;
}

function nombresDelTenant(tenantId: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of control.memberships.values()) {
    if (m.tenantId !== tenantId) continue;
    const u = control.users.get(m.googleSub);
    out.set(m.googleSub, u?.nombre ?? u?.email ?? m.googleSub);
  }
  return out;
}

async function pantalla(tenantId: string, sesionSub: string, sesionRol: "dueno" | "empleado") {
  const { duenos, encargados } = await cargarPersonasAlerta(tenantId);
  return armarPantallaDestinatarios({
    sesionSub,
    sesionRol,
    duenos,
    encargados,
    nombres: nombresDelTenant(tenantId),
    ahoraMs: Date.now(),
  });
}

export const GET: APIRoute = async ({ request }) => {
  const ctx = resolverSesion(request);
  if (!ctx) return jsonError("Iniciá sesión con Google para continuar.", 403);
  const tenantId = tenantDeSesion(ctx);
  if (!tenantId) return jsonError("No tenés permiso en este comercio.", 403);
  const m = membershipActiva(tenantId, ctx.googleSub);
  if (!m) return jsonError("No tenés permiso en este comercio.", 403);
  const filas = await pantalla(tenantId, ctx.googleSub, m.rol);
  return Response.json({ filas });
};

export const PUT: APIRoute = async ({ request }) => {
  const ctx = resolverSesion(request);
  if (!ctx) return jsonError("Iniciá sesión con Google para continuar.", 403);
  const tenantId = tenantDeSesion(ctx);
  if (!tenantId) return jsonError("No tenés permiso en este comercio.", 403);
  const m = membershipActiva(tenantId, ctx.googleSub);
  if (!m) return jsonError("No tenés permiso en este comercio.", 403);
  if (m.rol === "dueno") {
    return Response.json({ error: "El dueño es destinatario fijo.", codigo: "destinatario_fijo" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Revisá canal, hora o pausa.", 400);
  }
  const parsed = parsearEleccion(body);
  if (!parsed.ok) {
    const msg =
      parsed.error === "opt_in"
        ? "No podés cambiar el opt-in desde acá."
        : "Revisá canal, hora o pausa.";
    return Response.json({ error: msg, codigo: parsed.error }, { status: 400 });
  }
  await guardarEleccion({ tenantId, googleSub: ctx.googleSub, pedido: parsed.pedido });
  const filas = await pantalla(tenantId, ctx.googleSub, m.rol);
  const fila = filas.find((f) => f.googleSub === ctx.googleSub);
  return Response.json({ fila: fila ?? null });
};
