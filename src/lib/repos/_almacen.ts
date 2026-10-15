import { esModoMulti } from "../tenant-mode.js";
import { BaseNoDisponible } from "../server-db.js";
import { store, type StoredMovement } from "../store.js";
import type { CierreOk } from "../../modules/cash/cierre.js";
import type { ConciliarOk, Drop, DropOk, Turno } from "../../modules/cash/turnos.js";
import type { AuditEntry, ReversionOk } from "../../modules/cash/reversion.js";
import type { Ajuste } from "../../modules/pricing/precios.js";
import type { Borrador, Factura, PagoProveedor } from "../../modules/purchases/facturas.js";
import type { PurchaseOrder } from "../../modules/purchases/proveedores.js";
import type { MatchLogEntry } from "../../modules/purchases/matching.js";
import type { Payee } from "../../modules/payments/beneficiarios.js";
import type { PagoConfirmado, PaymentOrder } from "../../modules/payments/ordenes.js";

export type { StoredMovement };

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
