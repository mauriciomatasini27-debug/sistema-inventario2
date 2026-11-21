// TB-165 [tenant]: el tenant del cuestionario lo fija la sesión, nunca el
// query. El parámetro sólo es un atajo válido cuando coincide con el autorizado.
export type ResultadoTenantCuestionario =
  | { ok: true; tenantId: string }
  | { ok: false };

export function tenantDelCuestionario(
  tenantAutorizado: string,
  tenantSolicitado: string | null,
): ResultadoTenantCuestionario {
  if (!tenantAutorizado) return { ok: false };
  if (tenantSolicitado && tenantSolicitado !== tenantAutorizado) return { ok: false };
  return { ok: true, tenantId: tenantAutorizado };
}
