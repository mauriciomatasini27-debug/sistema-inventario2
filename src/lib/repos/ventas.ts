import { eq } from "drizzle-orm";
import { sales } from "../../db/schema.js";
import { saleReturns, ticketPaymentCorrections } from "../../db/schema-tickets.js";
import { esModoMulti } from "../tenant-mode.js";
import { BaseNoDisponible, dbVivaTenant, type TenantDb } from "../server-db.js";
import { store, type StoredFiscalDoc } from "../store.js";
import type { Medio } from "../validation.js";
import { idempotency_key_for_return } from "../../modules/fiscal/fiscal.js";
import { decidir_nc } from "../../modules/fiscal/nc.js";
import { desagregar_iva_21 } from "../../modules/fiscal/iva.js";
import {
  registrar_devolucion,
  siguiente_numero_devolucion,
  type DevolucionSeq,
} from "../../modules/sales/devoluciones.js";
import { corregir_medio, type CorreccionOk } from "../../modules/sales/correccion_medio.js";
import { LEYENDA_NO_FISCAL } from "../../modules/sales/vender_mostrador.js";
import type { Sku } from "../../modules/inventario/inventario.js";
import { aplicarMovimiento } from "./stock.js";
import { registrarMovimientoDevolucion } from "./caja.js";
import { acumuladoNcParaVenta, asegurarDoc, buscarFacturaParaNd } from "./fiscal.js";

// PERS2-S25/S26 (ADR-0063): devoluciones y correcciones de medio. DB primero
// via dbVivaTenant(); solo en single sin base usa la memoria particionada. En
// multi sin base dbVivaTenant lanza BaseNoDisponible y se propaga (503).
// nextReturn has no table: el correlativo vive en memoria del repo.

function aBaseNoDisponible(e: unknown): BaseNoDisponible {
  return e instanceof BaseNoDisponible ? e : new BaseNoDisponible();
}

function esConflictoUnico(e: unknown): boolean {
  return typeof e === "object" && e !== null && "code" in e && (e as { code: unknown }).code === "23505";
}

export interface VentaParaDevolucion {
  sale_id: string;
  total_centavos: string;
  medio: Medio;
}

/** Venta por sale_id: memoria caliente, luego sales del tenant. Sin DB (solo single) cae a memoria. */
export async function buscarVentaPorId(saleId: string): Promise<VentaParaDevolucion | null> {
  const mem = [...store.idempotency.values()].find((t) => t.sale_id === saleId) ?? null;
  if (mem) return { sale_id: mem.sale_id, total_centavos: mem.total_centavos, medio: mem.medio };
  const db = dbVivaTenant();
  if (!db) return null;
  try {
    const filas = await db.select().from(sales).where(eq(sales.id, saleId)).limit(1);
    const f = filas[0];
    if (!f) return null;
    return { sale_id: f.id, total_centavos: f.totalCentavos.toString(), medio: f.medio as Medio };
  } catch (e) {
    if (esModoMulti()) throw aBaseNoDisponible(e);
    return null;
  }
}

export interface VistoDevolucion {
  numero_devolucion: string;
  sale_id: string;
}

/** Visto idempotente de devolución: memoria, luego sale_returns con espejo. */
export async function leerVistoDevolucion(key: string): Promise<VistoDevolucion | null> {
  const mem = store.returnVistos.get(key);
  if (mem) return { ...mem };
  const db = dbVivaTenant();
  if (!db) return null;
  try {
    const filas = await db.select().from(saleReturns).where(eq(saleReturns.idempotencyKey, key)).limit(1);
    const f = filas[0];
    if (!f) return null;
    const visto: VistoDevolucion = { numero_devolucion: f.numeroDevolucion, sale_id: f.saleId };
    store.returnVistos.set(key, visto);
    return { ...visto };
  } catch (e) {
    if (esModoMulti()) throw aBaseNoDisponible(e);
    return null;
  }
}

