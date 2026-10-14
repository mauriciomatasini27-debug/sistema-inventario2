import { and, eq } from "drizzle-orm";
import { esModoMulti } from "../tenant-mode.js";
import { BaseNoDisponible, dbVivaTenant, type TenantDb } from "../server-db.js";
import { store } from "../store.js";
import type { Medio } from "../validation.js";
import {
  confirmarBorrador,
  descartarBorrador,
  editarBorrador,
  estadoCuenta,
  ingerirBorrador,
  registrarPago,
  type Borrador,
  type ConfianzaPorCampo,
  type Factura,
  type PagoProveedor,
  type ParcheBorrador,
  type RegistrarPagoInput,
} from "../../modules/purchases/facturas.js";
import { cerrarOrden } from "../../modules/purchases/proveedores.js";
import {
  matchearBorrador,
  vincular_auto,
  type MatchLogEntry,
  type OrdenMatchable,
} from "../../modules/purchases/matching.js";
import { normalizarCuit } from "../../modules/purchases/proveedores.js";
import {
  itemsADb,
  leerBorradorPorId,
  leerBorradorPorKey,
  leerFacturaPorId,
  leerFacturasPorCuit,
  leerOrdenCompleta,
  leerOrdenesDb,
  leerPagoPorKey,
  leerPagosPorCuit,
  unionOrdenes,
} from "../compras-db.js";
import {
  purchaseOrders,
  supplierDrafts,
  supplierInvoices,
  supplierMatchLog,
  supplierPayments,
} from "../../db/schema-proveedores.js";
import { registrarEgresoRetiro } from "./caja.js";

// PERS2-S14 (ADR-0057): borradores, confirmacion, descarte, matching, cuenta
// corriente y pagos a proveedores. DB primero via dbVivaTenant(); solo en
// single sin base usa la memoria particionada. En multi sin base
// dbVivaTenant lanza BaseNoDisponible y se propaga (la ruta responde 503).

function aBaseNoDisponible(e: unknown): BaseNoDisponible {
  return e instanceof BaseNoDisponible ? e : new BaseNoDisponible();
}

export interface RespuestaRepo {
  status: number;
  body: Record<string, unknown>;
}

// Centinela: el borrador se resolvio entre la validacion y la tx (carrera o
// replay en frio). La tx revierte y la ruta responde 409.
const RESUELTO = { resuelto: true };

export interface IngestaBorradorInput {
  readonly key: string;
  readonly origen: Borrador["origen"];
  readonly bytesRef: string;
  readonly esComprobante: boolean;
  readonly cuitTexto?: string | undefined;
  readonly nombreProveedor?: string | undefined;
  readonly fechaTexto?: string | undefined;
  readonly totalTexto?: string | undefined;
  readonly fotoPendiente: boolean;
  readonly ahoraIso: string;
}

// Ingesta FP (foto bot -> OCR sugerencia). Borrador MUTABLE; clave repetida
// => 200 con existente. DB-first con pre-check por idempotency-key.
export async function ingerirBorradorRepo(input: IngestaBorradorInput): Promise<RespuestaRepo> {
  const r = ingerirBorrador({
    idempotencyKey: input.key,
    origen: input.origen,
    bytesRef: input.bytesRef,
    esComprobante: input.esComprobante,
    ...(input.cuitTexto !== undefined ? { cuitTexto: input.cuitTexto } : {}),
    ...(input.nombreProveedor !== undefined ? { nombreProveedor: input.nombreProveedor } : {}),
    ...(input.fechaTexto !== undefined ? { fechaTexto: input.fechaTexto } : {}),
    ...(input.totalTexto !== undefined ? { totalTexto: input.totalTexto } : {}),
    fotoPendiente: input.fotoPendiente,
    ahoraIso: input.ahoraIso,
    vistos: store.borradorVistos,
  });
  if (r.status === 415 || r.status === 422) return { status: r.status, body: { error: r.error } };
  if (r.status === 200) {
    store.borradorVistos.set(input.key, r.borrador);
    store.borradores.set(r.borrador.id, r.borrador);
    return { status: 200, body: { draft_id: r.borrador.id, duplicado: true } };
  }

  const espejo = () => {
    store.borradorVistos.set(input.key, r.borrador);
    store.borradores.set(r.borrador.id, r.borrador);
  };

  const db = dbVivaTenant();
  if (!db) {
    espejo();
    return { status: 201, body: { draft_id: r.borrador.id, aviso_revisar: r.avisoRevisar } };
  }

  try {
    const previo = await leerBorradorPorKey(db, input.key);
    if (previo) {
      store.borradorVistos.set(input.key, previo.borrador);
      store.borradores.set(previo.borrador.id, previo.borrador);
      return { status: 200, body: { draft_id: previo.borrador.id, duplicado: true } };
    }
    await db
      .insert(supplierDrafts)
      .values({
        idempotencyKey: input.key,
        origen: r.borrador.origen,
        bytesRef: r.borrador.bytesRef,
        cuit: r.borrador.cuit,
        nombreProveedor: r.borrador.nombreProveedor,
        fechaIso: r.borrador.fechaIso,
        totalCentavos: r.borrador.totalCentavos,
        items: itemsADb(r.borrador.items),
        confianza: { ...r.borrador.confianza },
        estado: r.borrador.estado,
        fotoPendiente: r.borrador.fotoPendiente,
        confirmadoPor: null,
        facturaId: null,
        createdAt: new Date(r.borrador.creadoEn),
        venceAt: new Date(r.borrador.venceAt),
      })
      .onConflictDoNothing({ target: supplierDrafts.idempotencyKey })
      .returning({ id: supplierDrafts.id });
    // Carrera entre pre-check e insert: si el rival gano, 200 con existente.
    const carrera = await leerBorradorPorKey(db, input.key);
    if (carrera && carrera.borrador.bytesRef !== r.borrador.bytesRef) {
      store.borradorVistos.set(input.key, carrera.borrador);
      store.borradores.set(carrera.borrador.id, carrera.borrador);
      return { status: 200, body: { draft_id: carrera.borrador.id, duplicado: true } };
    }
    espejo();
    return { status: 201, body: { draft_id: r.borrador.id, aviso_revisar: r.avisoRevisar, fuente: "db" } };
  } catch (e) {
    if (esModoMulti()) throw aBaseNoDisponible(e);
    espejo();
    return { status: 201, body: { draft_id: r.borrador.id, aviso_revisar: r.avisoRevisar } };
  }
}

