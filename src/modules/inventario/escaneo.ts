// Escaneo e identificación del catálogo (CAT-S2, PRD-CAT-01, F2).
// Núcleo puro: sin IO, sin Drizzle, sin store. El repo y las rutas llaman
// estas funciones con valores ya parseados en el borde.

export const METODOS_IDENTIFICACION = ["hid", "camara", "texto", "foto"] as const;

export type MetodoIdentificacion = (typeof METODOS_IDENTIFICACION)[number];

export function siguienteMetodo(actual: MetodoIdentificacion | null): MetodoIdentificacion | null {
  if (actual === null) return METODOS_IDENTIFICACION[0] ?? null;
  const i = METODOS_IDENTIFICACION.indexOf(actual);
  return METODOS_IDENTIFICACION[i + 1] ?? null;
}

export function normalizarCodigoEscaneado(s: string): string {
  return s.trim().toUpperCase();
}

export type RolAlta = "dueno" | "empleado";

export type EstadoAlta = "activo" | "pendiente_revision";

export function estadoAltaDesdeRol(rol: RolAlta, permisos: readonly string[]): EstadoAlta {
  if (rol === "dueno") return "activo";
  return permisos.includes("crear_productos") ? "activo" : "pendiente_revision";
}
