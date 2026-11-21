// TB-165: precedencia del destino post-login en un solo lugar testeable.
// next válido → allowlist admin → rol/estado. Dueño y Empleado entran a /panel;
// el `recorrido` distingue sus orientaciones sin cambiar la puerta de entrada.

export type RolPostLogin = "dueno" | "empleado" | null;
export type RecorridoPostLogin = "dueno" | "empleado" | "admin" | "alta";

export interface DatosDestinoLogin {
  next: string | null;
  esAdmin: boolean;
  tenantId: string | null;
  rol: RolPostLogin;
}

export interface DestinoLogin {
  url: string;
  recorrido: RecorridoPostLogin;
}

const NEXT_PERMITIDOS: readonly string[] = ["/panel", "/admin", "/"];

export function destinoLogin(datos: DatosDestinoLogin): DestinoLogin {
  const nextOk = datos.next && NEXT_PERMITIDOS.includes(datos.next) ? datos.next : null;
  if (nextOk) {
    // P1-70: next=/panel sin comercio deriva al alta; se decide después de
    // validar next, no antes, para que la precedencia sea explícita.
    if (nextOk === "/panel" && !datos.tenantId) {
      return { url: "/?alta=pendiente", recorrido: "alta" };
    }
    const recorrido: RecorridoPostLogin =
      nextOk === "/admin" ? "admin"
      : !datos.tenantId ? "alta"
      : datos.rol === "empleado" ? "empleado"
      : "dueno";
    return { url: nextOk, recorrido };
  }
  if (datos.esAdmin) return { url: "/admin", recorrido: "admin" };
  if (datos.tenantId) {
    return {
      url: "/panel",
      recorrido: datos.rol === "empleado" ? "empleado" : "dueno",
    };
  }
  return { url: "/?alta=pendiente", recorrido: "alta" };
}
