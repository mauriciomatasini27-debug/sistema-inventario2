import { and, eq, sql } from "drizzle-orm";
import { aiUsage, usageCounters } from "../../db/schema-planes.js";
import { dbVivaTenant } from "../server-db.js";
import { crearAlmacenUsoPlanes } from "./_almacen.js";
import {
  RegistroUsoIAMemoria,
  type RegistroUsoIA,
  type ResumenUsoIA,
  type UsoIA,
} from "../../modules/ia/registro.js";

// IA-S5 (PRD-IA-01, ADR-0045): una fila en ai_usage por consulta al
// asistente. DB primero via dbVivaTenant(); solo en single sin base usa la
// memoria compartida. En multi sin base dbVivaTenant lanza BaseNoDisponible
// y se propaga (la ruta responde 503). El tenantId siempre lo da el llamador
// (la sesión); nunca sale de un cuerpo pedido por el usuario.

const FEATURE_ASISTENTE = "asistente_ia";

const RX_MES = /^\d{4}-\d{2}$/;

let memoria: RegistroUsoIAMemoria | null = null;

function memoriaCompartida(): RegistroUsoIAMemoria {
  if (!memoria) memoria = new RegistroUsoIAMemoria();
  return memoria;
}

function exigirRegistro(uso: UsoIA): void {
  if (!uso.tenantId) throw new Error("tenantId requerido");
  if (!RX_MES.test(uso.mes)) throw new Error("mes inválido: se espera AAAA-MM");
  for (const [nombre, valor] of [
    ["tokensEntrada", uso.tokensEntrada],
    ["tokensSalida", uso.tokensSalida],
    ["costoCentavos", uso.costoCentavos],
  ] as const) {
    if (!Number.isInteger(valor) || valor < 0) throw new Error(`${nombre} inválido`);
  }
}

function exigirLectura(tenantId: string, mes: string): void {
  if (!tenantId) throw new Error("tenantId requerido");
  if (!RX_MES.test(mes)) throw new Error("mes inválido: se espera AAAA-MM");
}

function resumir(filas: ReadonlyArray<{ tokensIn: number; tokensOut: number; costoCentavos: bigint }>): ResumenUsoIA {
  let tokensEntrada = 0;
  let tokensSalida = 0;
  let costo = 0n;
  for (const f of filas) {
    tokensEntrada += f.tokensIn;
    tokensSalida += f.tokensOut;
    costo += f.costoCentavos;
  }
  return { consultas: filas.length, tokensEntrada, tokensSalida, costoCentavos: Number(costo) };
}

// La fila de ai_usage y el contador de PLAN-S10 entran en la misma
// transacción: sin doble conteo si una de las dos falla.
export class RegistroUsoIADb implements RegistroUsoIA {
  async registrar(uso: UsoIA): Promise<void> {
    exigirRegistro(uso);
    const db = dbVivaTenant();
    if (!db) {
      await memoriaCompartida().registrar(uso);
      return;
    }
    const costo = BigInt(uso.costoCentavos);
    try {
      await db.transaction(async (tx) => {
        await tx.insert(aiUsage).values({
          tenantId: uso.tenantId,
          mes: uso.mes,
          proveedor: uso.proveedor ?? null,
          modelo: uso.modelo ?? null,
          tokensIn: uso.tokensEntrada,
          tokensOut: uso.tokensSalida,
          costoCentavos: costo,
        });
        await tx
          .insert(usageCounters)
          .values({ tenantId: uso.tenantId, mes: uso.mes, feature: FEATURE_ASISTENTE, usado: 1, costoCentavos: costo })
          .onConflictDoUpdate({
            target: [usageCounters.tenantId, usageCounters.mes, usageCounters.feature],
            set: {
              usado: sql`${usageCounters.usado} + 1`,
              costoCentavos: sql`${usageCounters.costoCentavos} + ${costo}`,
              updatedAt: new Date(),
            },
          });
      });
      await memoriaCompartida().registrar(uso);
    } catch (e) {
      crearAlmacenUsoPlanes().anteFalloPersistencia(e);
      await memoriaCompartida().registrar(uso);
    }
  }

  async usoDelMes(tenantId: string, mes: string): Promise<ResumenUsoIA> {
    exigirLectura(tenantId, mes);
    const db = dbVivaTenant();
    if (!db) return memoriaCompartida().usoDelMes(tenantId, mes);
    try {
      const filas = await db
        .select({ tokensIn: aiUsage.tokensIn, tokensOut: aiUsage.tokensOut, costoCentavos: aiUsage.costoCentavos })
        .from(aiUsage)
        .where(and(eq(aiUsage.tenantId, tenantId), eq(aiUsage.mes, mes)));
      return resumir(filas);
    } catch (e) {
      crearAlmacenUsoPlanes().anteFalloPersistencia(e);
      return memoriaCompartida().usoDelMes(tenantId, mes);
    }
  }
}

// Puerto ARQ-S4: la elección memoria-vs-DB se decide acá una sola vez; quien
// llama usa el puerto. RegistroUsoIAMemoria sigue para tests sin repo.
export function crearRegistroUsoIA(): RegistroUsoIA {
  const db = dbVivaTenant();
  if (!db) return memoriaCompartida();
  return new RegistroUsoIADb();
}

export function olvidarUsoIAMemoria(): void {
  memoria = new RegistroUsoIAMemoria();
}
