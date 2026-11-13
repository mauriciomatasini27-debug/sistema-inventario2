import { and, eq, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { esModoShared, tenantActual } from "./tenant-mode.js";

// ADR-0116 C3: solo shared filtra por fila. multi tiene DB propia; single es slice0.

export function tenantIdShared(): string | null {
  if (!esModoShared()) return null;
  const t = tenantActual();
  if (!t) throw new Error("Falta tenant");
  return t;
}

/** Condición WHERE con tenant_id cuando corre shared. Si no, devuelve `extra` tal cual. */
export function dondeTenant(col: AnyPgColumn, extra?: SQL): SQL | undefined {
  const tid = tenantIdShared();
  if (!tid) return extra;
  return extra ? and(eq(col, tid), extra) : eq(col, tid);
}
