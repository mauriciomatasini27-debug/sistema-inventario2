/** UUID fijo para inserts PG en single/multi sin conTenant. */
export const PG_TENANT_FIXTURE = "aaaaaaaa-bbbb-4ccc-8ddd-000000000001";

/** Objeto de insert con tenant_id NOT NULL (tests). */
export function filaPg<T extends object>(fila: T, tenantId: string = PG_TENANT_FIXTURE): T & { tenantId: string } {
  return { ...fila, tenantId };
}