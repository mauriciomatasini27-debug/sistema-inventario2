import { mpWebhookEvents } from "../../db/schema.js";
import { leerVarEntorno } from "../env.js";
import { BaseNoDisponible, dbVivaTenant } from "../server-db.js";

// P0-5: reclamo durable del webhook de Mercado Pago. DB primero vía
// dbVivaTenant(); solo en single sin base usa el Set en memoria. En multi sin
// base dbVivaTenant lanza BaseNoDisponible y se propaga (la ruta responde 503).
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

export async function reclamarEventoMp(clave: string, preapprovalId: string, estado: string): Promise<boolean> {
  const db = dbVivaTenant();
  if (!db) {
    if (vistos.has(clave)) return false;
    vistos.add(clave);
    return true;
  }
  try {
    await db.insert(mpWebhookEvents).values({ clave, preapprovalId, estado });
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
