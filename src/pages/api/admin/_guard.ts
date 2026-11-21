// Todas las rutas /api/admin/* lo usan: sesión + allowlist por google_sub
// (nunca email). Cada acto (exitoso o denegado) se audita en adminStore +
// persist best-effort. Los POST mutantes exigen además confirmo_id igual al
// tenant (PA1: confirmación escribiendo el ID) y motivo no vacío.
// Los mutantes pasan por exigirAdminMutante: además del allowlist piden
// reauth reciente (PA1.8, 5 min) y responden 401 reauth_requerida con la URL
// que usa el panel para volver a confirmar con Google y retomar en /admin.

import { esAdminAllowlist, exigeReauth, leerAllowlist } from "../../../modules/admin/guard.js";
import { registrar_acto, type ActoAdmin } from "../../../modules/admin/actos.js";
import type { OrigenAdmin } from "../../../modules/admin/boundary.js";
import { adminStore, ultimoHashAdmin, type AdminActoMem } from "../../../lib/admin-store.js";
import { persistirAdminPlataforma, persistirActoAdmin } from "../../../lib/admin-db.js";
import { asegurarAdminHidratado } from "../../../lib/admin-hydrate.js";
import { jsonError, resolverSesion } from "../../../lib/control.js";

export interface AdminCtx {
  googleSub: string;
}

export function exigirAdmin(request: Request): AdminCtx | Response {
  const ctx = resolverSesion(request);
  if (!ctx) return jsonError("Iniciá sesión con Google para continuar.", 403);
  if (!esAdminAllowlist(ctx.googleSub, leerAllowlist())) {
    auditar(
      { kind: "senal_descartada", outboxId: "guard", tipo: "acceso_denegado_admin" },
      ctx.googleSub,
      "panel",
    );
    return jsonError("No tenés permiso para ver el panel.", 403);
  }
  // P10-17: el uso del panel registra al sub como admin de plataforma (copia durable best-effort; la verdad sigue en la allowlist).
  void persistirAdminPlataforma(ctx.googleSub);
  return { googleSub: ctx.googleSub };
}

export async function exigirAdminListo(request: Request): Promise<AdminCtx | Response> {
  const admin = exigirAdmin(request);
  if (admin instanceof Response) return admin;
  await asegurarAdminHidratado();
  return admin;
}

export async function exigirAdminMutante(request: Request): Promise<AdminCtx | Response> {
  const admin = await exigirAdminListo(request);
  if (admin instanceof Response) return admin;
  const reauth = exigeReauth({ lastReauthEn: resolverSesion(request)?.sesion.reauthAt ?? null });
  if (!reauth.ok) {
    return Response.json(
      { error: reauth.error, codigo: "reauth_requerida", reauth_url: "/api/auth/reauth?continuar=/admin" },
      { status: 401 },
    );
  }
  return admin;
}

export function auditar(acto: ActoAdmin, actorGoogleSub: string, origen: OrigenAdmin): AdminActoMem {
  const registrado = registrar_acto({ acto, actorGoogleSub, prevHash: ultimoHashAdmin(), origen });
  const mem: AdminActoMem = {
    id: registrado.hash,
    actorGoogleSub: registrado.actorGoogleSub,
    actoKind: acto.kind,
    tenantId: "tenantId" in acto ? (acto.tenantId ?? null) : null,
    detalle: acto,
    prevHash: registrado.prevHash,
    hash: registrado.hash,
    origen: registrado.origen,
    creadoEn: registrado.creadoEn,
  };
  adminStore.actos.push(mem);
  void persistirActoAdmin({
    actorGoogleSub: mem.actorGoogleSub,
    actoKind: mem.actoKind,
    tenantId: mem.tenantId,
    detalle: mem.detalle,
    prevHash: mem.prevHash,
    hash: mem.hash,
    origen: mem.origen,
  });
  return mem;
}

export function exigirConfirmacion(
  body: Record<string, unknown>,
  tenantId: string,
): Response | { motivo: string } {
  const motivo = typeof body["motivo"] === "string" ? body["motivo"].trim() : "";
  if (!motivo) return jsonError("El motivo es obligatorio.", 422);
  if (body["confirmo_id"] !== tenantId) {
    return jsonError("Escribí el ID del comercio para confirmar.", 422);
  }
  return { motivo };
}

export async function leerJson(request: Request): Promise<Record<string, unknown> | Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("El cuerpo no es JSON válido.", 422);
  }
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return jsonError("El cuerpo no es JSON válido.", 422);
  }
  return body as Record<string, unknown>;
}
