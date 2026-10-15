import { esModoMulti } from "../tenant-mode.js";
import { BaseNoDisponible } from "../server-db.js";
import { store, type StoredFiscalDoc, type StoredMovement, type StoredReturn, type StoredStockMovement, type StoredTicket } from "../store.js";
import type { CierreOk } from "../../modules/cash/cierre.js";
import type { ConciliarOk, Drop, DropOk, Turno } from "../../modules/cash/turnos.js";
import type { AuditEntry, ReversionOk } from "../../modules/cash/reversion.js";
import type { Ajuste } from "../../modules/pricing/precios.js";
import type { Borrador, Factura, PagoProveedor } from "../../modules/purchases/facturas.js";
import type { PurchaseOrder, Supplier } from "../../modules/purchases/proveedores.js";
import type { MatchLogEntry } from "../../modules/purchases/matching.js";
import type { Payee } from "../../modules/payments/beneficiarios.js";
import type { PagoConfirmado, PaymentOrder } from "../../modules/payments/ordenes.js";
import type { RevocacionLink, TicketLinkEmitido } from "../../modules/sales/ticket_link.js";
import type { CorreccionOk } from "../../modules/sales/correccion_medio.js";
import type { WizardEstado } from "../../modules/fiscal/wizard.js";
import type { CuentaServicio } from "../../modules/utilities/cuentas.js";
import type { FacturaServicio } from "../../modules/utilities/facturas_servicios.js";

export type { StoredFiscalDoc, StoredMovement, StoredReturn, StoredStockMovement, StoredTicket };

// Puerto ARQ-S4: la elección memoria-vs-DB se cierra una sola vez en la
// factoría de abajo. Quien llama usa el puerto y nunca vuelve a preguntar el
// modo para este camino dual.
export interface Almacen<T> {
  obtener(clave: string): T | undefined;
  guardar(clave: string, valor: T): void;
  contiene(clave: string): boolean;
  comoMapaSoloLectura(): ReadonlyMap<string, T>;
  anteFalloPersistencia(error: unknown): void;
}

// El dominio de caja muta las colecciones que recibe;
// mapaVivo entrega el mapa vivo para ese traspaso sin reabrir el modo.
export interface AlmacenVivo<T> extends Almacen<T> {
  mapaVivo(): Map<string, T>;
}

// Colecciones append-only de caja sin clave;
// listar entrega el arreglo vivo con espejo memoria.
export interface ListaAlmacen<T> {
  listar(): T[];
  agregar(valor: T): void;
  anteFalloPersistencia(error: unknown): void;
}

// Avisos WA en memoria; vivos entrega el Set vivo que el dominio muta.
export interface ConjuntoAlmacen {
  contiene(valor: string): boolean;
  agregar(valor: string): void;
  vivos(): Set<string>;
  anteFalloPersistencia(error: unknown): void;
}

export interface QrRecibo {
  numeroOperacion: string;
  montoCentavos: string;
  estado: string;
  idemKey: string;
}

export interface VencimientoCaja {
  id: string;
  concepto: string;
  venceEl: string;
  montoCentavos: string;
  estado: string;
}

function crearAlmacenMemoria<T>(mapa: Map<string, T>, anteFallo: (error: unknown) => void): Almacen<T> {
  return {
    obtener: (clave) => mapa.get(clave),
    guardar: (clave, valor) => {
      mapa.set(clave, valor);
    },
    contiene: (clave) => mapa.has(clave),
    comoMapaSoloLectura: () => mapa,
    anteFalloPersistencia: anteFallo,
  };
}

function aBaseNoDisponible(e: unknown): BaseNoDisponible {
  return e instanceof BaseNoDisponible ? e : new BaseNoDisponible();
}

function anteFalloSegunModo(): (error: unknown) => void {
  if (esModoMulti()) {
    return (e) => {
      throw aBaseNoDisponible(e);
    };
  }
  return () => {};
}

function crearAlmacenVivo<T>(mapa: Map<string, T>): AlmacenVivo<T> {
  const anteFallo = anteFalloSegunModo();
  return {
    obtener: (clave) => mapa.get(clave),
    guardar: (clave, valor) => {
      mapa.set(clave, valor);
    },
    contiene: (clave) => mapa.has(clave),
    comoMapaSoloLectura: () => mapa,
    mapaVivo: () => mapa,
    anteFalloPersistencia: anteFallo,
  };
}

function crearLista<T>(lista: T[]): ListaAlmacen<T> {
  const anteFallo = anteFalloSegunModo();
  return {
    listar: () => lista,
    agregar: (valor) => {
      lista.push(valor);
    },
    anteFalloPersistencia: anteFallo,
  };
}

