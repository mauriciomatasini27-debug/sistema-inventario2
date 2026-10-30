// BIEN-S2/BIEN-S3 (ADR-0115): diálogo de bienvenida en /panel, una vez por navegador.
// La marca vive en localStorage; no reemplaza ON8 en servidor (saltar empleado sigue en POST checklist).

export function clave_bienvenida_panel(tenantId: string, googleSub: string): string {
  return `bienvenida:panel:${tenantId}:${googleSub}`;
}

export function ya_vio_bienvenida_panel(
  storage: Pick<Storage, "getItem">,
  tenantId: string,
  googleSub: string,
): boolean {
  if (!tenantId || !googleSub) return true;
  return storage.getItem(clave_bienvenida_panel(tenantId, googleSub)) === "1";
}

export function marcar_bienvenida_panel(
  storage: Pick<Storage, "setItem">,
  tenantId: string,
  googleSub: string,
): void {
  storage.setItem(clave_bienvenida_panel(tenantId, googleSub), "1");
}

export function debe_mostrar_bienvenida_panel(params: {
  esDueno: boolean;
  tenantId: string;
  googleSub: string;
  yaVio: boolean;
}): boolean {
  if (!params.esDueno) return false;
  if (!params.tenantId || !params.googleSub) return false;
  if (params.yaVio) return false;
  return true;
}

/** Campos que ADR-0115 prohíbe pedir en el diálogo (tests de regresión). */
export const CAMPOS_PROHIBIDOS_BIENVENIDA_PANEL = [
  "direccion",
  "cuit",
  "moneda",
  "cantidad",
  "cantidad-empleados",
] as const;