// Confirma 1 toque. UNICO camino que registra factura. DB-first: factura +
// actualizacion del borrador + match log + cierre de la OC vinculada entran
// en 1 tx; sin DB o ante error, la via memoria historica.
export async function confirmarBorradorRepo(input: {
  draftId: string;
  quien: string;
  ahoraIso: string;
}): Promise<RespuestaRepo> {
  const db = dbVivaTenant();
  const enMemoria = store.borradores.get(input.draftId);
  const base: Borrador | null =
    enMemoria ?? (db ? ((await leerBorradorPorId(db, input.draftId))?.borrador ?? null) : null);
  if (!base) return { status: 404, body: { error: "borrador inexistente" } };
  const r = confirmarBorrador(base, { quien: input.quien, ahoraIso: input.ahoraIso });
  if (r.status !== 201) return { status: r.status, body: { error: r.error } };

  if (!db) {
    return confirmarEnMemoria(r.borrador, r.factura, r.avisoRevisar, input.quien, input.ahoraIso);
  }

  try {
    const filaDraft = await asegurarFilaBorrador(db, base);
    const ordenesDb = await leerOrdenesDb(db);
    const ordenes = unionOrdenes(store.purchaseOrders.values(), ordenesDb);
    const uuidPorOrden = new Map(ordenesDb.map((o) => [o.matchable.id, o.uuid]));
    const m =
      r.borrador.cuit !== null && r.borrador.totalCentavos !== null
        ? vincular_auto({
            draftId: r.borrador.id,
            cuit: r.borrador.cuit,
            totalCentavos: r.borrador.totalCentavos,
            ordenes,
            ahoraIso: input.ahoraIso,
          })
        : null;

    let vinculadaId: string | null = null;
    let vinculoMotivo = "borrador sin cuit o total";
    if (m) {
      vinculoMotivo = m.motivo;
      const candidato = m.vinculado?.orderId ?? null;
      const uuid = candidato ? (uuidPorOrden.get(candidato) ?? null) : null;
      if (candidato && !uuid) {
        // OC solo en memoria (alta durante un corte): cierre historico.
        const oc = store.purchaseOrders.get(candidato);
        if (oc !== undefined && oc.estado === "abierta") {
          const c = cerrarOrden(oc, input.quien, input.ahoraIso);
          if (c.ok) {
            store.purchaseOrders.set(oc.id, c.orden);
            vinculadaId = oc.id;
          } else {
            vinculoMotivo = "orden ya no abierta";
          }
        } else {
          vinculoMotivo = "orden ya no abierta";
        }
      }
    }

    await db.transaction(async (tx) => {
      const bloq = await tx
        .select()
        .from(supplierDrafts)
        .where(eq(supplierDrafts.idempotencyKey, r.borrador.idempotencyKey))
        .for("update")
        .limit(1);
      if (!bloq[0] || bloq[0].estado !== "pendiente") throw RESUELTO;
      const ins = await tx
        .insert(supplierInvoices)
        .values({
          idempotencyKey: r.factura.idempotencyKey,
          draftId: filaDraft.id,
          supplierCuit: r.factura.supplierCuit,
          nombreProveedor: r.factura.nombreProveedor,
          tipo: r.factura.tipo,
          fechaIso: r.factura.fechaIso,
          totalCentavos: r.factura.totalCentavos,
          items: itemsADb(r.factura.items),
          compensatoriaDe: null,
          creadoPor: r.factura.creadoPor,
          createdAt: new Date(r.factura.creadoEn),
        })
        .onConflictDoNothing({ target: supplierInvoices.idempotencyKey })
        .returning({ id: supplierInvoices.id });
      const fila = ins[0];
      if (!fila) throw RESUELTO;
      await tx
        .update(supplierDrafts)
        .set({ estado: "confirmada", confirmadoPor: input.quien, facturaId: fila.id })
        .where(eq(supplierDrafts.idempotencyKey, r.borrador.idempotencyKey));
      // Cierre durable dentro de la misma tx: solo si sigue abierta. Si la
      // cerro otro camino entre el matching y aca, la factura queda igual y
      // el motivo lo dice (el perdedor de una carrera revierte todo: ve el
      // borrador ya resuelto en el bloqueo de arriba).
      if (m?.vinculado && vinculadaId === null && vinculoMotivo !== "orden ya no abierta") {
        const candidato = m.vinculado.orderId;
        if (uuidPorOrden.has(candidato) && candidato.startsWith("oc-")) {
          const tocadas = await tx
            .update(purchaseOrders)
            .set({ estado: "cerrada", cerradoEn: new Date(input.ahoraIso) })
            .where(
              and(
                eq(purchaseOrders.idempotencyKey, candidato.slice(3)),
                eq(purchaseOrders.estado, "abierta"),
              ),
            )
            .returning({ id: purchaseOrders.id });
          if (tocadas[0]) {
            vinculadaId = candidato;
          } else {
            vinculoMotivo = "orden ya no abierta";
          }
        }
      }
      if (m) {
        for (const e of m.log) {
          const orderUuid = uuidPorOrden.get(e.orderId);
          if (!orderUuid) continue;
          await tx.insert(supplierMatchLog).values({
            draftId: r.borrador.id,
            orderId: orderUuid,
            coincide: e.coincide,
            motivo:
              e.orderId === vinculadaId && e.coincide
                ? "auto-exacto: OC cerrada al confirmar"
                : e.motivo,
            createdAt: new Date(e.creadoEn),
          });
        }
      }
    });

    // Espejo memoria (identico estado al historico).
    store.borradores.set(r.borrador.id, r.borrador);
    store.borradorVistos.set(r.borrador.idempotencyKey, r.borrador);
    store.facturasProv.set(r.factura.id, r.factura);
    if (m) escribirLogMemoria(m.log, vinculadaId);
    if (vinculadaId) {
      const cerrada =
        store.purchaseOrders.get(vinculadaId) ?? (await leerOrdenCompleta(db, vinculadaId));
      if (cerrada && cerrada.estado !== "cerrada") {
        const c = cerrarOrden(cerrada, input.quien, input.ahoraIso);
        if (c.ok) {
          store.purchaseOrders.set(c.orden.id, c.orden);
          store.orderVistos.set(c.orden.idempotencyKey, c.orden);
        }
      } else if (cerrada) {
        store.purchaseOrders.set(cerrada.id, cerrada);
        store.orderVistos.set(cerrada.idempotencyKey, cerrada);
      }
    }
    return {
      status: 201,
      body: {
        factura_id: r.factura.id,
        total_centavos: r.factura.totalCentavos.toString(),
        aviso_revisar: r.avisoRevisar,
        vinculo: vinculadaId !== null ? { order_id: vinculadaId } : null,
        vinculo_motivo: vinculoMotivo,
        match_intentos: m ? m.log.length : 0,
        fuente: "db",
      },
    };
  } catch (e) {
    if (e === RESUELTO) {
      return { status: 409, body: { error: "borrador ya resuelto (confirmado o descartado)" } };
    }
    if (esModoMulti()) throw aBaseNoDisponible(e);
    // Caida de DB: la tx revirtio; via memoria como antes.
    if (!enMemoria) return { status: 404, body: { error: "borrador inexistente" } };
    const r2 = confirmarBorrador(enMemoria, { quien: input.quien, ahoraIso: input.ahoraIso });
    if (r2.status !== 201) return { status: r2.status, body: { error: r2.error } };
    return confirmarEnMemoria(r2.borrador, r2.factura, r2.avisoRevisar, input.quien, input.ahoraIso);
  }
}