/** Acumulado devuelto por venta: union memoria + sale_returns dedup por número. */
export async function acumuladoDevoluciones(saleId: string): Promise<bigint> {
  const vistos = new Map<string, bigint>();
  for (const r of store.returns.values()) {
    if (r.sale_id === saleId) vistos.set(r.numero_devolucion, BigInt(r.total_centavos));
  }
  const db = dbVivaTenant();
  if (!db) return [...vistos.values()].reduce((a, b) => a + b, 0n);
  try {
    const filas = await db.select().from(saleReturns).where(eq(saleReturns.saleId, saleId));
    for (const f of filas) {
      if (!vistos.has(f.numeroDevolucion)) vistos.set(f.numeroDevolucion, f.montoCentavos);
    }
    return [...vistos.values()].reduce((a, b) => a + b, 0n);
  } catch (e) {
    if (esModoMulti()) throw aBaseNoDisponible(e);
    return [...vistos.values()].reduce((a, b) => a + b, 0n);
  }
}

async function ultimoNumeroDevolucion(db: TenantDb | null): Promise<DevolucionSeq | null> {
  let n = store.nextReturn > 1 ? store.nextReturn - 1 : 0;
  if (db) {
    try {
      const filas = await db.select({ numero: saleReturns.numeroDevolucion }).from(saleReturns);
      for (const f of filas) {
        const m = /^D-(\d+)$/.exec(f.numero);
        if (m) n = Math.max(n, Number(m[1]));
      }
    } catch (e) {
      if (esModoMulti()) throw aBaseNoDisponible(e);
    }
  }
  return n > 0 ? { n } : null;
}

export interface RegistrarDevolucionInput {
  readonly key: string;
  readonly saleId: string;
  readonly montoCentavos: bigint;
  readonly items: ReadonlyArray<{ sku: string; cantidad: number }>;
  readonly medio: Medio;
  readonly motivo: string;
  readonly actor: string;
  readonly clientOccurredAt: string;
  readonly tenantId?: string | undefined;
}

export type RegistrarDevolucionResultado =
  | { ok: true; returnId: string; numero: string; saleId: string; montoCentavos: string; fiscalEstado: string; ncTipo: number | null }
  | { ok: false; status: 409; error: string; original: VistoDevolucion }
  | { ok: false; status: 404; error: string }
  | { ok: false; status: 422; error: string; acumulado_centavos?: string; facturado_centavos?: string };

function espejoMemoriaDevolucion(
  key: string,
  returnId: string,
  numero: string,
  input: RegistrarDevolucionInput,
): void {
  store.returns.set(returnId, {
    return_id: returnId,
    sale_id: input.saleId,
    numero_devolucion: numero,
    total_centavos: input.montoCentavos.toString(),
    medio: input.medio,
  });
  const visto: VistoDevolucion = { numero_devolucion: numero, sale_id: input.saleId };
  store.returnVistos.set(key, visto);
  const n = Number(/^D-(\d+)$/.exec(numero)?.[1] ?? 0);
  if (n >= store.nextReturn) store.nextReturn = n + 1;
}

