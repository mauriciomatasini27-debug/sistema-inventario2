import { tenantActual } from "../../src/lib/tenant-mode.js";
import { leerVarEntorno } from "../../src/lib/env.js";
import { tenantUuidMulti } from "../../src/lib/tenant-scope.js";

/** UUID fijo para inserts PG en single con DEFAULT_TENANT_ID explícito. */
export const PG_TENANT_FIXTURE = "aaaaaaaa-bbbb-4ccc-8ddd-000000000001";

const UUID_TENANT = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** tenant_id coherente con conTenant / shared / single+DEFAULT. */
export function tenantIdParaFixture(override?: string): string {
  if (override) return override;
  const ctx = tenantActual();
  if (ctx && UUID_TENANT.test(ctx)) return ctx;
  const mode = leerVarEntorno("TENANT_MODE");
  if (mode === "multi" && ctx) return tenantUuidMulti(ctx);
  if (mode === "shared" && ctx) return ctx;
  const def = process.env.DEFAULT_TENANT_ID;
  if (def && UUID_TENANT.test(def)) return def;
  return PG_TENANT_FIXTURE;
}

/** Objeto de insert con tenant_id NOT NULL (tests). */
export function filaPg<T extends object>(fila: T, tenantId?: string): T & { tenantId: string } {
  return { ...fila, tenantId: tenantIdParaFixture(tenantId) };
}

/** Single con Postgres: DEFAULT_TENANT_ID uuid para filaConTenant (solo en el describe que lo pide). */
export function activarTenantPgEnSingle(): void {
  process.env.DEFAULT_TENANT_ID = PG_TENANT_FIXTURE;
}

export function restaurarDefaultTenantIdAnterior(prev: string | undefined): void {
  if (prev === undefined) delete process.env.DEFAULT_TENANT_ID;
  else process.env.DEFAULT_TENANT_ID = prev;
}

/** Single con Postgres de prueba: URL + DEFAULT_TENANT_ID para filaConTenant. */
export function activarSinglePgDesdeEnv(): void {
  const url = process.env.PG_TEST_URL_A ?? process.env.PG_TEST_URL;
  if (!url) return;
  process.env.TENANT_DATABASE_URL = url;
  activarTenantPgEnSingle();
}

/** Producto + lote para flujos que piden demo-sku-1 con FEFO en PG. */
export async function sembrarDemoSku1(
  db: import("../../src/lib/server-db.js").TenantDb,
  tenantId?: string,
): Promise<void> {
  const { products } = await import("../../src/db/schema.js");
  const { stockLots } = await import("../../src/db/schema.js");
  const tid = tenantIdParaFixture(tenantId);
  await db
    .insert(products)
    .values(filaPg({ sku: "demo-sku-1", nombre: "Demo", precioCentavos: 15000n, stockActual: 10, sector: "general" }, tid))
    .onConflictDoNothing();
  await db
    .insert(stockLots)
    .values(filaPg({ sku: "demo-sku-1", cantidad: 10, cantidadRestante: 10, venceEl: null, costoCentavos: 0n }, tid))
    .onConflictDoNothing();
}