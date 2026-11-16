import type { APIRoute } from "astro";
import { contarMiembrosActivos, exigirReauthReciente, jsonError } from "../../../lib/control.js";
import { aplicarEfectoInvitacion } from "../../../lib/control-db.js";
import { control } from "../../../lib/store.js";
import { exigirDuenoDeRequest } from "../../../lib/tenant-context.js";
import { normalizarEmail } from "../../../modules/auth/oidc.js";
import {
  invitarEmpleado,
  parseEmailInvitacion,
  proyectarUsuarios,
  type FotoInvitar,
  type IntencionInvitar,
  type MiembroFoto,
  type PedidoInvitar,
  type ResultadoInvitar,
} from "../../../modules/tenants/invitar-empleado.js";
import type { RegistroInvitacion } from "../../../modules/tenants/invitaciones.js";

export const prerender = false;

function leerFoto(tenantId: string): FotoInvitar {
  const tenant = control.tenants.get(tenantId);
  const miembros: MiembroFoto[] = [];
  for (const m of control.memberships.values()) {
    if (m.tenantId !== tenantId || m.estado !== "activo") continue;
    const email = control.users.get(m.googleSub)?.email;
    if (!email) continue;
    miembros.push({ email: normalizarEmail(email), rol: m.rol });
  }
  const pendientes: RegistroInvitacion[] = [];
  for (const inv of control.invitations.values()) {
    if (inv.tenantId !== tenantId) continue;
    pendientes.push({
      tokenHash: inv.tokenHash,
      tenantId: inv.tenantId,
      email: inv.email,
      rol: inv.rol,
      permisos: [...inv.permisos],
      estado: inv.estado,
      expiraAt: inv.expiraAt,
      ...(inv.creadaPor !== undefined ? { creadaPor: inv.creadaPor } : {}),
      ...(inv.aceptadaPor !== undefined ? { aceptadaPor: inv.aceptadaPor } : {}),
    });
  }
  return {
    plan: tenant?.plan || "base",
    miembrosActivos: contarMiembrosActivos(tenantId),
    miembros,
    pendientes,
  };
}

function responder(resultado: Exclude<ResultadoInvitar, { tipo: "lista" }>): Response {
  switch (resultado.tipo) {
    case "ya_pendiente":
      return Response.json({ resultado: "ya_pendiente", expira_at: resultado.expiraAt }, { status: 200 });
    case "ya_miembro":
      return Response.json({ resultado: "ya_miembro" }, { status: 409 });
    case "cupo_lleno":
      return Response.json(
        { resultado: "cupo_lleno", limite: resultado.limite, ocupados: resultado.ocupados },
        { status: 409 },
      );
    case "nada_que_reenviar":
      return Response.json({ resultado: "nada_que_reenviar" }, { status: 409 });
  }
}

async function avisarLink(para: string, link: string): Promise<"enviado" | "omitido"> {
  const key = process.env.RESEND_API_KEY ?? "";
  if (!key) return "omitido";
  const from = process.env.EMAIL_FROM ?? "Inventario <seguridad@local>";
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5000);
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [para],
        subject: "Te invitaron a un comercio",
        text: `Entrá con este enlace para sumarte:\n${link}\n`,
      }),
      signal: ctrl.signal,
    });
    return res.ok ? "enviado" : "omitido";
  } catch (error) {
    console.error("P1-88 aviso de invitación omitido", error instanceof Error ? error.message : "error");
    return "omitido";
  } finally {
    clearTimeout(timer);
  }
}

async function responderGuardado(resultado: Extract<ResultadoInvitar, { tipo: "lista" }>): Promise<Response> {
  const aviso = await avisarLink(resultado.efecto.insertar.email, resultado.efecto.link);
  const nombre = resultado.efecto.entrega === "reenvio" ? "reenviada" : "creada";
  return Response.json(
    {
      resultado: nombre,
      link: resultado.efecto.link,
      expira_at: resultado.expiraAt,
      aviso,
    },
    { status: nombre === "creada" ? 201 : 200 },
  );
}

function parseIntencion(raw: unknown): IntencionInvitar | null {
  if (raw === undefined || raw === "crear") return "crear";
  if (raw === "reenviar") return "reenviar";
  return null;
}

async function guardar(pedido: PedidoInvitar): Promise<Response> {
  const primero = invitarEmpleado(pedido, leerFoto(pedido.tenantId));
  if (primero.tipo !== "lista") return responder(primero);
  if ((await aplicarEfectoInvitacion(primero.efecto)) === "ok") return responderGuardado(primero);

  const segundo = invitarEmpleado(pedido, leerFoto(pedido.tenantId));
  if (segundo.tipo !== "lista") return responder(segundo);
  if ((await aplicarEfectoInvitacion(segundo.efecto)) === "ok") return responderGuardado(segundo);

  // P1-88: un tercer lista no se guardó. No devolver un link cuyo hash no está.
  const tercero = invitarEmpleado(pedido, leerFoto(pedido.tenantId));
  if (tercero.tipo === "lista") return Response.json({ resultado: "ya_pendiente" }, { status: 200 });
  return responder(tercero);
}

export const GET: APIRoute = async ({ request }) => {
  const dueno = exigirDuenoDeRequest(request);
  if (!dueno.ok) return dueno.respuesta;
  const vista = proyectarUsuarios(leerFoto(dueno.tenantId), new Date());
  return Response.json(vista);
};

export const POST: APIRoute = async ({ request }) => {
  const dueno = exigirDuenoDeRequest(request);
  if (!dueno.ok) return dueno.respuesta;
  const reauth = exigirReauthReciente(dueno.ctx);
  if (reauth) return reauth;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("El cuerpo no es JSON válido.", 422);
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return jsonError("El cuerpo no es JSON válido.", 422);
  }
  const crudo = body as { email?: unknown; intencion?: unknown };
  const email = typeof crudo.email === "string" ? parseEmailInvitacion(crudo.email) : null;
  if (!email) return jsonError("El email no es válido.", 422);
  const intencion = parseIntencion(crudo.intencion);
  if (!intencion) return jsonError("La intención no es válida.", 422);

  return guardar({
    tenantId: dueno.tenantId,
    email,
    creadaPor: dueno.ctx.googleSub,
    intencion,
    origen: new URL(request.url).origin,
    ahora: new Date(),
  });
};
