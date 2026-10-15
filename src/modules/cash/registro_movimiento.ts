import { eq } from "drizzle-orm";
import { getTenantDb } from "../../lib/db.js";
import { dbVivaTenant } from "../../lib/server-db.js";
import { cashMovements } from "../../db/schema.js";
import { store, type StoredMovement } from "../../lib/store.js";
import type { Medio } from "../../lib/validation.js";

// PERS-S1 (ADR-0024): movimiento de caja con DB como fuente cuando hay DB
// viva. La ruta valida (zod) y mapea; este repo es dueño de duplicado →
// insert → espejo memoria (el espejo cae en PERS-S4).

export interface RegistrarMovimientoInput {
  readonly key: string;
  readonly tipo: "ingreso" | "egreso";
  readonly metodo: Medio;
  readonly categoria_id: string;
  readonly origen: string;
  readonly sale_id?: string | undefined;
  readonly monto_centavos: number;
}

export type RegistroMovimientoFallo =
  | { readonly ok: false; readonly codigo: "DUPLICADO"; readonly status: 409; readonly original: unknown }
  | { readonly ok: false; readonly codigo: "VENTA_EXIGE_SALE_ID"; readonly status: 422 }
  | { readonly ok: false; readonly codigo: "REQUIERE_DUENO"; readonly status: 403 };

type TenantDb = ReturnType<typeof getTenantDb>;
type FilaMovimiento = typeof cashMovements.$inferSelect;

// PERS2-S2: la disponibilidad de DB la resuelve el helper central
// (dbVivaTenant: null en single, BaseNoDisponible en multi).

function esConflictoUnico(e: unknown): boolean {
  return typeof e === "object" && e !== null && "code" in e && (e as { code: unknown }).code === "23505";
}

// Response.json no serializa bigint: la fila sale con monto en string.
function filaMovimientoJson(f: FilaMovimiento): Record<string, unknown> {
  return { ...f, montoCentavos: f.montoCentavos.toString() };
}

function espejoMemoria(i: RegistrarMovimientoInput): StoredMovement {
  const mov: StoredMovement = {
    id: crypto.randomUUID(),
    tipo: i.tipo,
    metodo: i.metodo,
    monto_centavos: String(i.monto_centavos),
    origen: i.origen,
    ...(i.sale_id !== undefined ? { sale_id: i.sale_id } : {}),
    idempotency_key: i.key,
    // CAJA-S1: instante de ocurrencia para asociar QR ±15 min.
    ocurrido_en: new Date().toISOString(),
  };
  store.movements.push(mov);
  return mov;
}

function reglasDominio(i: RegistrarMovimientoInput): RegistroMovimientoFallo | null {
  // TV6: el egreso de venta nace en la venta misma tx; por esta vía standalone
  // se exige sale_id para no crear egresos huérfanos.
  if (i.origen === "venta" && i.sale_id === undefined) {
    return { ok: false, codigo: "VENTA_EXIGE_SALE_ID", status: 422 };
  }
  // Slice-0 sin auth en esta ruta; el permiso vive en el núcleo.
  if (i.origen === "sueldo" || (i.origen === "retiro" && i.categoria_id === "retiro_dueno")) {
    return { ok: false, codigo: "REQUIERE_DUENO", status: 403 };
  }
  return null;
}

export async function registrar_movimiento_db_first(
  i: RegistrarMovimientoInput,
): Promise<{ ok: true; mov: StoredMovement; fuente: "db" | "memoria" } | RegistroMovimientoFallo> {
  const regla = reglasDominio(i);
  if (regla) return regla;

  const db = dbVivaTenant();
  if (!db) {
    const dup = store.movements.find((m) => m.idempotency_key === i.key);
    if (dup) return { ok: false, codigo: "DUPLICADO", status: 409, original: dup };
    return { ok: true, mov: espejoMemoria(i), fuente: "memoria" };
  }

  try {
    const previo = await db.select().from(cashMovements).where(eq(cashMovements.idempotencyKey, i.key)).limit(1);
    const fila = previo[0];
    if (fila) return { ok: false, codigo: "DUPLICADO", status: 409, original: filaMovimientoJson(fila) };
  } catch {
    const dup = store.movements.find((m) => m.idempotency_key === i.key);
    if (dup) return { ok: false, codigo: "DUPLICADO", status: 409, original: dup };
    return { ok: true, mov: espejoMemoria(i), fuente: "memoria" };
  }

  try {
    await db.insert(cashMovements).values({
      saleId: i.sale_id ?? null,
      idempotencyKey: i.key,
      tipo: i.tipo,
      metodo: i.metodo,
      categoriaId: i.categoria_id,
      origen: i.origen,
      montoCentavos: BigInt(i.monto_centavos),
    });
  } catch (e) {
    // Carrera entre pre-check e insert: mismo 409 con relectura.
    if (esConflictoUnico(e)) {
      try {
        const previo = await db.select().from(cashMovements).where(eq(cashMovements.idempotencyKey, i.key)).limit(1);
        const fila = previo[0];
        return { ok: false, codigo: "DUPLICADO", status: 409, original: fila ? filaMovimientoJson(fila) : null };
      } catch {
        return { ok: true, mov: espejoMemoria(i), fuente: "memoria" };
      }
    }
    return { ok: true, mov: espejoMemoria(i), fuente: "memoria" };
  }
  const mov = espejoMemoria(i);
  return { ok: true, mov, fuente: "db" };
}
