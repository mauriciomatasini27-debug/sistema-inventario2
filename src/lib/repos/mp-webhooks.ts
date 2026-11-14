import { mpWebhookEvents } from "../../db/schema.js";
import { getSharedDbPlataforma, getTenantDb } from "../db.js";
import { leerVarEntorno } from "../env.js";
import { BaseNoDisponible, dbVivaTenant, type TenantDb } from "../server-db.js";
import { conTenant, esModoShared } from "../tenant-mode.js";
import { tenantIdDePreapproval } from "./planes.js";

// P0-5: reclamo durable del webhook de Mercado Pago. DB primero vía
// dbVivaTenant(); solo en single sin base usa el Set en memoria. En multi sin
// base dbVivaTenant lanza BaseNoDisponible y se propaga (la ruta responde 503).
// P1-73 shared: resuelve tenant desde preapproval antes de abrir DB; sin mapa
// usa getSharedDbPlataforma (tenant_id null), no exige conTenant en la ruta.
const vistos = new Set<string>();

function aBaseNoDisponible(e: unknown): BaseNoDisponible {
  return e instanceof BaseNoDisponible ? e : new BaseNoDisponible();
}

function propagarSiMulti(e: unknown): void {
  if (leerVarEntorno("TENANT_MODE") === "multi") throw aBaseNoDisponible(e);
}

function esChoqueDeClave(e: unknown): boolean {
  let cur: unknown = e;
  for (let i = 0; i < 5 && cur; i++) {
    if (typeof (cur as { code?: unknown }).code === "string" && (cur as { code: string }).code === "23505") return true;
    const msg = cur instanceof Error ? cur.message : String(cur);
    if (msg.includes("mp_webhook_events_pkey")) return true;
    cur = (cur as { cause?: unknown }).cause;
  }
  return false;
}

export function olvidarEventosMpEnMemoria(): void {
  vistos.clear();
}

async function reclamarEventoMpEnDb(
  db: TenantDb,
  clave: string,
  preapprovalId: string,
  estado: string,
  tenantId?: string,
): Promise<boolean> {
  try {
    await db.insert(mpWebhookEvents).values({
      clave,
      preapprovalId,
      estado,
      ...(tenantId ? { tenantId } : {}),
    });
    vistos.add(clave);
    return true;
  } catch (e) {
    if (esChoqueDeClave(e)) {
      vistos.add(clave);
      return false;
    }
    propagarSiMulti(e);
    if (vistos.has(clave)) return false;
    vistos.add(clave);
    return true;
  }
}

export async function reclamarEventoMp(clave: string, preapprovalId: string, estado: string): Promise<boolean> {
  const tenantId = tenantIdDePreapproval(preapprovalId);

  if (esModoShared() && process.env.TENANT_DATABASE_URL) {
    if (tenantId) {
      return conTenant(tenantId, () =>
        reclamarEventoMpEnDb(getTenantDb(tenantId), clave, preapprovalId, estado, tenantId),
      );
    }
    return reclamarEventoMpEnDb(getSharedDbPlataforma(), clave, preapprovalId, estado);
  }

  const db = dbVivaTenant();
  if (!db) {
    if (vistos.has(clave)) return false;
    vistos.add(clave);
    return true;
  }
  return reclamarEventoMpEnDb(db, clave, preapprovalId, estado, tenantId);
}