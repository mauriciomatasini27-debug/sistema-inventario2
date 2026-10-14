import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { utilityBills } from "../../db/schema-servicios.js";
import { esModoMulti } from "../tenant-mode.js";
import { BaseNoDisponible, dbVivaTenant, type TenantDb } from "../server-db.js";
import { store } from "../store.js";
import type { Servicio } from "../../modules/utilities/cuentas.js";
import type { Medio } from "../validation.js";
import {
  categoria_para,
  pagar_servicio,
  registrar_factura,
  type AdvertenciaFactura,
  type EstadoGuardado,
  type FacturaServicio,
  type OrigenExtraccion,
  type ConfianzaCampo,
} from "../../modules/utilities/facturas_servicios.js";
import { registrarEgresoRetiro } from "./caja.js";

// PERS2-S16 (ADR-0058): facturas de servicios (alta idempotente por
// message-id, vencimientos, pago con su egreso). DB primero via
// dbVivaTenant(); solo en single sin base usa la memoria particionada. En
// multi sin base dbVivaTenant lanza BaseNoDisponible y se propaga (503).

function aBaseNoDisponible(e: unknown): BaseNoDisponible {
  return e instanceof BaseNoDisponible ? e : new BaseNoDisponible();
}

function esConflictoUnico(e: unknown): boolean {
  return typeof e === "object" && e !== null && "code" in e && (e as { code: unknown }).code === "23505";
}

export interface FacturaNueva {
  readonly accountId: string;
  readonly messageId: string;
  readonly periodo: string;
  readonly vencimiento: string;
  readonly montoCentavos: bigint;
  readonly necesitaRevision: boolean;
  readonly origen: OrigenExtraccion;
  readonly confianzaMonto: ConfianzaCampo;
  readonly confianzaVencimiento: ConfianzaCampo;
}

export type RegistrarFacturaResultado =
  | { ok: true; factura: FacturaServicio; advertencias: ReadonlyArray<AdvertenciaFactura>; fuente: "db" | "memoria" }
  | { ok: false; codigo: "MENSAJE_REPETIDO"; error: string }
  | { ok: false; codigo: "NO_VALIDO"; status: 422; error: string };

function espejoFactura(factura: FacturaServicio): void {
  store.utilityBills.set(factura.id, factura);
  // Sin tabla propia: el indice por message-id vive solo en memoria.
  store.utilityBillsByMessage.set(factura.messageId, factura);
}

// Alta CS9.1: message-id UNIQUE. Retry identico => 409 con el original.
export async function registrarFactura(input: FacturaNueva): Promise<RegistrarFacturaResultado> {
  const r = registrar_factura(
    {
      accountId: input.accountId,
      messageId: input.messageId,
      periodo: input.periodo,
      vencimiento: input.vencimiento,
      montoCentavos: input.montoCentavos,
      necesitaRevision: input.necesitaRevision,
      origen: input.origen,
      confianzaMonto: input.confianzaMonto,
      confianzaVencimiento: input.confianzaVencimiento,
    },
    store.utilityBillsByMessage,
  );
  if (r.status === 409) return { ok: false, codigo: "MENSAJE_REPETIDO", error: r.error };
  if (r.status !== 201) return { ok: false, codigo: "NO_VALIDO", status: 422, error: r.error };

  const db = dbVivaTenant();
  if (!db) {
    espejoFactura(r.factura);
    return { ok: true, factura: r.factura, advertencias: r.advertencias, fuente: "memoria" };
  }
  try {
    const previo = await db.select().from(utilityBills).where(eq(utilityBills.messageId, input.messageId)).limit(1);
    if (previo[0]) {
      const f = filaAFactura(previo[0]);
      espejoFactura(f);
      return { ok: false, codigo: "MENSAJE_REPETIDO", error: "message-id repetido" };
    }
    await db.insert(utilityBills).values({
      id: r.factura.id,
      accountId: r.factura.accountId,
      messageId: r.factura.messageId,
      periodo: r.factura.periodo,
      vencimiento: r.factura.vencimiento,
      montoCentavos: r.factura.montoCentavos,
      estado: "pendiente",
      necesitaRevision: r.factura.necesitaRevision,
      origen: r.factura.origen,
      confianza: { monto: r.factura.confianzaMonto, vencimiento: r.factura.confianzaVencimiento },
    });
    espejoFactura(r.factura);
    return { ok: true, factura: r.factura, advertencias: r.advertencias, fuente: "db" };
  } catch (e) {
    if (esConflictoUnico(e)) {
      try {
        const previo = await db.select().from(utilityBills).where(eq(utilityBills.messageId, input.messageId)).limit(1);
        if (previo[0]) {
          const f = filaAFactura(previo[0]);
          espejoFactura(f);
          return { ok: false, codigo: "MENSAJE_REPETIDO", error: "message-id repetido" };
        }
      } catch (e2) {
        if (esModoMulti()) throw aBaseNoDisponible(e2);
      }
      if (esModoMulti()) throw aBaseNoDisponible(e);
    } else if (esModoMulti()) {
      throw aBaseNoDisponible(e);
    }
    espejoFactura(r.factura);
    return { ok: true, factura: r.factura, advertencias: r.advertencias, fuente: "memoria" };
  }
}