function crearConjunto(conjunto: Set<string>): ConjuntoAlmacen {
  const anteFallo = anteFalloSegunModo();
  return {
    contiene: (valor) => conjunto.has(valor),
    agregar: (valor) => {
      conjunto.add(valor);
    },
    vivos: () => conjunto,
    anteFalloPersistencia: anteFallo,
  };
}

// Corte 1: solo ajustes. En multi el fallo de DB se propaga como
// BaseNoDisponible; en single la llamada sigue hacia memoria.
export function crearAlmacenAjustes(): Almacen<Ajuste> {
  const mapa = store.ajustes;
  if (esModoMulti()) {
    return crearAlmacenMemoria(mapa, (e) => {
      throw aBaseNoDisponible(e);
    });
  }
  return crearAlmacenMemoria(mapa, () => {});
}

// Corte 2: mapas de caja. Misma politica que ajustes.
export function crearAlmacenCierres(): AlmacenVivo<CierreOk> {
  return crearAlmacenVivo(store.cierres);
}

export function crearAlmacenTurnos(): AlmacenVivo<Turno> {
  return crearAlmacenVivo(store.turnos);
}

export function crearAlmacenShiftKeys(): AlmacenVivo<string> {
  return crearAlmacenVivo(store.shiftKeys);
}

export function crearAlmacenTurnoVistos(): AlmacenVivo<ConciliarOk> {
  return crearAlmacenVivo(store.turnoVistos);
}

export function crearAlmacenDrops(): AlmacenVivo<Drop> {
  return crearAlmacenVivo(store.drops);
}

export function crearAlmacenDropVistos(): AlmacenVivo<DropOk> {
  return crearAlmacenVivo(store.dropVistos);
}

export function crearAlmacenReversiones(): AlmacenVivo<string> {
  return crearAlmacenVivo(store.reversiones);
}

export function crearAlmacenReversionVistos(): AlmacenVivo<ReversionOk> {
  return crearAlmacenVivo(store.reversionVistos);
}

export function crearAlmacenQrRecibos(): AlmacenVivo<QrRecibo> {
  return crearAlmacenVivo(store.qrRecibos);
}

export function crearAlmacenVencimientosCaja(): AlmacenVivo<VencimientoCaja> {
  return crearAlmacenVivo(store.vencimientosCaja);
}

export function crearListaMovimientos(): ListaAlmacen<StoredMovement> {
  return crearLista(store.movements);
}

export function crearListaAuditoria(): ListaAlmacen<AuditEntry> {
  return crearLista(store.auditoria);
}

export function crearConjuntoWaEnviados(): ConjuntoAlmacen {
  return crearConjunto(store.waEnviados);
}

// Corte 3: mapas/colecciones de facturas-proveedor. Misma politica que caja:
// en multi el fallo de DB se propaga como BaseNoDisponible; en single la
// llamada sigue hacia memoria.
export function crearAlmacenBorradores(): AlmacenVivo<Borrador> {
  return crearAlmacenVivo(store.borradores);
}

export function crearAlmacenBorradorVistos(): AlmacenVivo<Borrador> {
  return crearAlmacenVivo(store.borradorVistos);
}

export function crearAlmacenFacturasProv(): AlmacenVivo<Factura> {
  return crearAlmacenVivo(store.facturasProv);
}

export function crearAlmacenPagosProv(): AlmacenVivo<PagoProveedor> {
  return crearAlmacenVivo(store.pagosProv);
}

export function crearAlmacenPurchaseOrders(): AlmacenVivo<PurchaseOrder> {
  return crearAlmacenVivo(store.purchaseOrders);
}

export function crearAlmacenOrderVistos(): AlmacenVivo<PurchaseOrder> {
  return crearAlmacenVivo(store.orderVistos);
}

export function crearListaSupplierMatchLog(): ListaAlmacen<MatchLogEntry> {
  return crearLista(store.supplierMatchLog);
}

// Corte 4: mapas y contador de ordenes-pago. Misma politica que caja: en
// multi el fallo de DB se propaga como BaseNoDisponible; en single la
// llamada sigue hacia memoria. El contador no toca DB y no tiene fallo.
export function crearAlmacenPayees(): AlmacenVivo<Payee> {
  return crearAlmacenVivo(store.payees);
}

export function crearAlmacenPaymentOrders(): AlmacenVivo<PaymentOrder> {
  return crearAlmacenVivo(store.paymentOrders);
}

export function crearAlmacenPaymentOrderVistos(): AlmacenVivo<PaymentOrder> {
  return crearAlmacenVivo(store.paymentOrderVistos);
}

export function crearAlmacenPaymentPagosVistos(): AlmacenVivo<PagoConfirmado> {
  return crearAlmacenVivo(store.paymentPagosVistos);
}

