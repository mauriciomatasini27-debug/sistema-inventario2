// WA-ESTADOS-WEBHOOK [plataforma]: persiste el salto que informa el webhook de estados de Meta sobre una fila de whatsapp_usage.
import { and, eq } from "drizzle-orm";
import { whatsappUsage } from "../../db/schema-whatsapp.js";
import { dbVivaTenant, type TenantDb } from "../server-db.js";
import { ganaEstado, type EstadoEnvio, type EstadoRecibido } from "../../modules/whatsapp/estados.js";

export type ResultadoEstado = "aplicado" | "descartado" | "sin_fila";

export interface EstadoConTenant extends EstadoRecibido {
  readonly tenantId: string;
}

function marcas(e: EstadoRecibido): Partial<typeof whatsappUsage.$inferInsert> {
  const cuando = new Date(e.timestampMs);
  if (e.estado === "entregado") return { entregadoEn: cuando };
  if (e.estado === "leido") return { entregadoEn: cuando, leidoEn: cuando };
  if (e.estado === "fallido") return { falloCodigo: e.codigoError, falloMotivo: e.motivoError };
  return {};
}

// WA-ESTADOS-WEBHOOK [plataforma]: compare-and-swap sobre el estado actual en vez de un update ciego, así dos webhooks concurrentes no se pisan ni hacen retroceder la fila.
function actualizar(db: TenantDb, e: EstadoRecibido, actual: string): Promise<ResultadoEstado> {
  return db.transaction(async (tx): Promise<ResultadoEstado> => {
    const filas = await tx
      .update(whatsappUsage)
      .set({ estado: e.estado, ...marcas(e) })
      .where(and(eq(whatsappUsage.wamid, e.wamid), eq(whatsappUsage.estado, actual)))
      .returning({ wamid: whatsappUsage.wamid });
    return filas.length > 0 ? "aplicado" : "descartado";
  });
}

// WA-ESTADOS-WEBHOOK [plataforma]: si el wamid no está no se crea la fila: el estado es de un mensaje que este comercio no registró.
export async function aplicarEstadoEnvio(e: EstadoConTenant): Promise<ResultadoEstado> {
  const db = dbVivaTenant(e.tenantId);
  if (!db) return "sin_fila";
  const [fila] = await db
    .select({ estado: whatsappUsage.estado })
    .from(whatsappUsage)
    .where(eq(whatsappUsage.wamid, e.wamid))
    .limit(1);
  if (!fila) return "sin_fila";
  if (!ganaEstado(fila.estado as EstadoEnvio | null, e.estado)) return "descartado";
  return actualizar(db, e, fila.estado);
}
