import { and, eq, type SQL } from "drizzle-orm";
import { ticketCounters } from "../../db/schema.js";
import { tenantIdAlSellar } from "../tenant-scope.js";

export function whereContadorTicket(serie: string): SQL {
  const tid = tenantIdAlSellar();
  if (tid) return and(eq(ticketCounters.id, serie), eq(ticketCounters.tenantId, tid))!;
  return eq(ticketCounters.id, serie);
}

export function filaContadorTicket(serie: string, ultimo = 0) {
  const tid = tenantIdAlSellar();
  if (!tid) throw new Error("Falta tenant para ticket_counters");
  return { id: serie, ultimo, tenantId: tid };
}