// La fila del borrador siempre existe en DB-first: si el alta fue durante un
// corte de DB se rellena pendiente (el dominio ya valido el pase a confirmada).
async function asegurarFilaBorrador(db: TenantDb, base: Borrador): Promise<{ id: string }> {
  const previo = await leerBorradorPorKey(db, base.idempotencyKey);
  if (previo) return { id: previo.fila.id };
  await db
    .insert(supplierDrafts)
    .values({
      idempotencyKey: base.idempotencyKey,
      origen: base.origen,
      bytesRef: base.bytesRef,
      cuit: base.cuit,
      nombreProveedor: base.nombreProveedor,
      fechaIso: base.fechaIso,
      totalCentavos: base.totalCentavos,
      items: itemsADb(base.items),
      confianza: { ...base.confianza },
      estado: "pendiente",
      fotoPendiente: base.fotoPendiente,
      confirmadoPor: null,
      facturaId: null,
      createdAt: new Date(base.creadoEn),
      venceAt: new Date(base.venceAt),
    })
    .onConflictDoNothing({ target: supplierDrafts.idempotencyKey });
  const fila = await leerBorradorPorKey(db, base.idempotencyKey);
  if (!fila) throw new Error("borrador sin fila");
  return { id: fila.fila.id };
}

function escribirLogMemoria(log: ReadonlyArray<MatchLogEntry>, vinculadaId: string | null): void {
  for (const e of log) {
    if (store.supplierMatchLog.some((x) => x.id === e.id)) continue;
    store.supplierMatchLog.push(
      e.orderId === vinculadaId && e.coincide
        ? { ...e, motivo: "auto-exacto: OC cerrada al confirmar" }
        : e,
    );
  }
}

