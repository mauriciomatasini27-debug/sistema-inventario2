// Núcleo puro B1.4 resolución del comercio (PRD Bot B1.4/B1.5/B1.10).
// Cada mensaje entrante se resuelve número → identidad verificada →
// usuario + comercio → membership activa → tenant. Sin IO: el adaptador
// (ruta) arma los snapshots desde control/Drizzle. Nunca se toma un
// identificador de comercio del contenido del mensaje.

export interface IdentidadWA {
  readonly numeroE164: string;
  readonly googleSub: string;
  readonly tenantId: string;
  readonly estado: "pendiente" | "verificado" | "revocado";
}

export interface MembershipWA {
  readonly tenantId: string;
  readonly googleSub: string;
  readonly rol: "dueno" | "empleado";
  readonly estado: "activo" | "revocado";
}

export interface TenantWA {
  readonly id: string;
  readonly estado: "pendiente" | "activo" | "suspendido" | "baja";
}

export type Resolucion =
  | {
      readonly ok: true;
      readonly tenantId: string;
      readonly googleSub: string;
      readonly rol: "dueno" | "empleado";
      /** B1.10: suspendido por mora permite consultas pero no envío de pedidos. */
      readonly soloLectura: boolean;
    }
  | { readonly ok: false; readonly motivo: "no_vinculado" | "revocado" | "sin_membership" | "tenant_inactivo" };

export const RESPUESTA_NO_VINCULADO =
  "Este numero no esta vinculado a ningun comercio. Vinculalo desde la web." as const;

export function resolver_comercio(opts: {
  remitenteE164: string;
  identidades: ReadonlyArray<IdentidadWA>;
  memberships: ReadonlyArray<MembershipWA>;
  tenants: ReadonlyArray<TenantWA>;
}): Resolucion {
  const id = opts.identidades.find((i) => i.numeroE164 === opts.remitenteE164);
  // B1.5: no vinculado recibe solo mensaje genérico, sin datos de stock.
  if (!id || id.estado === "pendiente") return { ok: false, motivo: "no_vinculado" };
  if (id.estado === "revocado") return { ok: false, motivo: "revocado" };
  const m = opts.memberships.find(
    (x) => x.tenantId === id.tenantId && x.googleSub === id.googleSub && x.estado === "activo",
  );
  // Desactivar usuario revoca acceso al bot (B1.8).
  if (!m) return { ok: false, motivo: "sin_membership" };
  const t = opts.tenants.find((x) => x.id === id.tenantId);
  if (!t || t.estado === "pendiente" || t.estado === "baja") return { ok: false, motivo: "tenant_inactivo" };
  return { ok: true, tenantId: id.tenantId, googleSub: id.googleSub, rol: m.rol, soloLectura: t.estado === "suspendido" };
}
