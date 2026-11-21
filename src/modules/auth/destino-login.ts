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
    // P1-70 [tenant]: next=/panel sin comercio deriva al alta tras validar next.
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
