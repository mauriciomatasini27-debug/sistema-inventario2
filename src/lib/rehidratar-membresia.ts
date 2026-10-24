import { and, eq } from "drizzle-orm";
import { memberships, tenants } from "../db/schema.js";
import { getControlDb } from "./db.js";
import { control } from "./store.js";

// Fila que devuelve la base de control. La memoria del proceso no sobrevive
// a un reinicio, y el panel autoriza contra esa memoria.
export interface FilaMembresiaDurable {
  id: string;
  tenantId: string;
  googleSub: string;
  rol: "dueno" | "empleado";
  permisos: string[];
  puedeUsarBot: boolean;
  nombreComercio: string;
  slug: string;
  estadoTenant: string;
  plan: string;
  moneda: string;
  ownerGoogleSub: string | null;
  esDemo: boolean;
  requestKey: string | null;
  trialHasta: Date | null;
}

function comerciosActivos(googleSub: string): string[] {
  const ids = new Set<string>();
  for (const m of control.memberships.values()) {
    if (m.googleSub === googleSub && m.estado === "activo" && control.tenants.has(m.tenantId)) {
      ids.add(m.tenantId);
    }
  }
  return [...ids];
}

function volcar(filas: readonly FilaMembresiaDurable[]): void {
  for (const f of filas) {
    if (!control.tenants.has(f.tenantId)) {
      control.tenants.set(f.tenantId, {
        id: f.tenantId,
        nombreComercio: f.nombreComercio,
        slug: f.slug,
        estado: f.estadoTenant,
        plan: f.plan,
        moneda: f.moneda,
        ownerGoogleSub: f.ownerGoogleSub ?? f.googleSub,
        esDemo: f.esDemo,
        ...(f.requestKey ? { requestKey: f.requestKey } : {}),
        ...(f.trialHasta ? { trialHasta: f.trialHasta.toISOString() } : {}),
      });
    }
    if (!control.memberships.has(f.id)) {
      control.memberships.set(f.id, {
        id: f.id,
        tenantId: f.tenantId,
        googleSub: f.googleSub,
        rol: f.rol,
        permisos: f.permisos,
        estado: "activo",
        puedeUsarBot: f.puedeUsarBot,
      });
    }
  }
}

// Una sola membership activa puede completar una sesión que nació sin tenant.
// Con dos comercios no elegimos: la sesión tiene que traer el tenant.
function completarTenantDeSesion(googleSub: string): void {
  const ids = comerciosActivos(googleSub);
  if (ids.length !== 1) return;
  const tenantId = ids[0]!;
  for (const s of control.sessions.values()) {
    if (s.googleSub !== googleSub || s.revocadaAt) continue;
    if (s.tenantId && control.tenants.has(s.tenantId)) continue;
    s.tenantId = tenantId;
  }
}

async function leerMembresiasActivas(googleSub: string): Promise<FilaMembresiaDurable[] | null> {
  try {
    const db = getControlDb();
    const filas = await db
      .select({
        id: memberships.id,
        tenantId: memberships.tenantId,
        googleSub: memberships.googleSub,
        rol: memberships.rol,
        permisos: memberships.permisos,
        puedeUsarBot: memberships.puedeUsarBot,
        nombreComercio: tenants.nombreComercio,
        slug: tenants.slug,
        estadoTenant: tenants.estado,
        plan: tenants.plan,
        moneda: tenants.moneda,
        ownerGoogleSub: tenants.ownerGoogleSub,
        esDemo: tenants.esDemo,
        requestKey: tenants.requestKey,
        trialHasta: tenants.trialHasta,
      })
      .from(memberships)
      .innerJoin(tenants, eq(tenants.id, memberships.tenantId))
      .where(and(eq(memberships.googleSub, googleSub), eq(memberships.estado, "activo")));
    const listas: FilaMembresiaDurable[] = [];
    for (const f of filas) {
      if (!f.tenantId || !f.googleSub) continue;
      if (f.rol !== "dueno" && f.rol !== "empleado") continue;
      listas.push({
        id: f.id,
        tenantId: f.tenantId,
        googleSub: f.googleSub,
        rol: f.rol,
        permisos: Array.isArray(f.permisos) ? f.permisos : [],
        puedeUsarBot: f.puedeUsarBot,
        nombreComercio: f.nombreComercio,
        slug: f.slug,
        estadoTenant: f.estadoTenant,
        plan: f.plan,
        moneda: f.moneda,
        ownerGoogleSub: f.ownerGoogleSub,
        esDemo: f.esDemo,
        requestKey: f.requestKey,
        trialHasta: f.trialHasta,
      });
    }
    return listas;
  } catch {
    return null;
  }
}

export async function rehidratarMembresias(
  googleSub: string,
  leer: (googleSub: string) => Promise<FilaMembresiaDurable[] | null> = leerMembresiasActivas,
): Promise<void> {
  if (comerciosActivos(googleSub).length > 0) return;
  const filas = await leer(googleSub);
  if (!filas) return;
  volcar(filas);
  completarTenantDeSesion(googleSub);
}