// Via historica exacta (sin DB o fallback): matching sobre memoria, cierre en
// memoria y log en memoria.
function confirmarEnMemoria(
  borrador: Borrador,
  factura: Factura,
  avisoRevisar: boolean,
  quien: string,
  ahoraIso: string,
): RespuestaRepo {
  store.borradores.set(borrador.id, borrador);
  store.borradorVistos.set(borrador.idempotencyKey, borrador);
  store.facturasProv.set(factura.id, factura);
  let vinculo: { order_id: string } | null = null;
  let vinculoMotivo = "borrador sin cuit o total";
  let matchIntentos = 0;
  if (borrador.cuit !== null && borrador.totalCentavos !== null) {
    const m = vincular_auto({
      draftId: borrador.id,
      cuit: borrador.cuit,
      totalCentavos: borrador.totalCentavos,
      ordenes: [...store.purchaseOrders.values()].map((o) => ({
        id: o.id,
        supplierCuit: o.supplierCuit,
        estado: o.estado,
        totalCentavos: o.totalCentavos,
      })),
      ahoraIso,
    });
    matchIntentos = m.log.length;
    vinculoMotivo = m.motivo;
    let vinculadaId: string | null = null;
    if (m.vinculado !== null) {
      const oc = store.purchaseOrders.get(m.vinculado.orderId);
      if (oc !== undefined && oc.estado === "abierta") {
        const c = cerrarOrden(oc, quien, ahoraIso);
        if (c.ok) {
          store.purchaseOrders.set(oc.id, c.orden);
          vinculadaId = oc.id;
        } else {
          vinculoMotivo = "orden ya no abierta";
        }
      } else {
        vinculoMotivo = "orden ya no abierta";
      }
    }
    escribirLogMemoria(m.log, vinculadaId);
    if (vinculadaId !== null) vinculo = { order_id: vinculadaId };
  }
  return {
    status: 201,
    body: {
      factura_id: factura.id,
      total_centavos: factura.totalCentavos.toString(),
      aviso_revisar: avisoRevisar,
      vinculo,
      vinculo_motivo: vinculoMotivo,
      match_intentos: matchIntentos,
    },
  };
}

// Descarta borrador pendiente. DB-first con espejo; sin DB o ante error,
// memoria como antes.
export async function descartarBorradorRepo(input: {
  draftId: string;
  ahoraIso: string;
}): Promise<RespuestaRepo> {
  const enMemoria = store.borradores.get(input.draftId);
  const db = dbVivaTenant();
  if (!db) {
    if (!enMemoria) return { status: 404, body: { error: "borrador inexistente" } };
    const r = descartarBorrador(enMemoria, input.ahoraIso);
    if (r.status !== 200) return { status: r.status, body: { error: r.error } };
    store.borradores.set(input.draftId, r.borrador);
    return { status: 200, body: { draft_id: r.borrador.id, estado: r.borrador.estado } };
  }

  try {
    const base = enMemoria ?? (await leerBorradorPorId(db, input.draftId))?.borrador ?? null;
    if (!base) return { status: 404, body: { error: "borrador inexistente" } };
    const r = descartarBorrador(base, input.ahoraIso);
    if (r.status !== 200) return { status: r.status, body: { error: r.error } };
    await db
      .update(supplierDrafts)
      .set({ estado: r.borrador.estado })
      .where(eq(supplierDrafts.idempotencyKey, r.borrador.idempotencyKey));
    store.borradores.set(r.borrador.id, r.borrador);
    store.borradorVistos.set(r.borrador.idempotencyKey, r.borrador);
    return { status: 200, body: { draft_id: r.borrador.id, estado: r.borrador.estado, fuente: "db" } };
  } catch (e) {
    if (esModoMulti()) throw aBaseNoDisponible(e);
    if (!enMemoria) return { status: 404, body: { error: "borrador inexistente" } };
    const r = descartarBorrador(enMemoria, input.ahoraIso);
    if (r.status !== 200) return { status: r.status, body: { error: r.error } };
    store.borradores.set(input.draftId, r.borrador);
    return { status: 200, body: { draft_id: r.borrador.id, estado: r.borrador.estado } };
  }
}