export async function registrarDevolucion(input: RegistrarDevolucionInput): Promise<RegistrarDevolucionResultado> {
  const visto = await leerVistoDevolucion(input.key);
  if (visto) return { ok: false, status: 409, error: "idempotency-key repetida", original: visto };

  const venta = await buscarVentaPorId(input.saleId);
  if (!venta) return { ok: false, status: 404, error: "venta inexistente" };
  const ventaTotal = BigInt(venta.total_centavos);
  const acumuladoPrevio = await acumuladoDevoluciones(input.saleId);

  const factura = await buscarFacturaParaNd(input.saleId, input.tenantId);
  const acumuladoNc = await acumuladoNcParaVenta(input.saleId, input.tenantId);

  // Puerta de escritura: en multi sin base propaga BaseNoDisponible (503).
  const db = dbVivaTenant();
  const ultimo = await ultimoNumeroDevolucion(db);

  const dev = registrar_devolucion({
    idempotencyKey: input.key,
    saleId: input.saleId,
    ventaTotalCentavos: ventaTotal,
    acumuladoPrevioCentavos: acumuladoPrevio,
    montoCentavos: input.montoCentavos,
    items: input.items.map((it) => ({ sku: it.sku as Sku, cantidad: it.cantidad })),
    medio: input.medio,
    fueAcuenta: false,
    motivo: input.motivo,
    actor: input.actor,
    ultimoDevolucion: ultimo,
    vistos: new Map(),
  });
  if (!dev.ok) {
    if (dev.codigo === "TOPE_EXCEDIDO") {
      return {
        ok: false,
        status: 422,
        error: "devolución supera el total de la venta",
        acumulado_centavos: dev.acumuladoCentavos.toString(),
      };
    }
    return { ok: false, status: 422, error: "devolución inválida" };
  }

  const decision = decidir_nc(
    factura
      ? {
          cbteTipo: Number(factura.cbte_tipo),
          ptoVta: Number(factura.pto_vta),
          cbteNro: factura.cbte_nro,
          estado: factura.estado,
          impTotalCentavos: ventaTotal,
          docTipo: Number(factura.doc_tipo || "99"),
          docNro: factura.doc_nro || "0",
          condIvaReceptor: Number(factura.cond_iva_receptor || "5"),
        }
      : null,
    input.montoCentavos,
    acumuladoNc,
  );
  if (decision.decision === "tope-excedido") {
    return {
      ok: false,
      status: 422,
      error: "NC supera lo facturado",
      facturado_centavos: decision.facturadoCentavos.toString(),
    };
  }

  const e = dev.efecto;
  const returnId = crypto.randomUUID();
  const numero = siguiente_numero_devolucion(ultimo);
  const acumuladoNuevo = acumuladoPrevio + input.montoCentavos;

  if (!db) {
    espejoMemoriaDevolucion(input.key, returnId, numero, input);
  } else {
    try {
      const previo = await db.select().from(saleReturns).where(eq(saleReturns.idempotencyKey, input.key)).limit(1);
      if (previo[0]) {
        const v: VistoDevolucion = { numero_devolucion: previo[0].numeroDevolucion, sale_id: previo[0].saleId };
        store.returnVistos.set(input.key, v);
        return { ok: false, status: 409, error: "idempotency-key repetida", original: v };
      }
      await db.insert(saleReturns).values({
        id: returnId,
        idempotencyKey: input.key,
        saleId: input.saleId,
        numeroDevolucion: numero,
        montoCentavos: input.montoCentavos,
        acumuladoPrevioCentavos: acumuladoPrevio,
        acumuladoNuevoCentavos: acumuladoNuevo,
        medio: input.medio,
        fueAcuenta: false,
        motivo: input.motivo,
        actor: input.actor,
      }).onConflictDoNothing({ target: saleReturns.idempotencyKey });
      const carrera = await db.select().from(saleReturns).where(eq(saleReturns.idempotencyKey, input.key)).limit(1);
      const fila = carrera[0];
      if (!fila || fila.id !== returnId) {
        const v: VistoDevolucion = fila
          ? { numero_devolucion: fila.numeroDevolucion, sale_id: fila.saleId }
          : { numero_devolucion: numero, sale_id: input.saleId };
        store.returnVistos.set(input.key, v);
        return { ok: false, status: 409, error: "idempotency-key repetida", original: v };
      }
      espejoMemoriaDevolucion(input.key, returnId, numero, input);
    } catch (err) {
      if (esConflictoUnico(err)) {
        try {
          const previo = await db.select().from(saleReturns).where(eq(saleReturns.idempotencyKey, input.key)).limit(1);
          const f = previo[0];
          const v: VistoDevolucion = f
            ? { numero_devolucion: f.numeroDevolucion, sale_id: f.saleId }
            : { numero_devolucion: numero, sale_id: input.saleId };
          store.returnVistos.set(input.key, v);
          return { ok: false, status: 409, error: "idempotency-key repetida", original: v };
        } catch (err2) {
          if (esModoMulti()) throw aBaseNoDisponible(err2);
        }
        if (esModoMulti()) throw aBaseNoDisponible(err);
      } else if (esModoMulti()) {
        throw aBaseNoDisponible(err);
      }
      espejoMemoriaDevolucion(input.key, returnId, numero, input);
    }
  }

  for (const m of e.movimientosStock) {
    await aplicarMovimiento({
      idemKey: input.key,
      sku: m.sku,
      loteId: null,
      delta: Math.abs(m.delta),
      tipo: "COMPENSATORIO",
      ...(m.motivo ? { motivo: m.motivo } : {}),
    });
  }
  if (e.movimientoCaja) {
    await registrarMovimientoDevolucion({
      key: input.key,
      saleId: input.saleId,
      medio: input.medio,
      montoCentavos: input.montoCentavos,
      tipo: e.movimientoCaja.tipo === "ingreso" ? "ingreso" : "egreso",
    });
  }

  let fiscalEstado: string;
  let ncTipo: number | null = null;
  const fch = fechaHoy();
  if (decision.decision === "solo-interno") {
    fiscalEstado = "sin_factura";
  } else if (decision.decision === "esperar-cae") {
    ncTipo = 13;
    const fkey = `return:${returnId}:espera`;
    await asegurarDoc(
      {
        id: crypto.randomUUID(),
        idempotency_key: fkey,
        sale_id: input.saleId,
        tenant_id: input.tenantId ?? factura?.tenant_id ?? null,
        cbte_tipo: String(ncTipo),
        pto_vta: factura?.pto_vta ?? "3",
        cbte_nro: null,
        cbte_fch: fch,
        doc_tipo: factura?.doc_tipo ?? "99",
        doc_nro: factura?.doc_nro ?? "0",
        cond_iva_receptor: factura?.cond_iva_receptor ?? "5",
        estado: "espera_cae",
        cae: null,
        cae_vto: null,
        qr_payload: null,
        imp_iva_centavos: null,
        alic_iva_id: null,
        client_ocurred_at: input.clientOccurredAt,
        venta_leyenda: null,
        imp_total_centavos: input.montoCentavos.toString(),
        return_id: returnId,
        cbtes_asoc_tipo: null,
        cbtes_asoc_pto_vta: null,
        cbtes_asoc_nro: null,
      },
      input.tenantId,
    );
    fiscalEstado = "espera_cae";
  } else {
    ncTipo = decision.ncTipo;
    const fkey = idempotency_key_for_return(returnId, ncTipo);
    const esConIva = ncTipo === 8 || ncTipo === 3;
    let impIva: string | null = null;
    let alicId: string | null = null;
    if (esConIva) {
      const d = desagregar_iva_21(input.montoCentavos);
      if (d) {
        impIva = d.impIvaCentavos.toString();
        alicId = String(d.alicId);
      }
    }
    const facturaDoc = factura!;
    await asegurarDoc(
      {
        id: crypto.randomUUID(),
        idempotency_key: fkey,
        sale_id: input.saleId,
        tenant_id: input.tenantId ?? factura?.tenant_id ?? null,
        cbte_tipo: String(ncTipo),
        pto_vta: facturaDoc.pto_vta,
        cbte_nro: null,
        cbte_fch: fch,
        doc_tipo: facturaDoc.doc_tipo,
        doc_nro: facturaDoc.doc_nro,
        cond_iva_receptor: facturaDoc.cond_iva_receptor,
        estado: "pendiente",
        cae: null,
        cae_vto: null,
        qr_payload: null,
        imp_iva_centavos: impIva,
        alic_iva_id: alicId,
        client_ocurred_at: input.clientOccurredAt,
        venta_leyenda: null,
        imp_total_centavos: input.montoCentavos.toString(),
        return_id: returnId,
        cbtes_asoc_tipo: String(decision.cbtesAsoc.tipo),
        cbtes_asoc_pto_vta: String(decision.cbtesAsoc.ptoVta),
        cbtes_asoc_nro: decision.cbtesAsoc.nro,
      },
      input.tenantId,
    );
    fiscalEstado = "pendiente";
  }

  return {
    ok: true,
    returnId,
    numero,
    saleId: input.saleId,
    montoCentavos: input.montoCentavos.toString(),
    fiscalEstado,
    ncTipo,
  };
}

