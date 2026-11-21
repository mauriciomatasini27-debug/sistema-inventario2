import { control } from "../../lib/store.js";
import { persistirInvitacionEstado, persistirMembership, persistirOwnerTenant } from "../../lib/control-db.js";
import { PERMISOS_EMPLEADO_DEFAULT } from "../auth/modelo.js";
import { esOwnerPendiente } from "./alta-admin.js";
import type { ControlInvitation } from "../../lib/store.js";

export async function aplicarAceptacionInvitacion(inv: ControlInvitation, googleSub: string): Promise<{
  membershipId: string;
  tenantId: string;
  rol: "dueno" | "empleado";
}> {
  inv.estado = "aceptada";
  inv.aceptadaPor = googleSub;
  const id = crypto.randomUUID();
  const rol = inv.rol;
  const permisos = inv.permisos.length > 0 ? [...inv.permisos] : rol === "empleado" ? [...PERMISOS_EMPLEADO_DEFAULT] : [];
  control.memberships.set(id, {
    id,
    tenantId: inv.tenantId,
    googleSub,
    rol,
    permisos,
    estado: "activo",
  });
  const tenant = control.tenants.get(inv.tenantId);
  if (tenant && rol === "dueno" && esOwnerPendiente(tenant.ownerGoogleSub)) {
    tenant.ownerGoogleSub = googleSub;
    await persistirOwnerTenant(tenant.id, googleSub);
  }
  await persistirInvitacionEstado(inv.tokenHash, "aceptada", googleSub);
  await persistirMembership({
    id,
    tenantId: inv.tenantId,
    googleSub,
    rol,
    permisos,
    estado: "activo",
  });
  control.events.push({ tenantId: inv.tenantId, tipo: "invitacion_aceptada", actor: googleSub });
  return { membershipId: id, tenantId: inv.tenantId, rol };
}