// Matching borrador vs OCs (tolerancia 1%). Solo lectura: el log durable lo
// escribe el confirm al vincular. DB-first con union memoria + DB.
export async function matchearBorradorRepo(input: { draftId: string }): Promise<RespuestaRepo> {
  const responder = (
    draftId: string,
    cuit: string,
    totalCentavos: bigint,
    ordenes: ReadonlyArray<OrdenMatchable>,
  ): RespuestaRepo => {
    const r = matchearBorrador({ draftId, cuit, totalCentavos, ordenes, ahoraIso: new Date().toISOString() });
    return {
      status: 200,
      body: {
        candidatos: r.candidatos.map((c) => ({
          order_id: c.orderId,
          diferencia_centavos: c.diferenciaCentavos.toString(),
        })),
        intentos: r.log.length,
      },
    };
  };

  const enMemoria = store.borradores.get(input.draftId);
  const db = dbVivaTenant();
  if (!db) {
    if (!enMemoria) return { status: 404, body: { error: "borrador inexistente" } };
    if (enMemoria.cuit === null || enMemoria.totalCentavos === null) {
      return { status: 422, body: { error: "borrador sin cuit o total" } };
    }
    return responder(
      enMemoria.id,
      enMemoria.cuit,
      enMemoria.totalCentavos,
      [...store.purchaseOrders.values()].map((o) => ({
        id: o.id,
        supplierCuit: o.supplierCuit,
        estado: o.estado,
        totalCentavos: o.totalCentavos,
      })),
    );
  }

  try {
    const borrador = enMemoria ?? (await leerBorradorPorId(db, input.draftId))?.borrador ?? null;
    if (!borrador) return { status: 404, body: { error: "borrador inexistente" } };
    if (borrador.cuit === null || borrador.totalCentavos === null) {
      return { status: 422, body: { error: "borrador sin cuit o total" } };
    }
    return responder(
      borrador.id,
      borrador.cuit,
      borrador.totalCentavos,
      unionOrdenes(store.purchaseOrders.values(), await leerOrdenesDb(db)),
    );
  } catch (e) {
    if (esModoMulti()) throw aBaseNoDisponible(e);
    if (!enMemoria) return { status: 404, body: { error: "borrador inexistente" } };
    if (enMemoria.cuit === null || enMemoria.totalCentavos === null) {
      return { status: 422, body: { error: "borrador sin cuit o total" } };
    }
    return responder(
      enMemoria.id,
      enMemoria.cuit,
      enMemoria.totalCentavos,
      [...store.purchaseOrders.values()].map((o) => ({
        id: o.id,
        supplierCuit: o.supplierCuit,
        estado: o.estado,
        totalCentavos: o.totalCentavos,
      })),
    );
  }
}

// Estado de cuenta (facturado/pagado/saldo). Solo lectura. DB-first con union
// memoria (altas durante cortes) + DB.
export async function estadoCuentaRepo(input: { cuit: string }): Promise<{
  totalFacturadoCentavos: string;
  totalPagadoCentavos: string;
  saldoCentavos: string;
}> {
  const ncuit = normalizarCuit(input.cuit);
  const soloMemoria = () =>
    estadoCuenta(ncuit, [...store.facturasProv.values()], [...store.pagosProv.values()]);

  const db = dbVivaTenant();
  if (!db) return aJson(soloMemoria());

  try {
    const facturas = [...store.facturasProv.values()];
    const vistosF = new Set(facturas.map((f) => f.id));
    for (const f of await leerFacturasPorCuit(db, ncuit)) {
      if (!vistosF.has(f.id)) facturas.push(f);
    }
    const pagos = [...store.pagosProv.values()];
    const vistosP = new Set(pagos.map((p) => p.id));
    for (const p of await leerPagosPorCuit(db, ncuit)) {
      if (!vistosP.has(p.id)) pagos.push(p);
    }
    return aJson(estadoCuenta(ncuit, facturas, pagos));
  } catch (e) {
    if (esModoMulti()) throw aBaseNoDisponible(e);
    return aJson(soloMemoria());
  }
}

function aJson(cuenta: { totalFacturadoCentavos: bigint; totalPagadoCentavos: bigint; saldoCentavos: bigint }): {
  totalFacturadoCentavos: string;
  totalPagadoCentavos: string;
  saldoCentavos: string;
} {
  return {
    totalFacturadoCentavos: cuenta.totalFacturadoCentavos.toString(),
    totalPagadoCentavos: cuenta.totalPagadoCentavos.toString(),
    saldoCentavos: cuenta.saldoCentavos.toString(),
  };
}

export interface PagoProveedorInput {
  readonly key: string;
  readonly facturaId?: string | undefined;
  readonly supplierCuit: string;
  readonly montoCentavos: bigint;
  readonly metodo: Medio;
  readonly fechaIso: string;
  readonly creadoPor: string;
  readonly ahoraIso: string;
}

async function espejoPago(pago: PagoProveedor, montoCentavos: bigint, metodo: Medio): Promise<void> {
  store.pagosProv.set(pago.idempotencyKey, pago);
  await registrarEgresoRetiro({ key: pago.idempotencyKey, montoCentavos, metodo });
}