function fechaHoy(): string {
  const now = new Date();
  return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
}

function filaACorreccion(f: typeof ticketPaymentCorrections.$inferSelect): CorreccionOk {
  const correccion = {
    id: `corr-${f.idempotencyKey}`,
    saleId: f.saleId,
    medioOriginal: f.medioOriginal as Medio,
    medioNuevo: f.medioNuevo as Medio,
    motivo: f.motivo,
    actor: f.actor,
    leyenda: LEYENDA_NO_FISCAL,
  };
  return {
    status: 201 as const,
    correccion,
    auditoria: {
      accion: "correccion_medio" as const,
      correccionId: correccion.id,
      saleId: f.saleId,
      antes: f.medioOriginal as Medio,
      despues: f.medioNuevo as Medio,
      actor: f.actor,
      motivo: f.motivo,
    },
  };
}

/** Vistos de corrección: memoria caliente + ticket_payment_corrections, gana memoria. */
export async function vistosCorreccion(): Promise<Map<string, CorreccionOk>> {
  const union = new Map<string, CorreccionOk>(store.correcciones);
  const db = dbVivaTenant();
  if (!db) return union;
  try {
    const filas = await db.select().from(ticketPaymentCorrections);
    for (const f of filas) {
      if (!union.has(f.idempotencyKey)) union.set(f.idempotencyKey, filaACorreccion(f));
    }
    return union;
  } catch (e) {
    if (esModoMulti()) throw aBaseNoDisponible(e);
    return union;
  }
}