export interface ContadorAlmacen {
  leer(): number;
  fijar(valor: number): void;
}

export function crearContadorOrdenesPago(): ContadorAlmacen {
  return {
    leer: () => store.payOrderCounter,
    fijar: (valor) => {
      store.payOrderCounter = valor;
    },
  };
}

// Corte 5: mapas y contador de sync. Misma politica que caja: en multi el
// fallo de DB se propaga como BaseNoDisponible; en single la llamada sigue
// hacia memoria. Precios y stock son mapas compartidos que otros repos
// reutilizan en cortes siguientes; el contador no toca DB y no tiene fallo.
export function crearAlmacenOutbox(): AlmacenVivo<unknown> {
  return crearAlmacenVivo(store.outbox);
}

export function crearAlmacenDeviceSeq(): AlmacenVivo<number> {
  return crearAlmacenVivo(store.deviceSeq);
}

export interface PromocionSync {
  provisorio: string;
  definitivo: string;
}

export function crearAlmacenPromociones(): AlmacenVivo<PromocionSync> {
  return crearAlmacenVivo(store.promociones);
}

export interface LatidoSync {
  ultimaVistaEn: string;
  pendientes: number;
  ultimaOpHlc: string | null;
}

export function crearAlmacenDeviceSync(): AlmacenVivo<LatidoSync> {
  return crearAlmacenVivo(store.deviceSync);
}

export function crearAlmacenPrecios(): AlmacenVivo<number> {
  return crearAlmacenVivo(store.prices);
}

export function crearAlmacenStock(): AlmacenVivo<number> {
  return crearAlmacenVivo(store.stock);
}

export function crearContadorTickets(): ContadorAlmacen {
  return {
    leer: () => store.nextTicket,
    fijar: (valor) => {
      store.nextTicket = valor;
    },
  };
}

// Corte 6: mapas de catalogo. Misma politica que caja: en multi el fallo
// de DB se propaga como BaseNoDisponible; en single la llamada sigue hacia
// memoria. Precios y stock se reutilizan del corte 5; sectores, codigos,
// productos, fotos y ubicaciones son propios de este corte.
export interface FichaCatalogo {
  sku: string;
  nombre: string;
  precioCentavos: number;
  sector: string;
  locationId: string | null;
  archivado: boolean;
  controlaVencimiento: boolean;
}

export interface UbicacionCatalogo {
  id: string;
  nombre: string;
  archivada: boolean;
}

export interface FotoProducto {
  id: string;
  url: string;
  ancho: number;
  alto: number;
  bytes: number;
}

export function crearAlmacenProductos(): AlmacenVivo<FichaCatalogo> {
  return crearAlmacenVivo(store.productos);
}

export function crearAlmacenCodigos(): AlmacenVivo<string> {
  return crearAlmacenVivo(store.codigos);
}

export function crearAlmacenSectores(): AlmacenVivo<string> {
  return crearAlmacenVivo(store.productSectores);
}

export function crearAlmacenFotosProducto(): AlmacenVivo<Array<FotoProducto>> {
  return crearAlmacenVivo(store.fotosProducto);
}

export function crearAlmacenUbicaciones(): AlmacenVivo<UbicacionCatalogo> {
  return crearAlmacenVivo(store.ubicaciones);
}

// Corte 7: mapas de tickets. Misma politica que caja: en multi el fallo de
// DB se propaga como BaseNoDisponible; en single la llamada sigue hacia
// memoria. La idempotencia de ventas es un mapa compartido que ventas
// reutiliza en un corte siguiente.
export function crearAlmacenTicketLinks(): AlmacenVivo<TicketLinkEmitido> {
  return crearAlmacenVivo(store.ticketLinks);
}

export function crearAlmacenTicketLinksPorHash(): AlmacenVivo<TicketLinkEmitido> {
  return crearAlmacenVivo(store.ticketLinksByHash);
}

export function crearAlmacenTicketLinkVistos(): AlmacenVivo<TicketLinkEmitido> {
  return crearAlmacenVivo(store.ticketLinkVistos);
}

export function crearAlmacenTicketLinkRevocaciones(): AlmacenVivo<RevocacionLink> {
  return crearAlmacenVivo(store.ticketLinkRevocaciones);
}

export function crearAlmacenTicketLinkRevokeVistos(): AlmacenVivo<Array<RevocacionLink>> {
  return crearAlmacenVivo(store.ticketLinkRevokeVistos);
}

export function crearAlmacenTicketEnviosCentral(): AlmacenVivo<unknown> {
  return crearAlmacenVivo(store.ticketEnviosCentral);
}