// Pago a proveedor + egreso caja. DB-first con pre-check por idempotency-key
// (409 real aunque la memoria este fria); el egreso va por el repo de caja.
// Sin DB o ante error, la via memoria historica.
export async function registrarPagoProveedorRepo(input: PagoProveedorInput): Promise<RespuestaRepo> {
  const cuit = normalizarCuit(input.supplierCuit);

  const db = dbVivaTenant();
  if (!db) {
    return viaMemoria(input.facturaId, input.key, cuit, input, [...store.pagosProv.values()]);
  }

  try {
    const factura =
      input.facturaId !== undefined
        ? ((store.facturasProv.get(input.facturaId) ??
            (await leerFacturaPorId(db, input.facturaId))?.factura) ??
          null)
        : null;
    if (input.facturaId !== undefined && !factura) {
      return { status: 404, body: { error: "factura inexistente" } };
    }
    const pagosPrevios = [...store.pagosProv.values()];
    const vistosP = new Set(pagosPrevios.map((p) => p.id));
    for (const p of await leerPagosPorCuit(db, cuit)) {
      if (!vistosP.has(p.id)) pagosPrevios.push(p);
    }
    const comando: RegistrarPagoInput = {
      idempotencyKey: input.key,
      ...(factura ? { factura } : {}),
      supplierCuit: cuit,
      montoCentavos: input.montoCentavos,
      metodo: input.metodo,
      fechaIso: input.fechaIso,
      creadoPor: input.creadoPor,
      ahoraIso: input.ahoraIso,
      vistos: store.pagosProv,
      pagosPrevios,
    };
    const r = registrarPago(comando);
    if (r.status !== 201) return { status: r.status, body: { error: r.error } };

    // Pre-check: replay en frio responde 409 con el mensaje exacto del dominio
    // (re-evalua contra la fila durable como vistos).
    const previo = await leerPagoPorKey(db, input.key);
    if (previo) {
      const r2 = registrarPago({
        ...comando,
        vistos: new Map([[input.key, previo.pago]]),
      });
      return {
        status: 409,
        body: { error: r2.status !== 201 ? r2.error : "idempotency-key repetida" },
      };
    }

    const filas = await db
      .insert(supplierPayments)
      .values({
        idempotencyKey: input.key,
        facturaId: factura ? await facturaUuid(db, factura) : null,
        supplierCuit: r.pago.supplierCuit,
        montoCentavos: r.pago.montoCentavos,
        metodo: r.pago.metodo,
        categoriaId: "pago_proveedor",
        creadoPor: r.pago.creadoPor,
        createdAt: new Date(r.pago.creadoEn),
      })
      .onConflictDoNothing({ target: supplierPayments.idempotencyKey })
      .returning({ id: supplierPayments.id });
    if (!filas[0]) {
      // Carrera entre pre-check e insert: 409 con el mensaje del dominio.
      const rival = await leerPagoPorKey(db, input.key);
      const r2 = registrarPago({
        ...comando,
        vistos: new Map(rival ? [[input.key, rival.pago]] : []),
      });
      return {
        status: 409,
        body: { error: r2.status !== 201 ? r2.error : "idempotency-key repetida" },
      };
    }
    await espejoPago(r.pago, r.egresoCaja.montoCentavos, r.egresoCaja.metodo);
    return {
      status: 201,
      body: { pago_id: r.pago.id, monto_centavos: r.pago.montoCentavos.toString(), fuente: "db" },
    };
  } catch (e) {
    if (esModoMulti()) throw aBaseNoDisponible(e);
    return viaMemoria(input.facturaId, input.key, cuit, input, [...store.pagosProv.values()]);
  }
}

async function facturaUuid(db: TenantDb, factura: Factura): Promise<string | null> {
  const filas = await db
    .select({ id: supplierInvoices.id })
    .from(supplierInvoices)
    .where(eq(supplierInvoices.idempotencyKey, factura.idempotencyKey))
    .limit(1);
  return filas[0]?.id ?? null;
}

async function viaMemoria(
  facturaId: string | undefined,
  key: string,
  cuit: string,
  input: PagoProveedorInput,
  pagosPrevios: PagoProveedor[],
): Promise<RespuestaRepo> {
  const factura = facturaId !== undefined ? (store.facturasProv.get(facturaId) ?? null) : null;
  if (facturaId !== undefined && !factura) {
    return { status: 404, body: { error: "factura inexistente" } };
  }
  const r = registrarPago({
    idempotencyKey: key,
    ...(factura ? { factura } : {}),
    supplierCuit: cuit,
    montoCentavos: input.montoCentavos,
    metodo: input.metodo,
    fechaIso: input.fechaIso,
    creadoPor: input.creadoPor,
    ahoraIso: input.ahoraIso,
    vistos: store.pagosProv,
    pagosPrevios,
  });
  if (r.status !== 201) return { status: r.status, body: { error: r.error } };
  await espejoPago(r.pago, r.egresoCaja.montoCentavos, r.egresoCaja.metodo);
  return { status: 201, body: { pago_id: r.pago.id, monto_centavos: r.pago.montoCentavos.toString() } };
}

// PERS2-S20 (ADR-0060): ciclo del borrador del canal OCR (clave `ocr-<jobId>`).
// Mismo contrato que el lane puro mas persistencia DB-first; sin DB o ante
// error, memoria como antes. En multi sin base dbVivaTenant lanza y se propaga.

