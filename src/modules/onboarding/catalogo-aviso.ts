export const CLAVE_AVISO_CATALOGO = "stock:aviso-catalogo";

export function claveAvisoCatalogo(tenantId: string | null | undefined): string | null {
  const t = typeof tenantId === "string" ? tenantId.trim() : "";
  return t === "" ? null : `${CLAVE_AVISO_CATALOGO}:${t}`;
}

export function avisoCatalogoDescartado(
  storage: Pick<Storage, "getItem">,
  tenantId: string | null | undefined,
): boolean {
  const clave = claveAvisoCatalogo(tenantId);
  return clave !== null && storage.getItem(clave) === "1";
}

export function descartarAvisoCatalogo(
  storage: Pick<Storage, "setItem">,
  tenantId: string | null | undefined,
): void {
  const clave = claveAvisoCatalogo(tenantId);
  if (clave === null) return;
  storage.setItem(clave, "1");
}
