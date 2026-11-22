import { eq } from "drizzle-orm";
import { notificationDeliveries, notificationEvents } from "../../db/schema-email.js";
import type { ReclamadorEntrega } from "../../modules/whatsapp/entregas.js";
import { dbVivaTenant, type TenantDb } from "../server-db.js";
import { dondeTenant, filaConTenant } from "../tenant-scope.js";
import { crearAlmacenNotificationDeliveries } from "./_almacen.js";

export interface DatosEntrega {
  readonly tenantId: string;
  readonly idempotencyKey: string;
  readonly canal: "whatsapp" | "email";
  readonly googleSub: string;
  readonly referencia: string;
}

function claveMemoria(datos: DatosEntrega): string {
  return `${datos.tenantId}\u0000${datos.idempotencyKey}`;
}

function dedupeKey(datos: DatosEntrega): string {
  return `entrega:${datos.idempotencyKey}`;
}

// P10-31 [tenant]: notification_deliveries exige un event_id, así que el
// reclamo escribe primero el evento y después la fila única por comercio+clave.
async function reclamarEnDb(db: TenantDb, datos: DatosEntrega): Promise<boolean> {
  const previa = await db
    .select({ id: notificationDeliveries.id })
    .from(notificationDeliveries)
    .where(
      dondeTenant(notificationDeliveries.tenantId, eq(notificationDeliveries.idempotencyKey, datos.idempotencyKey)),
    )
    .limit(1);
  if (previa[0]) return false;
  const claveEvento = dedupeKey(datos);
  return db.transaction(async (tx) => {
    await tx
      .insert(notificationEvents)
      .values(
        filaConTenant({
          tipo: "entrega_notificacion",
          version: 1,
          refTipo: datos.canal,
          refId: datos.referencia,
          payload: {
            idempotencyKey: datos.idempotencyKey,
            canal: datos.canal,
            referencia: datos.referencia,
          },
          dedupeKey: claveEvento,
          estado: "pendiente",
        }),
      )
      .onConflictDoNothing({ target: [notificationEvents.tenantId, notificationEvents.dedupeKey] });
    const eventos = await tx
      .select({ id: notificationEvents.id })
      .from(notificationEvents)
      .where(dondeTenant(notificationEvents.tenantId, eq(notificationEvents.dedupeKey, claveEvento)))
      .limit(1);
    const evento = eventos[0];
    if (!evento) throw new Error("evento de entrega no persistido");
    const insertados = await tx
      .insert(notificationDeliveries)
      .values(
        filaConTenant({
          eventId: evento.id,
          googleSub: datos.googleSub,
          canal: datos.canal,
          idempotencyKey: datos.idempotencyKey,
          estado: "pendiente",
        }),
      )
      .onConflictDoNothing({ target: [notificationDeliveries.tenantId, notificationDeliveries.idempotencyKey] })
      .returning({ id: notificationDeliveries.id });
    return insertados.length > 0;
  });
}

// P10-31 [tenant]: DB primero; en single sin base queda la tienda en memoria
// y en multi sin base dbVivaTenant lanza BaseNoDisponible (la ruta responde 503).
export function reclamadorDb(tenantId: string, googleSub: string, canal: "whatsapp" | "email"): ReclamadorEntrega {
  const datosDe = (clave: string, valor: string): DatosEntrega => ({
    tenantId,
    googleSub,
    canal,
    idempotencyKey: clave,
    referencia: valor,
  });
  return {
    reclamar: async (clave, valor) => {
      const datos = datosDe(clave, valor);
      const almacen = crearAlmacenNotificationDeliveries();
      const claveMemoriaLocal = claveMemoria(datos);
      if (almacen.contiene(claveMemoriaLocal)) return false;
      const db = dbVivaTenant(tenantId);
      if (!db) {
        almacen.guardar(claveMemoriaLocal, datos);
        return true;
      }
      try {
        const gano = await reclamarEnDb(db, datos);
        almacen.guardar(claveMemoriaLocal, datos);
        return gano;
      } catch (e) {
        almacen.anteFalloPersistencia(e);
        almacen.guardar(claveMemoriaLocal, datos);
        return true;
      }
    },
    liberar: async (clave) => {
      const datos = datosDe(clave, "");
      const almacen = crearAlmacenNotificationDeliveries();
      almacen.mapaVivo().delete(claveMemoria(datos));
      let db: TenantDb | null = null;
      try {
        db = dbVivaTenant(tenantId);
      } catch {
        return;
      }
      if (!db) return;
      // P10-31 [tenant]: si no se puede borrar la fila, el reintento se ve
      // como duplicado: mejor no enviar dos veces que perder el claim.
      try {
        await db
          .delete(notificationDeliveries)
          .where(
            dondeTenant(notificationDeliveries.tenantId, eq(notificationDeliveries.idempotencyKey, clave)),
          );
      } catch {
        return;
      }
    },
  };
}
