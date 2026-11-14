import { and, eq, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { createHash } from "node:crypto";
import { esModoShared, tenantActual, tenantPorDefecto } from "./tenant-mode.js";
import { leerVarEntorno } from "./env.js";

export const UUID_TENANT = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** P1-76: filas de plataforma (MP sin preapproval) en shared; NOT NULL en mp_webhook_events. */
export const TENANT_PLATAFORMA_SHARED = "00000000-0000-4000-8000-00000000ff01";

// ADR-0116 C3: solo shared filtra por fila. multi tiene DB propia; single es slice0.

export function tenantIdShared(): string | null {
  if (!esModoShared()) return null;
  const t = tenantActual();
  if (!t) throw new Error("Falta tenant");
  return t;
}

/** ADR-0116: uuid estable por slug en multi (filas NOT NULL; no reemplaza id de tenants en control). */
export function tenantUuidMulti(tenantSlug: string): string {
  return uuidMultiPorSlug(tenantSlug);
}

function uuidMultiPorSlug(tenantSlug: string): string {
  const h = createHash("sha256").update(`adr-0116-multi-row:${tenantSlug}`).digest();
  const b = Uint8Array.from(h.subarray(0, 16));
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const hex = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// ADR-0116 0045: tenant_id obligatorio en DB; shared exige contexto; multi usa uuid por slug; single DEFAULT_TENANT_ID uuid.
export function tenantIdAlSellar(): string | undefined {
  if (esModoShared()) {
    const t = tenantActual();
    if (!t) throw new Error("Falta tenant");
    return t;
  }
  if (leerVarEntorno("TENANT_MODE") === "multi") {
    const t = tenantActual();
    if (!t) return undefined;
    if (UUID_TENANT.test(t)) return t;
    return tenantUuidMulti(t);
  }
  const ctx = tenantActual();
  if (ctx && UUID_TENANT.test(ctx)) return ctx;
  const porDefecto = tenantPorDefecto();
  if (UUID_TENANT.test(porDefecto)) return porDefecto;
  return undefined;
}

/** INSERT en tablas con tenant_id NOT NULL. single exige DEFAULT_TENANT_ID uuid. */
export function filaConTenant<T extends object>(fila: T): T & { tenantId: string } {
  const previo = (fila as { tenantId?: string }).tenantId;
  if (previo && UUID_TENANT.test(previo)) return fila as T & { tenantId: string };
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
