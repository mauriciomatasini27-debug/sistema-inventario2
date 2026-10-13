import { z } from "zod";
import { PERMISOS_EMPLEADO, permisoEmpleadoSchema } from "../../lib/validation.js";

// Modelos tipados Auth + Onboarding. Núcleo puro: sin IO, sin fechas vivas.
// Los adaptadores (rutas Drizzle) hacen IO y locks.

// Por qué registro Zod y no booleanos sueltos: la lista cerrada hace que un
// permiso nuevo falle el build hasta agregarlo a la matriz (AU4).
export const permisosRegistroSchema = z.object({
  registrar_devoluciones: z.boolean().default(true),
  registrar_retiros_caja: z.boolean().default(false),
  ver_saldos_caja: z.boolean().default(false),
});
export type PermisosRegistro = z.infer<typeof permisosRegistroSchema>;

// Por qué mapeo directo sin default acá: el default (devoluciones true,
// AU4.9) vive en la creación de la membership; acá solo se traduce lo
// guardado para que restringir sea quitar el item de la lista.
export function permisosListaARegistro(lista: readonly string[]): PermisosRegistro {
  const set = new Set(lista);
  return {
    registrar_devoluciones: set.has("registrar_devoluciones"),
    registrar_retiros_caja: set.has("registrar_retiros_caja"),
    ver_saldos_caja: set.has("ver_saldos_caja"),
  };
}

// Permisos por defecto de un empleado nuevo (AU4.9: devoluciones habilitado).
export const PERMISOS_EMPLEADO_DEFAULT: readonly string[] = ["registrar_devoluciones"];

export function permisosRegistroALista(r: PermisosRegistro): string[] {
  return (Object.keys(r) as Array<keyof PermisosRegistro>).filter((k) => r[k]);
}

export type Rol = "dueno" | "empleado";
export type EstadoTenant =
  | "pendiente"
  | "aprovisionando"
  | "activo"
  | "error_aprovisionamiento"
  | "suspendido"
  | "baja";
export type Plan = "demo" | "base" | "plus";

export interface Tenant {
  id: string;
  nombreComercio: string;
  slug: string;
  estado: EstadoTenant;
  plan: Plan;
  moneda: "ARS";
  ownerGoogleSub: string;
  esDemo: boolean;
}

export interface Membership {
  id: string;
  tenantId: string;
  googleSub: string;
  rol: Rol;
  permisos: PermisosRegistro;
  estado: "activo" | "revocado";
}

export interface Invitation {
  tokenHash: string;
  tenantId: string;
  email: string;
  rol: Rol;
  permisos: PermisosRegistro;
  estado: "pendiente" | "aceptada" | "vencida" | "cancelada";
  expiraAt: string;
}

export interface Session {
  idHash: string;
  googleSub: string;
  tenantId: string | null;
  expiraAt: string;
}

// Por qué reexportar la lista: un solo origen para Zod, núcleo y rutas.
export { PERMISOS_EMPLEADO, permisoEmpleadoSchema };
