import { asc, eq, type SQL } from "drizzle-orm";
import { cashMovements } from "../../db/schema.js";
import type { TenantDb } from "../server-db.js";
import { dondeTenant, tenantIdShared } from "../tenant-scope.js";

type InsertCaja = typeof cashMovements.$inferInsert;

// ADR-0116 C5: el caller no elige tenant ni reloj. id sigue opcional, como en el insert del schema.
export type MovimientoCajaNuevo = Omit<InsertCaja, "tenantId" | "createdAt">;

export type FilaMovimientoCaja = typeof cashMovements.$inferSelect;

export type FiltroMovimientoCaja =
  | { readonly tipo: "todos" }
  | { readonly tipo: "id"; readonly id: string }
  | { readonly tipo: "clave"; readonly idempotencyKey: string }
  | { readonly tipo: "venta"; readonly saleId: string }
  | { readonly tipo: "metodo"; readonly metodo: string };

type TxCaja = Parameters<Parameters<TenantDb["transaction"]>[0]>[0];
export type SesionCaja = TenantDb | TxCaja;

// ADR-0116 C5: único SQL de cash_movements. En shared sella tenant_id y filtra.
// En single y multi tenantIdShared es null y dondeTenant no agrega predicado.
// Un 23505 se propaga: releer adentro de la tx abortada fallaría.

export async function insertarMovimientosCaja(db: SesionCaja, filas: readonly MovimientoCajaNuevo[]): Promise<void> {
  // Lista vacía no escribe y no lee el ALS. El caller puede armar el lote sin tenant.
  if (filas.length === 0) return;
  const tenantId = tenantIdShared();
  const lote: InsertCaja[] = filas.map((fila) => (tenantId ? { ...fila, tenantId } : { ...fila }));
  await db.insert(cashMovements).values(lote);
}

export async function listarMovimientosCaja(
  db: SesionCaja,
  filtro: FiltroMovimientoCaja = { tipo: "todos" },
): Promise<FilaMovimientoCaja[]> {
  const extra = predicado(filtro);
  const where = dondeTenant(cashMovements.tenantId, extra);
  const q = db.select().from(cashMovements).where(where).orderBy(asc(cashMovements.createdAt), asc(cashMovements.id));
  if (filtro.tipo === "id" || filtro.tipo === "clave") return q.limit(1);
  return q;
}

function predicado(f: FiltroMovimientoCaja): SQL | undefined {
  switch (f.tipo) {
    case "todos":
      return undefined;
    case "id":
      return eq(cashMovements.id, f.id);
    case "clave":
      return eq(cashMovements.idempotencyKey, f.idempotencyKey);
    case "venta":
      return eq(cashMovements.saleId, f.saleId);
    case "metodo":
      return eq(cashMovements.metodo, f.metodo);
    default: {
      const _nunca: never = f;
      return _nunca;
    }
  }
}
