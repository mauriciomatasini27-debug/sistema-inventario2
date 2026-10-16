import type { Medio } from "../lib/validation.js";

// Invariantes en tipos: difícil de usar mal > checks en runtime > comentarios.
// OpId es uuidv7 (ordenable por tiempo). DeviceSeq monótono por device desde 1.
// Hlc "ms:counter" con orden lexicográfico == orden causal. Cursor solo avanza.

declare const OpBrand: unique symbol;
export type OpId = string & { readonly [OpBrand]: "OpId" };

declare const SeqBrand: unique symbol;
export type DeviceSeq = number & { readonly [SeqBrand]: "DeviceSeq" };

declare const HlcBrand: unique symbol;
export type Hlc = string & { readonly [HlcBrand]: "Hlc" };

declare const CursorBrand: unique symbol;
export type Cursor = string & { readonly [CursorBrand]: "Cursor" };

declare const ProvBrand: unique symbol;
// Id provisorio solo local ("tmp-..."), nunca se envía como identidad servidor.
export type IdProv = string & { readonly [ProvBrand]: "Prov" };
// Id definitivo asignado por servidor ("srv-..." o "T-...").
export type IdDef = string;

export type Dinero = bigint;
export type EstadoOp = "pendiente" | "enviado" | "confirmado";
export type OpKind = "venta" | "mov_caja" | "foto";

export interface EfectoLocal {
  kind: OpKind;
  resumen: string;
  // SYNC-S7: marca el tipo de op de outbox (`payload.tipo`). Si es sensible
  // (OPERACIONES_SOLO_ONLINE), encolar lanza NecesitaConexionError.
  tipo?: string | undefined;
}

export interface OpLocal {
  opId: OpId;
  seq: DeviceSeq;
  hlc: Hlc;
  kind: OpKind;
  efecto: EfectoLocal;
  estado: EstadoOp;
  intentos: number;
  proximoReintentoAt: number | null;
}

export interface VistaOffline {
  pendientes: number;
  enviando: boolean;
  cursor: Cursor | null;
  grantVigente: boolean;
}

export interface VenderInput {
  sku: string;
  cant: number;
  medio: Medio;
}

export interface TicketProv {
  provisorio: IdProv;
  total: Dinero;
  medio: Medio;
}

export interface TicketVista {
  codigo: string;
  definitivo: boolean;
  total: Dinero;
}

export interface RegistrarCajaInput {
  tipo: "ingreso" | "egreso";
  montoCentavos: Dinero;
  motivo: string;
}

export interface MovimientoProv {
  idProvisorio: IdProv;
  estadoSync: EstadoOp;
}

export type AlcanceGrant = "venta" | "stock" | "caja" | "fiado_cobro";

export interface OfflineGrant {
  grantId: string;
  deviceCode: string;
  alcance: AlcanceGrant;
  expiraEn: string;
}

export interface ResultadoSync {
  subidos: number;
  bajados: number;
  cursor: Cursor | null;
}