type FilaFactura = typeof utilityBills.$inferSelect;

function filaAFactura(f: FilaFactura): FacturaServicio {
  const confianza = (f.confianza ?? {}) as { monto?: ConfianzaCampo; vencimiento?: ConfianzaCampo };
  return {
    id: f.id,
    accountId: f.accountId,
    messageId: f.messageId,
    periodo: f.periodo,
    vencimiento: f.vencimiento,
    montoCentavos: BigInt(f.montoCentavos),
    estado: f.estado as EstadoGuardado,
    necesitaRevision: f.necesitaRevision,
    origen: f.origen as OrigenExtraccion,
    confianzaMonto: confianza.monto ?? "alta",
    confianzaVencimiento: confianza.vencimiento ?? "alta",
  };
}

// Vencimientos: todas las facturas del tenant con DB viva, memoria
// particionada solo en single sin base. En multi sin base propaga.
export async function listarFacturas(): Promise<FacturaServicio[]> {
  const db = dbVivaTenant();
  if (!db) return [...store.utilityBills.values()];
  try {
    const filas = await db.select().from(utilityBills);
    return filas.map(filaAFactura);
  } catch (e) {
    if (esModoMulti()) throw aBaseNoDisponible(e);
    return [...store.utilityBills.values()];
  }
}

async function leerFacturaEnDb(db: TenantDb, billId: string): Promise<FacturaServicio | null> {
  const filas = await db.select().from(utilityBills).where(eq(utilityBills.id, billId)).limit(1);
  const f = filas[0];
  if (!f) return null;
  const factura = filaAFactura(f);
  espejoFactura(factura);
  return factura;
}

export interface PagoServicioInput {
  readonly billId: string;
  readonly servicio: Servicio;
  readonly proveedor: string;
  readonly numeroCuenta: string | null;
  readonly medio: Medio;
  readonly notaExtra?: string | undefined;
}

export type PagarFacturaResultado =
  | { ok: true; billId: string; estado: EstadoGuardado }
  | { ok: false; codigo: "NO_ENCONTRADA"; error: string }
  | { ok: false; codigo: "YA_PAGADA"; error: string }
  | { ok: false; codigo: "NO_VALIDO"; status: 422; error: string };

// Pago CS5.1: transicion pendiente->pagada + egreso gasto_operativo (por
// caja.ts). En multi sin base propaga BaseNoDisponible.
export async function pagarFactura(input: PagoServicioInput): Promise<PagarFacturaResultado> {
  const db = dbVivaTenant();
  let factura: FacturaServicio | null;
  if (!db) {
    factura = store.utilityBills.get(input.billId) ?? null;
  } else {
    try {
      factura = await leerFacturaEnDb(db, input.billId);
    } catch (e) {
      if (esModoMulti()) throw aBaseNoDisponible(e);
      factura = store.utilityBills.get(input.billId) ?? null;
    }
  }
  if (!factura) return { ok: false, codigo: "NO_ENCONTRADA", error: "factura inexistente" };
  const r = pagar_servicio(factura, {
    servicio: input.servicio,
    proveedor: input.proveedor,
    numeroCuenta: input.numeroCuenta,
    medio: input.medio,
    ...(input.notaExtra !== undefined ? { notaExtra: input.notaExtra } : {}),
  });
  if (r.status === 409) return { ok: false, codigo: "YA_PAGADA", error: r.error };
  if (r.status !== 200) return { ok: false, codigo: "NO_VALIDO", status: 422, error: r.error };

  if (!db) {
    espejoFactura(r.factura);
    await registrarEgresoRetiro({
      key: randomUUID(),
      montoCentavos: r.egreso.monto_centavos,
      metodo: r.egreso.metodo,
      origen: r.egreso.origen,
      categoriaId: categoria_para(input.servicio),
    });
    return { ok: true, billId: r.factura.id, estado: r.factura.estado };
  }
  try {
    await db.update(utilityBills).set({ estado: "pagada" }).where(eq(utilityBills.id, r.factura.id));
    await registrarEgresoRetiro({
      key: randomUUID(),
      montoCentavos: r.egreso.monto_centavos,
      metodo: r.egreso.metodo,
      origen: r.egreso.origen,
      categoriaId: categoria_para(input.servicio),
    });
    espejoFactura(r.factura);
    return { ok: true, billId: r.factura.id, estado: r.factura.estado };
  } catch (e) {
    if (esModoMulti()) throw aBaseNoDisponible(e);
    espejoFactura(r.factura);
    await registrarEgresoRetiro({
      key: randomUUID(),
      montoCentavos: r.egreso.monto_centavos,
      metodo: r.egreso.metodo,
      origen: r.egreso.origen,
      categoriaId: categoria_para(input.servicio),
    });
    return { ok: true, billId: r.factura.id, estado: r.factura.estado };
  }
}
