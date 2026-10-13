import { eq } from "drizzle-orm";
import { sales, tickets } from "../../db/schema.js";
import { getTenantDb } from "../../lib/db.js";
import { store } from "../../lib/store.js";

// PERS-S4: lookup de venta DB-first con fallback a memoria. La DB manda cuando
// la venta nació por la vía DB (PERS-S1); la memoria cubre ventas pre-cutover
// y entornos sin DB. Ambas mandan en unión: existe si está en alguna.
export interface VentaResumen {
  readonly sale_id: string;
  readonly ticket_definitivo: string | null;
  readonly ticket_provisorio: string;
  readonly total_centavos: string;
  readonly medio: string;
}

export async function buscarVentaPorId(saleId: string): Promise<VentaResumen | null> {
  try {
    const db = getTenantDb();
    const filas = await db
      .select({
        saleId: sales.id,
        definitivo: tickets.definitivo,
        provisorio: tickets.provisorio,
        total: sales.totalCentavos,
        medio: sales.medio,
      })
      .from(tickets)
      .innerJoin(sales, eq(tickets.saleId, sales.id))
      .where(eq(sales.id, saleId))
      .limit(1);
    const f = filas[0];
    if (f) {
      return {
        sale_id: f.saleId,
        ticket_definitivo: f.definitivo,
        ticket_provisorio: f.provisorio,
        total_centavos: BigInt(f.total).toString(),
        medio: f.medio,
      };
    }
  } catch {
    // Sin DB o sale_id no-uuid: cae a memoria.
  }
  for (const t of store.idempotency.values()) {
    if (t.sale_id === saleId) {
      return {
        sale_id: t.sale_id,
        ticket_definitivo: t.ticket_definitivo,
        ticket_provisorio: t.ticket_provisorio,
        total_centavos: t.total_centavos,
        medio: t.medio,
      };
    }
  }
  return null;
}