export interface IngestaOcrInput {
  readonly key: string;
  readonly origen: Borrador["origen"];
  readonly bytesRef: string;
  readonly cuitTexto?: string | undefined;
  readonly nombreProveedor?: string | undefined;
  readonly fechaTexto?: string | undefined;
  readonly totalTexto?: string | undefined;
  readonly confianza: ConfianzaPorCampo;
  readonly fotoPendiente: boolean;
  readonly ahoraIso: string;
}

export type IngestaOcrResultado =
  | { status: 201; borrador: Borrador; avisoRevisar: boolean }
  | { status: 200; borrador: Borrador; duplicado: true }
  | { status: 415; error: string }
  | { status: 422; error: string };

export async function ingerirBorradorOcrRepo(input: IngestaOcrInput): Promise<IngestaOcrResultado> {
  const r = ingerirBorrador({
    idempotencyKey: input.key,
    origen: input.origen,
    bytesRef: input.bytesRef,
    esComprobante: true,
    ...(input.cuitTexto !== undefined ? { cuitTexto: input.cuitTexto } : {}),
    ...(input.nombreProveedor !== undefined ? { nombreProveedor: input.nombreProveedor } : {}),
    ...(input.fechaTexto !== undefined ? { fechaTexto: input.fechaTexto } : {}),
    ...(input.totalTexto !== undefined ? { totalTexto: input.totalTexto } : {}),
    confianza: { ...input.confianza },
    fotoPendiente: input.fotoPendiente,
    ahoraIso: input.ahoraIso,
    vistos: store.borradorVistos,
  });
  if (r.status === 415 || r.status === 422) return { status: r.status, error: r.error };
  if (r.status === 200) {
    store.borradorVistos.set(input.key, r.borrador);
    store.borradores.set(r.borrador.id, r.borrador);
    return { status: 200, borrador: r.borrador, duplicado: true };
  }

  const espejo = () => {
    store.borradorVistos.set(input.key, r.borrador);
    store.borradores.set(r.borrador.id, r.borrador);
  };

  const db = dbVivaTenant();
  if (!db) {
    espejo();
    return { status: 201, borrador: r.borrador, avisoRevisar: r.avisoRevisar };
  }

  try {
    const previo = await leerBorradorPorKey(db, input.key);
    if (previo) {
      store.borradorVistos.set(input.key, previo.borrador);
      store.borradores.set(previo.borrador.id, previo.borrador);
      return { status: 200, borrador: previo.borrador, duplicado: true };
    }
    await db
      .insert(supplierDrafts)
      .values({
        idempotencyKey: input.key,
        origen: r.borrador.origen,
        bytesRef: r.borrador.bytesRef,
        cuit: r.borrador.cuit,
        nombreProveedor: r.borrador.nombreProveedor,
        fechaIso: r.borrador.fechaIso,
        totalCentavos: r.borrador.totalCentavos,
        items: itemsADb(r.borrador.items),
        confianza: { ...r.borrador.confianza },
        estado: r.borrador.estado,
        fotoPendiente: r.borrador.fotoPendiente,
        confirmadoPor: null,
        facturaId: null,
        createdAt: new Date(r.borrador.creadoEn),
        venceAt: new Date(r.borrador.venceAt),
      })
      .onConflictDoNothing({ target: supplierDrafts.idempotencyKey });
    espejo();
    return { status: 201, borrador: r.borrador, avisoRevisar: r.avisoRevisar };
  } catch (e) {
    if (esModoMulti()) throw aBaseNoDisponible(e);
    espejo();
    return { status: 201, borrador: r.borrador, avisoRevisar: r.avisoRevisar };
  }
}

// Lectura de borrador para el canal OCR: memoria primero, DB despues.
export async function leerBorradorOcrRepo(draftId: string): Promise<Borrador | null> {
  const enMemoria = store.borradores.get(draftId);
  if (enMemoria) return enMemoria;
  const db = dbVivaTenant();
  if (!db) return null;
  try {
    const fila = await leerBorradorPorId(db, draftId);
    if (fila) {
      store.borradores.set(fila.borrador.id, fila.borrador);
      store.borradorVistos.set(fila.borrador.idempotencyKey, fila.borrador);
      return fila.borrador;
    }
    return null;
  } catch (e) {
    if (esModoMulti()) throw aBaseNoDisponible(e);
    return null;
  }
}

export type EdicionOcrResultado =
  | { status: 200; borrador: Borrador }
  | { status: 404; error: string }
  | { status: 409; error: string }
  | { status: 410; error: string }
  | { status: 422; error: string };

