import { eq, gte, sql } from "drizzle-orm";
import { sales, ticketLines } from "../../db/schema.js";
import type { TenantDb } from "../server-db.js";
import { listarTodasLasLineasTicket } from "../ticket-memoria.js";

// Ventas por producto compartidas por las cargas progresivas de /panel/stock
// (STOCK-S4 stock inicial y STOCK-S9 precio): misma ventana y mismo orden.

export function subconsultaVentas30d(db: TenantDb, desde: Date) {
  return db
    .select({
      productId: ticketLines.productId,
      vendidas: sql<number>`sum(${ticketLines.qty})`.mapWith(Number).as("vendidas"),
    })
    .from(ticketLines)
    .innerJoin(sales, eq(ticketLines.saleId, sales.id))
    .where(gte(sales.createdAt, desde))
    .groupBy(ticketLines.productId)
    .as("ventas_30d");
}

export function ventasPorProductoMemoria(): Map<string, number> {
  const vendidas = new Map<string, number>();
  // En memoria no hay fecha de venta confiable: se cuentan todas las líneas.
  for (const linea of listarTodasLasLineasTicket()) {
    vendidas.set(linea.product_id, (vendidas.get(linea.product_id) ?? 0) + linea.qty);
  }
  return vendidas;
}
