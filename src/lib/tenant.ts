import { AsyncLocalStorage } from "node:async_hooks";
import { and, eq, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { createHash } from "node:crypto";
import { leerVarEntorno } from "./env.js";

export type ModoTenant = {
  multi: boolean;
  shared: boolean;
  tenantPorDefecto: string;
};

function leerModo(env: NodeJS.ProcessEnv = process.env): ModoTenant {
  const m = leerVarEntorno("TENANT_MODE", env);
  return {
    multi: m === "multi",
    shared: m === "shared",
    tenantPorDefecto: leerVarEntorno("DEFAULT_TENANT_ID", env) || "slice0",
  };
}

const almacenamientoTenant = new AsyncLocalStorage<string>();
const almacenamientoModo = new AsyncLocalStorage<ModoTenant>();

function modoActual(): ModoTenant {
  return almacenamientoModo.getStore() ?? leerModo(process.env);
}

export function conModoTenant<T>(modo: ModoTenant, fn: () => T): T {
  return almacenamientoModo.run(modo, fn);
}

export function esModoMulti(): boolean {
  return modoActual().multi;
}

export function esModoShared(): boolean {
  return modoActual().shared;
}

export function esModoAisladoPorTenant(): boolean {
  const modo = modoActual();
  return modo.multi || modo.shared;
}

export function tenantPorDefecto(): string {
  return modoActual().tenantPorDefecto;
}

export function conTenant<T>(tenantId: string, fn: () => T): T {
  return almacenamientoTenant.run(tenantId, fn);
}

export function tenantActual(): string | undefined {
  return almacenamientoTenant.getStore();
}

export const UUID_TENANT = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** P1-76: filas de plataforma (MP sin preapproval) en shared; NOT NULL en mp_webhook_events. */
export const TENANT_PLATAFORMA_SHARED = "00000000-0000-4000-8000-00000000ff01";

export function tenantIdShared(): string | null {
  if (!modoActual().shared) return null;
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
  const modo = modoActual();
  if (modo.shared) {
    const t = tenantActual();
    if (!t) throw new Error("Falta tenant");
    return t;
  }
  if (modo.multi) {
    const t = tenantActual();
    if (!t) return undefined;
    if (UUID_TENANT.test(t)) return t;
    return tenantUuidMulti(t);
  }
  const ctx = tenantActual();
  if (ctx && UUID_TENANT.test(ctx)) return ctx;
  const porDefecto = modo.tenantPorDefecto;
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

// P10-90 (0053): tablas con tenant_id nullable (servicios y pagos). Escribe el
// tenant cuando se puede determinar; en shared sin contexto falla como el resto.
export function tenantIdFila(): string | null {
  return tenantIdAlSellar() ?? null;
}

// P10-90 (0053): como dondeTenant, para repos que reciben el tenant explícito
// (jobs de Gmail) en vez de tomarlo del contexto.
export function dondeTenantExplicito(col: AnyPgColumn, tenantId: string, extra?: SQL): SQL | undefined {
  if (!modoActual().shared) return extra;
  return extra ? and(eq(col, tenantId), extra) : eq(col, tenantId);
}

/** Condición WHERE con tenant_id cuando corre shared. Si no, devuelve `extra` tal cual. */
export function dondeTenant(col: AnyPgColumn, extra?: SQL): SQL | undefined {
  const tid = tenantIdShared();
  if (!tid) return extra;
  return extra ? and(eq(col, tid), extra) : eq(col, tid);
}