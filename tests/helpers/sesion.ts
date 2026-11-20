import { control } from "../../src/lib/store.js";
import { crearSesion } from "../../src/modules/auth/sesiones.js";

// ON12: armado común de sesión en el store para tests de rutas de onboarding.
export function sesionEnStore(sub: string, tenantId: string | null = null, ahora = new Date()): string {
  const c = crearSesion({ googleSub: sub, tenantId, ahora });
  control.sessions.set(c.registro.idHash, {
    idHash: c.registro.idHash,
    googleSub: sub,
    tenantId,
    expiraAt: c.registro.expiraAt,
    expiraAbsoluta: c.registro.expiraAbsoluta,
    lastSeenAt: ahora.toISOString(),
    reauthAt: ahora.toISOString(),
  });
  return c.idPlano;
}