export function crearAlmacenIdempotenciaVentas(): AlmacenVivo<StoredTicket> {
  return crearAlmacenVivo(store.idempotency);
}

// Corte 8: movimientos y conteos de stock. Misma politica que caja: en
// multi el fallo de DB se propaga como BaseNoDisponible; en single la
// llamada sigue hacia memoria. Las existencias y los sectores se reutilizan
// de los cortes 5 y 6; movimientos, conteos y vistos son propios de este
// corte.
export interface ConteoStock {
  id: string;
  sector: string;
  idemKey: string;
  creadoEn: string;
  estado?: string | undefined;
  contadoPor?: string | undefined;
  diferencias: Array<{ sku: string; teorico: number; fisico: number; diferencia: number }>;
}

export function crearListaMovimientosStock(): ListaAlmacen<StoredStockMovement> {
  return crearLista(store.stockMoves);
}

export function crearListaConteos(): ListaAlmacen<ConteoStock> {
  return crearLista(store.conteos);
}

export function crearAlmacenConteoVistos(): AlmacenVivo<string> {
  return crearAlmacenVivo(store.conteoVistos);
}

// Corte 9: mapas y contador de ventas (devoluciones, vistos y
// correcciones de medio). Misma politica que caja: en multi el fallo de
// DB se propaga como BaseNoDisponible; en single la llamada sigue hacia
// memoria. La idempotencia se reutiliza del corte 7; el contador no toca
// DB y no tiene fallo.
export interface VistoDevolucion {
  numero_devolucion: string;
  sale_id: string;
}

export function crearAlmacenDevoluciones(): AlmacenVivo<StoredReturn> {
  return crearAlmacenVivo(store.returns);
}

export function crearAlmacenDevolucionVistos(): AlmacenVivo<VistoDevolucion> {
  return crearAlmacenVivo(store.returnVistos);
}

export function crearAlmacenCorrecciones(): AlmacenVivo<CorreccionOk> {
  return crearAlmacenVivo(store.correcciones);
}

export function crearContadorDevoluciones(): ContadorAlmacen {
  return {
    leer: () => store.nextReturn,
    fijar: (valor) => {
      store.nextReturn = valor;
    },
  };
}

// Corte 10: mapas de fiscal (docs por idempotency_key y wizard por
// tenant). Excepcion ADR-0052: los caminos de fiscal nunca propagan
// BaseNoDisponible, caen a memoria; por eso fiscal no llama a
// `anteFalloPersistencia` y usa el almacen solo como espejo vivo.
// Los cobros reutilizan `crearListaMovimientos` del corte 2.
export function crearAlmacenFiscalDocs(): AlmacenVivo<StoredFiscalDoc> {
  return crearAlmacenVivo(store.fiscalDocs);
}

export function crearAlmacenFiscalWizard(): AlmacenVivo<WizardEstado> {
  return crearAlmacenVivo(store.fiscalWizard);
}

// Corte 11: mapas de servicios (facturas por id y por message-id, cuentas).
// Misma politica que caja: en multi el fallo de DB se propaga como
// BaseNoDisponible; en single la llamada sigue hacia memoria. El indice por
// message-id vive solo en memoria y comparte el espejo de facturas.
export function crearAlmacenFacturasServicio(): AlmacenVivo<FacturaServicio> {
  return crearAlmacenVivo(store.utilityBills);
}

export function crearAlmacenFacturasServicioPorMensaje(): AlmacenVivo<FacturaServicio> {
  return crearAlmacenVivo(store.utilityBillsByMessage);
}

export function crearAlmacenCuentasServicio(): AlmacenVivo<CuentaServicio> {
  return crearAlmacenVivo(store.serviceAccounts);
}

// Corte 12: fiado (vistos y movimientos de credito). Misma politica que
// caja: en multi el fallo de DB se propaga como BaseNoDisponible; en single
// la llamada sigue hacia memoria. El correlativo T-* reutiliza
// `crearContadorTickets` y los lotes FIFO `crearAlmacenStock` (mapa vivo).
export type MovimientoCredito = (typeof store.creditMovs)[number];

export function crearAlmacenCreditoVistos(): AlmacenVivo<unknown> {
  return crearAlmacenVivo(store.creditVistos);
}

export function crearListaMovimientosCredito(): ListaAlmacen<MovimientoCredito> {
  return crearLista(store.creditMovs);
}

// Corte 13: suppliers. Misma politica que caja: en multi el fallo de DB
// se propaga como BaseNoDisponible; en single la llamada sigue hacia
// memoria. Las ordenes y sus vistos se reutilizan del corte 3.
export function crearAlmacenSuppliers(): AlmacenVivo<Supplier> {
  return crearAlmacenVivo(store.suppliers);
}
