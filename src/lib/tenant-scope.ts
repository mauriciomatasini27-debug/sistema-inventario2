import { and, eq, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { esModoShared, tenantActual, tenantPorDefecto } from "./tenant-mode.js";

const UUID_TENANT = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// ADR-0116 C3: solo shared filtra por fila. multi tiene DB propia; single es slice0.

export function tenantIdShared(): string | null {
  if (!esModoShared()) return null;
  const t = tenantActual();
  if (!t) throw new Error("Falta tenant");
  return t;
}

// ADR-0116 0045: tenant_id obligatorio en DB; shared exige contexto, single usa uuid en DEFAULT_TENANT_ID.
export function tenantIdAlSellar(): string | undefined {
  if (esModoShared()) {
    const t = tenantActual();
    if (!t) throw new Error("Falta tenant");
    return t;
  }
  const ctx = tenantActual();
  if (ctx && UUID_TENANT.test(ctx)) return ctx;
  const porDefecto = tenantPorDefecto();
  if (UUID_TENANT.test(porDefecto)) return porDefecto;
  return undefined;
}

/** INSERT en tablas con tenant_id NOT NULL. single exige DEFAULT_TENANT_ID uuid. */
export function filaConTenant<T extends object>(fila: T): T & { tenantId: string } {
  const tid = tenantIdAlSellar();
  if (!tid) throw new Error("Falta tenant_id para persistir");
  return { ...fila, tenantId: tid };
}

/** Condición WHERE con tenant_id cuando corre shared. Si no, devuelve `extra` tal cual. */
export function dondeTenant(col: AnyPgColumn, extra?: SQL): SQL | undefined {
  const tid = tenantIdShared();
  if (!tid) return extra;
  return extra ? and(eq(col, tid), extra) : eq(col, tid);
}
