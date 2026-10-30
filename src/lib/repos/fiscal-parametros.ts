import { eq } from "drizzle-orm";
import { fiscalParams } from "../../db/schema-fiscal-control.js";
import { getControlDb } from "../db.js";

const memoria = new Map<string, string>();

export async function leerFiscalParam(clave: string): Promise<string | null> {
  try {
    const db = getControlDb();
    const filas = await db.select({ valor: fiscalParams.valor }).from(fiscalParams).where(eq(fiscalParams.clave, clave)).limit(1);
    return filas[0]?.valor ?? null;
  } catch {
    return memoria.get(clave) ?? null;
  }
}

export async function guardarFiscalParam(clave: string, valor: string): Promise<void> {
  memoria.set(clave, valor);
  try {
    const db = getControlDb();
    await db
      .insert(fiscalParams)
      .values({ clave, valor })
      .onConflictDoUpdate({ target: fiscalParams.clave, set: { valor } });
  } catch {
    // Sin control DB: queda en memoria del proceso.
  }
}

export function resetFiscalParamMemoria(): void {
  memoria.clear();
}
