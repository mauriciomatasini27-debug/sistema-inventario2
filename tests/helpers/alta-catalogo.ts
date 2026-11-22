import { control, resetStore } from "../../src/lib/store.js";
import { PERMISOS_EMPLEADO_DEFAULT } from "../../src/modules/auth/modelo.js";
import { sesionEnStore } from "./sesion.js";

// Fixture compartida de las rutas de Alta de catálogo: modo single sin base,
// tenant + membership y sesión del store. No se exporta fuera de tests/.
export function modoSingleSinDb(): void {
  delete process.env.TENANT_MODE;
  delete process.env.TENANT_DATABASE_URL;
  delete process.env["TENANT_DATABASE_URL_tenant-a"];
  delete process.env["TENANT_DATABASE_URL_tenant-b"];
}

export function reiniciarAltaCatalogo(): void {
  modoSingleSinDb();
  resetStore();
}

export function tenantConMiembro(
  tenantId: string,
  sub: string,
  rol: "dueno" | "empleado",
  permisos: string[] = [],
  rubro?: string,
): void {
  control.tenants.set(tenantId, {
    id: tenantId,
    nombreComercio: "Kiosco Alta",
    slug: "kiosco-alta",
    estado: "activo",
    plan: "base",
    moneda: "ARS",
    ownerGoogleSub: "dueno-s2",
    esDemo: false,
    ...(rubro === undefined ? {} : { rubro }),
  });
  const mid = `m-${tenantId}-${sub}`;
  control.memberships.set(mid, { id: mid, tenantId, googleSub: sub, rol, permisos, estado: "activo" });
}

export function sesionDe(sub: string, tenantId: string | null): string {
  return sesionEnStore(sub, tenantId);
}

export function empleadoConSesion(
  tenantId: string,
  sub: string,
  permisos: string[] = [...PERMISOS_EMPLEADO_DEFAULT],
  rubro?: string,
): string {
  tenantConMiembro(tenantId, sub, "empleado", permisos, rubro);
  return sesionDe(sub, tenantId);
}