export interface RegistrarCorreccionInput {
  readonly key: string;
  readonly saleId: string;
  readonly medioNuevo: Medio;
  readonly motivo: string;
  readonly actor: string;
}

export type RegistrarCorreccionResultado =
  | { ok: true; status: 201; correccion: CorreccionOk }
  | { ok: false; status: 404; error: string }
  | { ok: false; status: 409; error: string; original?: CorreccionOk }
  | { ok: false; status: 422; error: string };

export async function registrarCorreccion(input: RegistrarCorreccionInput): Promise<RegistrarCorreccionResultado> {
  const venta = await buscarVentaPorId(input.saleId);
  if (!venta) return { ok: false, status: 404, error: "venta inexistente" };
  const r = corregir_medio({
    idempotencyKey: input.key,
    saleId: input.saleId,
    medioOriginal: venta.medio,
    medioNuevo: input.medioNuevo,
    motivo: input.motivo,
    actor: input.actor,
    vistos: await vistosCorreccion(),
  });
  if (r.status !== 201) {
    if (r.status === 409) return { ok: false, status: 409, error: r.error, ...(r.original ? { original: r.original } : {}) };
    return { ok: false, status: 422, error: r.error };
  }
  // Puerta de escritura: en multi sin base propaga BaseNoDisponible (503).
  const db = dbVivaTenant();
  if (!db) {
    store.correcciones.set(input.key, r);
    return { ok: true, status: 201, correccion: r };
  }
  try {
    const previo = await db
      .select()
      .from(ticketPaymentCorrections)
      .where(eq(ticketPaymentCorrections.idempotencyKey, input.key))
      .limit(1);
    if (previo[0]) {
      const original = filaACorreccion(previo[0]);
      store.correcciones.set(input.key, original);
      return { ok: false, status: 409, error: "idempotency-key repetida", original };
    }
    const filas = await db
      .insert(ticketPaymentCorrections)
      .values({
        idempotencyKey: input.key,
        saleId: input.saleId,
        medioOriginal: venta.medio,
        medioNuevo: input.medioNuevo,
        motivo: input.motivo,
        actor: input.actor,
      })
      .onConflictDoNothing({ target: ticketPaymentCorrections.idempotencyKey })
      .returning({ id: ticketPaymentCorrections.id });
    if (!filas[0]) {
      const carrera = await db
        .select()
        .from(ticketPaymentCorrections)
        .where(eq(ticketPaymentCorrections.idempotencyKey, input.key))
        .limit(1);
      const original = carrera[0] ? filaACorreccion(carrera[0]) : r;
      store.correcciones.set(input.key, original);
      return { ok: false, status: 409, error: "idempotency-key repetida", original };
    }
    store.correcciones.set(input.key, r);
    return { ok: true, status: 201, correccion: r };
  } catch (e) {
    if (esConflictoUnico(e)) {
      try {
        const previo = await db
          .select()
          .from(ticketPaymentCorrections)
          .where(eq(ticketPaymentCorrections.idempotencyKey, input.key))
          .limit(1);
        if (previo[0]) {
          const original = filaACorreccion(previo[0]);
          store.correcciones.set(input.key, original);
          return { ok: false, status: 409, error: "idempotency-key repetida", original };
        }
      } catch (e2) {
        if (esModoMulti()) throw aBaseNoDisponible(e2);
      }
      if (esModoMulti()) throw aBaseNoDisponible(e);
    } else if (esModoMulti()) {
      throw aBaseNoDisponible(e);
    }
    store.correcciones.set(input.key, r);
    return { ok: true, status: 201, correccion: r };
  }
}