export async function editarBorradorOcrRepo(input: {
  draftId: string;
  parche: ParcheBorrador;
  ahoraIso: string;
}): Promise<EdicionOcrResultado> {
  const base = await leerBorradorOcrRepo(input.draftId);
  if (!base) return { status: 404, error: "borrador inexistente" };
  const r = editarBorrador(base, input.parche, input.ahoraIso);
  if (r.status !== 200) return r;
  store.borradores.set(r.borrador.id, r.borrador);
  store.borradorVistos.set(r.borrador.idempotencyKey, r.borrador);
  const db = dbVivaTenant();
  if (!db) return r;
  try {
    const previo = await leerBorradorPorKey(db, r.borrador.idempotencyKey);
    const valores = {
      cuit: r.borrador.cuit,
      nombreProveedor: r.borrador.nombreProveedor,
      fechaIso: r.borrador.fechaIso,
      totalCentavos: r.borrador.totalCentavos,
      items: itemsADb(r.borrador.items),
      confianza: { ...r.borrador.confianza },
      fotoPendiente: r.borrador.fotoPendiente,
    };
    if (previo) {
      await db
        .update(supplierDrafts)
        .set(valores)
        .where(eq(supplierDrafts.idempotencyKey, r.borrador.idempotencyKey));
    } else {
      await db
        .insert(supplierDrafts)
        .values({
          idempotencyKey: r.borrador.idempotencyKey,
          origen: r.borrador.origen,
          bytesRef: r.borrador.bytesRef,
          estado: r.borrador.estado,
          confirmadoPor: null,
          facturaId: null,
          createdAt: new Date(r.borrador.creadoEn),
          venceAt: new Date(r.borrador.venceAt),
          ...valores,
        })
        .onConflictDoNothing({ target: supplierDrafts.idempotencyKey });
    }
    return r;
  } catch (e) {
    if (esModoMulti()) throw aBaseNoDisponible(e);
    return r;
  }
}

export type ConfirmacionOcrResultado =
  | { status: 201; borrador: Borrador; factura: Factura; avisoRevisar: boolean }
  | { status: 404; error: string }
  | { status: 409; error: string }
  | { status: 410; error: string }
  | { status: 422; error: string };

export async function confirmarBorradorOcrRepo(input: {
  draftId: string;
  quien: string;
  ahoraIso: string;
}): Promise<ConfirmacionOcrResultado> {
  const base = await leerBorradorOcrRepo(input.draftId);
  if (!base) return { status: 404, error: "borrador inexistente" };
  const r = confirmarBorrador(base, { quien: input.quien, ahoraIso: input.ahoraIso });
  if (r.status !== 201) return { status: r.status, error: r.error };
  const espejo = () => {
    store.borradores.set(r.borrador.id, r.borrador);
    store.borradorVistos.set(r.borrador.idempotencyKey, r.borrador);
    store.facturasProv.set(r.factura.id, r.factura);
  };
  const db = dbVivaTenant();
  if (!db) {
    espejo();
    return { status: 201, borrador: r.borrador, factura: r.factura, avisoRevisar: r.avisoRevisar };
  }
  try {
    const filaDraft = await asegurarFilaBorrador(db, base);
    const ins = await db
      .insert(supplierInvoices)
      .values({
        idempotencyKey: r.factura.idempotencyKey,
        draftId: filaDraft.id,
        supplierCuit: r.factura.supplierCuit,
        nombreProveedor: r.factura.nombreProveedor,
        tipo: r.factura.tipo,
        fechaIso: r.factura.fechaIso,
        totalCentavos: r.factura.totalCentavos,
        items: itemsADb(r.factura.items),
        compensatoriaDe: null,
        creadoPor: r.factura.creadoPor,
        createdAt: new Date(r.factura.creadoEn),
      })
      .onConflictDoNothing({ target: supplierInvoices.idempotencyKey })
      .returning({ id: supplierInvoices.id });
    const fila = ins[0];
    if (!fila) return { status: 409, error: "borrador ya resuelto (confirmado o descartado)" };
    await db
      .update(supplierDrafts)
      .set({ estado: "confirmada", confirmadoPor: input.quien, facturaId: fila.id })
      .where(eq(supplierDrafts.idempotencyKey, r.borrador.idempotencyKey));
    espejo();
    return { status: 201, borrador: r.borrador, factura: r.factura, avisoRevisar: r.avisoRevisar };
  } catch (e) {
    if (esModoMulti()) throw aBaseNoDisponible(e);
    espejo();
    return { status: 201, borrador: r.borrador, factura: r.factura, avisoRevisar: r.avisoRevisar };
  }
}

export type DescarteOcrResultado =
  | { status: 200; borrador: Borrador }
  | { status: 404; error: string }
  | { status: 409; error: string }
  | { status: 410; error: string };

export async function descartarBorradorOcrRepo(input: {
  draftId: string;
  ahoraIso: string;
}): Promise<DescarteOcrResultado> {
  const base = await leerBorradorOcrRepo(input.draftId);
  if (!base) return { status: 404, error: "borrador inexistente" };
  const r = descartarBorrador(base, input.ahoraIso);
  if (r.status !== 200) return r;
  store.borradores.set(r.borrador.id, r.borrador);
  store.borradorVistos.set(r.borrador.idempotencyKey, r.borrador);
  const db = dbVivaTenant();
  if (!db) return r;
  try {
    await db
      .update(supplierDrafts)
      .set({ estado: r.borrador.estado })
      .where(eq(supplierDrafts.idempotencyKey, r.borrador.idempotencyKey));
    return r;
  } catch (e) {
    if (esModoMulti()) throw aBaseNoDisponible(e);
    return r;
  }
}
