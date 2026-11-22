import type { Medio } from "./validation.js";
import type { Turno, ConciliarOk, Drop, DropOk } from "../modules/cash/turnos.js";
import type { CierreOk } from "../modules/cash/cierre.js";
import type { ReversionOk, AuditEntry } from "../modules/cash/reversion.js";
import type { CorreccionOk } from "../modules/sales/correccion_medio.js";
import type { Ajuste } from "../modules/pricing/precios.js";
import type { Supplier, PurchaseOrder } from "../modules/purchases/proveedores.js";
import type { Borrador, Factura, PagoProveedor } from "../modules/purchases/facturas.js";
import type { MatchLogEntry } from "../modules/purchases/matching.js";
import type { CuentaServicio } from "../modules/utilities/cuentas.js";
import type { FacturaServicio } from "../modules/utilities/facturas_servicios.js";
import type { Payee } from "../modules/payments/beneficiarios.js";
import type { PaymentOrder, PagoConfirmado } from "../modules/payments/ordenes.js";
import type { EventoResumen, OutboxPendiente } from "../modules/email/resumen-cierre.js";
import type { CanalElegido } from "../modules/alertas/stock-bajo.js";
import type { ImportacionRegistrada } from "./repos/importaciones.js";
import { esModoAisladoPorTenant, tenantActual } from "./tenant-mode.js";

export interface StoredTicket {
  sale_id: string;
  ticket_definitivo: string | null;
  ticket_provisorio: string;
  total_centavos: string;
  medio: Medio;
  sobreventa: boolean;
}

export interface StoredMovement {
  id: string;
  tipo: "ingreso" | "egreso";
  metodo: Medio;
  monto_centavos: string;
  origen: string;
  sale_id?: string;
  idempotency_key: string;
  // CAJA-S1: instante de ocurrencia para asociar QR ±15 min.
  ocurrido_en?: string;
  // P10-27 [rol]: quién registró el movimiento, desde la sesión de la ruta.
  actor?: string;
}

export interface StoredStockMovement {
  idemKey: string;
  sku: string;
  loteId: string | null;
  delta: number;
  tipo: "ALTA" | "VENTA" | "COMPENSATORIO" | "MERMA" | "AJUSTE_CONTEO";
  motivo?: string | undefined;
}

export interface MarcaNoFacturar {
  motivo: string;
  por: string;
  cuando: string;
}

export interface StoredFiscalDoc {
  id: string;
  idempotency_key: string;
  sale_id: string;
  // Dueño del comprobante para aislamiento por tenant (ISO-S3).
  tenant_id?: string | null | undefined;
  cbte_tipo: string;
  pto_vta: string;
  cbte_nro: number | null;
  cbte_fch: string;
  // FE-S8: receptor resuelto al vender (CF por defecto o CUIT a pedido).
  doc_tipo: string;
  doc_nro: string;
  cond_iva_receptor: string;
  estado: "pendiente" | "pendiente_de_sync" | "en_espera_de_datos" | "espera_cae" | "autorizado" | "rechazado" | "respuesta_incierta";
  cae: string | null;
  cae_vto: string | null;
  qr_payload: string | null;
  // Representación mínima slice (ADR-0019): marca de prueba + link token para
  // mostrar `Factura C PV-Nro` con link (nunca el CAE como factura).
  marca?: string | null | undefined;
  link_token?: string | null | undefined;
  imp_iva_centavos?: string | null | undefined;
  alic_iva_id?: string | null | undefined;
  // FE-S22 (offline): ocurrencia cliente para ordenar la cola + leyenda.
  client_ocurred_at?: string | null | undefined;
  venta_leyenda?: string | null | undefined;
  // FE-S14 (NC): devolución origen + comprobante asociado a la factura.
  return_id?: string | null | undefined;
  cbtes_asoc_tipo?: string | null | undefined;
  cbtes_asoc_pto_vta?: string | null | undefined;
  cbtes_asoc_nro?: number | null | undefined;
  // Importe del comprobante en centavos (factura o NC) para topes.
  imp_total_centavos?: string | null | undefined;
  // T3 (FE-S19/S20): reintentos backoff + bandeja. Sin estos campos = 0 intentos.
  intentos?: number | undefined;
  proximo_intento?: string | null | undefined;
  ultimo_error_codigo?: string | null | undefined;
  motivo_castellano?: string | null | undefined;
  no_facturar?: MarcaNoFacturar | null | undefined;
}

export interface StoredReturn {
  return_id: string;
  sale_id: string;
  numero_devolucion: string;
  total_centavos: string;
  medio: Medio;
}

// Adaptador en memoria para Slice-0: el núcleo es puro; la tx real Postgres con
// lock de numeración vive en Drizzle (ver schema.ts). Este store comparte estado
// entre rutas en el mismo proceso para que build/tests no exijan DB viva.
// PERS2-S1: en multi cada tenant tiene su propia partición (mismas claves);
// fuera de contexto en multi acceder lanza `Falta tenant`. `control` sigue
// global: es el plano de control, no datos de un comercio.
// Por qué factory + Proxy: la forma del estado se define una sola vez y `store`
// resuelve la partición del tenant actual en cada acceso (sin ciclos: solo se
// importa tenant-mode, que no toca store ni db).
export interface StoredOutbox {
  payload: unknown;
  estado: string;
  deviceCode: string;
  deviceSeq: number;
  modulo: string;
  createdAt: string;
}

function crearEstado() {
  return {
  idempotency: new Map<string, StoredTicket>(),
  movements: [] as StoredMovement[],
  stockMoves: [] as StoredStockMovement[],
  outbox: new Map<string, StoredOutbox>(),
  deviceSeq: new Map<string, number>(),
  nextTicket: 1,
  stock: new Map<string, number>([["demo-sku-1", 10]]),
  prices: new Map<string, number>([["demo-sku-1", 15000]]),
  fiscalDocs: new Map<string, StoredFiscalDoc>(),
  fiscalLastNumber: 0,
  returns: new Map<string, StoredReturn>(),
  returnVistos: new Map<string, { numero_devolucion: string; sale_id: string }>(),
  nextReturn: 1,
  turnos: new Map<string, Turno>(),
  turnoVistos: new Map<string, ConciliarOk>(),
  shiftKeys: new Map<string, string>(),
  drops: new Map<string, Drop>(),
  dropVistos: new Map<string, DropOk>(),
  cierres: new Map<string, CierreOk>(),
  reversiones: new Map<string, string>(),
  reversionVistos: new Map<string, ReversionOk>(),
  auditoria: [] as AuditEntry[],
  correcciones: new Map<string, CorreccionOk>(),
  ajustes: new Map<string, Ajuste>(),
  creditVistos: new Map<string, unknown>(),
  creditMovs: [] as Array<{ customer_id: string; debe: string; haber: string; key: string; fecha_ms?: number }>,
  // Nivel 1: sector por sku + conteos por sector (append-only, inmutable).
  productSectores: new Map<string, string>(),
  // ADR-0106: espejo de products.origen = 'alta_al_vender' (sin DB).
  altasAlVender: new Set<string>(),
  // viva hay write-through best-effort a products/product_codes.
  productos: new Map<string, { sku: string; nombre: string; precioCentavos: number; origen?: "alta_al_vender" | "plantilla_rubro" | null | undefined; sector: string; locationId: string | null; archivado: boolean; controlaVencimiento: boolean; estado: "activo" | "pendiente_revision"; minStock: number | null; reorderQty: number | null }>(),
  codigos: new Map<string, string>(),
  fotosProducto: new Map<string, Array<{ id: string; url: string; ancho: number; alto: number; bytes: number }>>(),
  // N1 CAT-S3: lotes en memoria (id -> lote). FEFO puro en inventario.ts.
  lotes: new Map<string, { id: string; sku: string; cantidad: number; cantidadRestante: number; venceEl: string | null; costoCentavos: string }>(),
  importaciones: new Map<string, ImportacionRegistrada>(),
  // N1 CAT-S5: ubicaciones + conteos con líneas/estado.
  ubicaciones: new Map<string, { id: string; nombre: string; archivada: boolean }>(),
  // N1 CAJA-S1/S3/S4: qr, vencimientos caja, pagos divididos.
  qrRecibos: new Map<string, { numeroOperacion: string; montoCentavos: string; estado: string; idemKey: string; fechaOperacion?: string; origen?: string; cashMovementId?: string | null }>(),
  vencimientosCaja: new Map<string, { id: string; concepto: string; venceEl: string; montoCentavos: string; estado: string }>(),
  ticketPagos: new Map<string, Array<{ medio: Medio; montoCentavos: string; cashMovementId: string }>>(),
  ticketLineas: [] as Array<{ sale_id: string; product_id: string; qty: number; precio_centavos: string; costo_centavos?: string }>,
  ticketDescuentos: [] as Array<{ sale_id: string; linea_idx: number; sku: string; bruto_centavos: string; desc_linea_centavos: string; desc_ticket_centavos: string; neto_centavos: string }>,
  // P10-2: ticket de venta a cuenta (no vive en idempotency de contado).
  fiadoTickets: new Map<string, { sale_id: string; ticket_definitivo: string | null; ticket_provisorio: string; total_centavos: string; medio: string; sobreventa: boolean; idempotency_key: string }>(),
  conteos: [] as Array<{ id: string; sector: string; idemKey: string; creadoEn: string; estado?: string | undefined; contadoPor?: string | undefined; diferencias: Array<{ sku: string; teorico: number; fisico: number; diferencia: number }> }>,
  conteoVistos: new Map<string, string>(),
  suppliers: new Map<string, Supplier>(),
  purchaseOrders: new Map<string, PurchaseOrder>(),
  orderVistos: new Map<string, PurchaseOrder>(),
  borradores: new Map<string, Borrador>(),
  borradorVistos: new Map<string, Borrador>(),
  facturasProv: new Map<string, Factura>(),
  pagosProv: new Map<string, PagoProveedor>(),
  // FP matching auto: una fila por OC evaluada al confirmar (auditable,
  // espejo en memoria de supplier_match_log; la fila del vínculo lleva
  // motivo auto-exacto y su OC queda cerrada).
  supplierMatchLog: [] as MatchLogEntry[],
  serviceAccounts: new Map<string, CuentaServicio>(),
  utilityBills: new Map<string, FacturaServicio>(),
  utilityBillsByMessage: new Map<string, FacturaServicio>(),
  payees: new Map<string, Payee>(),
  paymentOrders: new Map<string, PaymentOrder>(),
  paymentOrderVistos: new Map<string, PaymentOrder>(),
  paymentPagosVistos: new Map<string, PagoConfirmado>(),
  payOrderCounter: 1,
  emailEventos: new Map<string, EventoResumen>(),
  emailOutbox: new Map<string, OutboxPendiente>(),
  // Promociones sync offline: op_id -> provisorio + definitivo T-* asignado
  // por POST /api/sync/promote (ADR-0017). Monoproceso en C1; C2 lo lleva a
  // Postgres con lock (idMappings es la copia durable best-effort).
  promociones: new Map<string, { provisorio: string; definitivo: string }>(),
  // hacia el bot WA ([Confirmar] [Editar] [Descartar]).
  ocrJobs: new Map<string, import("../modules/ocr/jobs.js").OcrJob>(),
  ocrJobsByKey: new Map<string, string>(),
    ocrEventos: [] as Array<{ tipo: string; payload: unknown }>,
  // T3 fiscal (FE-S4/S5/S25): wizard por tenant + historial append-only.
  fiscalWizard: new Map<string, { paso: number; delegacion: import("../modules/fiscal/wizard.js").DelegacionEstado; pausaEn: number | null }>(),
  fiscalHistorial: [] as Array<{ id: string; cuando: string; evento: string; docId: string }>,
  // Bot WA B4-B15: sesiones cortas por número (paso + contexto sin stock,
  // TTL 30 min aplicado en el adaptador), claves de idempotencia por canal
  // (notif+canal+fecha) y lista del viernes por tenant+proveedor.
  waSessions: new Map<string, { paso: string; contexto: unknown; updatedAt: number; expiraEn: number }>(),
  waEnviados: new Set<string>(),
  waFriday: new Map<string, Array<{ sku: string; proveedor: string | null; agregadoEn: number }>>(),
  // 8.Ticket salida TV9: links públicos con token (Slice-0 en memoria).
  // tokenHash (SHA-256 hex) -> link; idemKey -> link; linkId -> revocación.
  ticketLinks: new Map<string, { id: string; saleId: string; tokenHash: string; expiraAtMs: number; createdAtMs: number; idempotencyKey: string }>(),
  ticketLinksByHash: new Map<string, { id: string; saleId: string; tokenHash: string; expiraAtMs: number; createdAtMs: number; idempotencyKey: string }>(),
  ticketLinkVistos: new Map<string, { id: string; saleId: string; tokenHash: string; expiraAtMs: number; createdAtMs: number; idempotencyKey: string }>(),
  ticketLinkRevocaciones: new Map<string, { linkId: string; saleId: string; actor: string; motivo: string; createdAtMs: number; idempotencyKey: string }>(),
  ticketLinkRevokeVistos: new Map<string, Array<{ linkId: string; saleId: string; actor: string; motivo: string; createdAtMs: number; idempotencyKey: string }>>(),
  // TV12 P1: outbox de envíos centrales (op_id/idemKey -> estado).
  ticketEnviosCentral: new Map<string, unknown>(),
  // SYNC-S3 (OF5/OF12): último latido por device (device_sync_state en memoria;
  // la tabla durable vive en C2 con PERS-S1). Guarda última vista + pendientes.
  deviceSync: new Map<string, { ultimaVistaEn: string; pendientes: number; ultimaOpHlc: string | null }>(),
  // CH-S2 (PRD-CH-01): dedup de upload-url por sha256 del cliente. sha256 hex
  // (minúsculas) -> { object_key, upload_url, expira_en }. En memoria en
  // Slice-0; el cutover a Postgres/R2 lo unifica con media_items.
  mediaUploads: new Map<string, { objectKey: string; uploadUrl: string; expiraEn: string; contentType: string; moduloOrigen: string }>(),
  };
}

export type EstadoStore = ReturnType<typeof crearEstado>;

const particiones = new Map<string, EstadoStore>();
const estadoSingle: EstadoStore = crearEstado();

function estadoActual(): EstadoStore {
  // ADR-0116: shared también parte memoria por UUID (no estadoSingle global).
  if (!esModoAisladoPorTenant()) return estadoSingle;
  const tenant = tenantActual();
  if (!tenant) throw new Error("Falta tenant");
  let estado = particiones.get(tenant);
  if (!estado) {
    estado = crearEstado();
    particiones.set(tenant, estado);
  }
  return estado;
}

export const store: EstadoStore = new Proxy({} as EstadoStore, {
  get(_objetivo, prop) {
    const estado = estadoActual();
    const valor = Reflect.get(estado, prop);
    return typeof valor === "function" ? valor.bind(estado) : valor;
  },
  set(_objetivo, prop, valor) {
    Reflect.set(estadoActual(), prop, valor);
    return true;
  },
  has(_objetivo, prop) {
    return Reflect.has(estadoActual(), prop);
  },
  ownKeys() {
    return Reflect.ownKeys(estadoActual());
  },
  getOwnPropertyDescriptor(_objetivo, prop) {
    return Reflect.getOwnPropertyDescriptor(estadoActual(), prop);
  },
});

// Único camino de memoria que no pasa por _almacen: AT4 prohíbe nuevas
// referencias a store. en repos, así que el repo lee el mapa por acá.
export function importacionesEnMemoria(): Map<string, ImportacionRegistrada> {
  return estadoActual().importaciones;
}

export function resetStore() {
  // Por qué limpiar todas: en multi fuera de contexto (setup de tests) no hay
  // partición actual; se descartan todas y se resetea la de single.
  if (esModoAisladoPorTenant() && !tenantActual()) particiones.clear();
  const s = esModoAisladoPorTenant() && !tenantActual() ? estadoSingle : estadoActual();
  s.idempotency.clear();
  s.movements = [];
  s.stockMoves = [];
  s.outbox.clear();
  s.deviceSeq.clear();
  s.nextTicket = 1;
  s.stock = new Map([["demo-sku-1", 10]]);
  s.prices = new Map([["demo-sku-1", 15000]]);
  s.fiscalDocs.clear();
  s.fiscalLastNumber = 0;
  s.returns.clear();
  s.returnVistos.clear();
  s.nextReturn = 1;
  s.turnos.clear();
  s.turnoVistos.clear();
  s.shiftKeys.clear();
  s.drops.clear();
  s.dropVistos.clear();
  s.cierres.clear();
  s.reversiones.clear();
  s.reversionVistos.clear();
  s.auditoria = [];
  s.correcciones.clear();
  s.ajustes.clear();
  s.creditVistos.clear();
  s.creditMovs = [];
  s.productSectores.clear();
  s.altasAlVender.clear();
  s.productos.clear();
  s.codigos.clear();
  s.fotosProducto.clear();
  s.lotes.clear();
  s.importaciones.clear();
  s.ubicaciones.clear();
  s.qrRecibos.clear();
  s.vencimientosCaja.clear();
  s.ticketPagos.clear();
  s.ticketLineas = [];
  s.ticketDescuentos = [];
  s.fiadoTickets.clear();
  s.conteos = [];
  s.conteoVistos.clear();
  s.suppliers.clear();
  s.purchaseOrders.clear();
  s.orderVistos.clear();
  s.borradores.clear();
  s.borradorVistos.clear();
  s.facturasProv.clear();
  s.pagosProv.clear();
  s.supplierMatchLog = [];
  s.serviceAccounts.clear();
  s.utilityBills.clear();
  s.utilityBillsByMessage.clear();
  s.payees.clear();
  s.paymentOrders.clear();
  s.paymentOrderVistos.clear();
  s.paymentPagosVistos.clear();
  s.payOrderCounter = 1;
  s.emailEventos.clear();
  s.emailOutbox.clear();
  s.promociones.clear();
  s.ocrJobs.clear();
  s.ocrJobsByKey.clear();
  s.ocrEventos = [];
  s.fiscalWizard.clear();
  s.fiscalHistorial = [];
  s.waSessions.clear();
  s.waEnviados.clear();
  s.waFriday.clear();
  s.ticketLinks.clear();
  s.ticketLinksByHash.clear();
  s.ticketLinkVistos.clear();
  s.ticketLinkRevocaciones.clear();
  s.ticketLinkRevokeVistos.clear();
  s.ticketEnviosCentral.clear();
  s.  deviceSync.clear();
  s.mediaUploads.clear();
  control.users.clear();
  control.tenants.clear();
  control.databases.clear();
  control.memberships.clear();
  control.invitations.clear();
  control.sessions.clear();
  control.events = [];
  control.jobs.clear();
  control.opsOutbox = [];
  control.botLinks.clear();
  control.botModules.clear();
  control.botConsultas.clear();
  control.offlineGrants.clear();
  control.devices.clear();
  control.deviceNames.clear();
  control.devicePins.clear();
  control.deviceLocks.clear();
  control.deviceRevocados.clear();
  control.pinFallos.clear();
  control.pendingAuth.clear();
  control.pendingReauth.clear();
  control.reauthFallos.clear();
  control.vincularCodes.clear();
  control.waPrefs.clear();
  control.onboardingState.clear();
  control.ejemplos.clear();
  control.bienvenidas.clear();
  control.semillasProductos.clear();
  control.proveedorContactos.clear();
  control.proveedorInvitaciones.clear();
  control.proveedorCupo.clear();
  control.proveedorCupoAviso.clear();
}

// Control Auth + Onboarding en memoria: mismo rol que `store` en Slice-0 —
// las rutas comparten estado en el proceso para que build/tests no exijan DB
// viva. En producción estos mapas los reemplaza Drizzle contra control con
// locks (ver src/jobs/aprovisionar.ts); la forma de los registros es la misma.
export interface ControlUser {
  googleSub: string;
  email: string;
  emailVerificado: boolean;
  nombre?: string | undefined;
  fotoUrl?: string | undefined;
  ultimoLoginAt?: string | undefined;
}

export interface ControlTenant {
  id: string;
  nombreComercio: string;
  slug: string;
  estado: string;
  plan: string;
  moneda: string;
  ownerGoogleSub: string;
  esDemo: boolean;
  // ON1: rubro elegido en el alta. En producción es una columna de tenants;
  // en memoria alcanza para derivar los módulos del bot (BOT-S1).
  rubro?: string | undefined;
  requestKey?: string | undefined;
  trialHasta?: string | undefined;
  // Abuso vs mora: decide el texto que ve el comercio. Solo memoria (sin
  // columna); sin dato, el texto es el neutro.
  suspensionTipo?: "mora" | "abuso" | undefined;
}

export interface ControlMembership {
  id: string;
  tenantId: string;
  googleSub: string;
  rol: "dueno" | "empleado";
  permisos: string[];
  estado: "activo" | "revocado";
  revocadoAt?: string | undefined;
  revocadoPor?: string | undefined;
  // AU11.3: interruptor "Puede usar el bot" (default activado en el MVP).
  puedeUsarBot?: boolean | undefined;
}

export interface ControlInvitation {
  tokenHash: string;
  tenantId: string;
  email: string;
  rol: "dueno" | "empleado";
  permisos: string[];
  estado: "pendiente" | "aceptada" | "vencida" | "cancelada";
  expiraAt: string;
  creadaPor?: string | undefined;
  aceptadaPor?: string | undefined;
}

export interface ControlSession {
  idHash: string;
  googleSub: string;
  tenantId: string | null;
  expiraAt: string;
  expiraAbsoluta?: string | undefined;
  lastSeenAt?: string | undefined;
  revocadaAt?: string | undefined;
  motivo?: string | undefined;
  agente?: string | undefined;
  dispositivoCodigo?: string | undefined;
  reauthAt?: string | undefined;
}

export const control = {
  users: new Map<string, ControlUser>(),
  tenants: new Map<string, ControlTenant>(),
  databases: new Map<string, { tenantId: string; database: string; estado: string; schemaVersion?: string }>(),
  memberships: new Map<string, ControlMembership>(),
  invitations: new Map<string, ControlInvitation>(),
  sessions: new Map<string, ControlSession>(),
  events: [] as Array<{ tenantId: string | null; tipo: string; actor?: string; detalle?: unknown; creadoEn?: string | undefined }>,
  jobs: new Map<string, { id: string; tenantId: string; estado: string; pasoActual?: string | null | undefined; intentos: number; error?: string | undefined }>(),
  opsOutbox: [] as Array<{ tipo: string; payload: unknown }>,
  botLinks: new Map<string, { tenantId: string; googleSub: string; estado: string; revocadoAt?: string }>(),
  // BOT-S1 (ADR-0039): módulos del bot activos por tenant. Espejo en memoria;
  // la tabla tenant_bot_modules queda pendiente de migración.
  botModules: new Map<string, { tenantId: string; activos: string[] }>(),
  // DASH-S3 (ADR-0034): consultas del bot por wamid para la tarjeta `Bot` del
  // panel. Clave wamid: Meta reintenta y no debe duplicar. Con base viva la
  // fuente es whatsapp_usage de la base del comercio.
  botConsultas: new Map<string, { tenantId: string; creadoEnMs: number }>(),
  // SYNC-S5/S6 (OF9): grants offline + registro de devices (copia en memoria;
  // la tabla durable vive en C2 con PERS-S1). Token plano solo se muestra al
  // crear; acá queda el hash. Revocado => cuarentena post-revocación.
  offlineGrants: new Map<string, { grantId: string; tokenHash: string; tenantId: string; googleSub: string; deviceCode: string; alcance: string; expiraEn: string; revocadoEn?: string | undefined }>(),
  devices: new Map<string, { deviceCode: string; tenantId: string; registradoPor: string; registradoEn: string }>(),
  // P10-34 [tenant]: espejo de devices.nombre. Queda para el modo single sin
  // base y para hidratar la UI, pero la fuente con base viva es la tabla.
  deviceNames: new Map<string, string>(),
  // P1-3 PIN de mostrador por device_code: hash scrypt (nunca el plano),
  // bloqueo local y fallos para rate-limit. Fuente en memoria; copia
  // durable best-effort en `device_pins` (migración 0005).
  devicePins: new Map<string, { pinHash: string; actualizadoEn: string }>(),
  deviceLocks: new Map<string, { bloqueado: boolean; bloqueadoEn?: string | undefined; bloqueadoPor?: string | undefined }>(),
  // PWA-S5: revocación remota (device_code -> { revocadoEn, motivo, por }).
  // El heartbeat responde wipe:true mientras el código siga acá; el cliente
  // borra todo local en el próximo latido (ver revocarDispositivo()).
  // En memoria en Slice-0; el cutover lleva esta marca a `devices` en control.
  deviceRevocados: new Map<string, { revocadoEn: string; motivo: string; por: string }>(),
  pinFallos: new Map<string, { fallos: number; bloqueadoHastaMs: number }>(),
  pendingAuth: new Map<string, { nonce: string; verifier: string; expiraEnMs: number; invitationToken?: string | undefined; next?: string | undefined }>(),
  // AU10.2: reautenticaciones en curso (state -> sub + nonce + vencimiento).
  pendingReauth: new Map<string, { googleSub: string; nonce: string; verifier: string; expiraEnMs: number; continuar?: string | undefined }>(),
  // AU10.5: fallos de reauth por sub para rate limiting.
  reauthFallos: new Map<string, { fallos: number; bloqueadoHastaMs: number }>(),
  // Códigos VINCULAR pendientes por número E.164 (B1.1/B1.2): hash, vencimiento
  // 10 min, un solo uso. El plano solo se muestra una vez en la web.
  vincularCodes: new Map<
    string,
    { codigoHash: string; expiraEn: number; usado: boolean; numeroRegistrado: string; tenantId: string; googleSub: string; intentosFallidos: number }
  >(),
  // Preferencias de notificación WA por usuario+tenant (B2.1/B2.2, prod:
  // notification_preferences con upsert). Clave `${tenantId}:${googleSub}`.
  // Ausente => optIn false (B2: sin opt-in no sale ninguna plantilla).
  waPrefs: new Map<string, { optIn: boolean; avisoHora: string; pausadoHastaMs: number | null; canal?: CanalElegido; optInAtMs?: number | null }>(),
  // ON5-ON12 sin UX: progreso por usuario y comercio, demos de ejemplo y
  // bienvenidas enviadas. Claves y formas en modules/onboarding/estado.ts.
  onboardingState: new Map<string, import("../modules/onboarding/estado.js").OnboardingState>(),
  ejemplos: new Map<string, import("../modules/onboarding/estado.js").EjemploInfo>(),
  bienvenidas: new Set<string>(),
  // PRD-STOCK-01 STOCK-S8 (ADR-0107): tenants con la plantilla de productos
  // ya confirmada. Espejo en memoria de tenant_product_seeds.
  semillasProductos: new Set<string>(),
  // #68 PROV-durable: espejo de `proveedor-wa`. La fila vive en la base del
  // comercio; sin base estos mapas son la copia. `resetStore` los tira.
  proveedorContactos: new Map<string, import("../modules/whatsapp/proveedor.js").ContactoProveedor>(),
  proveedorInvitaciones: new Map<string, import("../modules/whatsapp/proveedor.js").InvitacionProveedor>(),
  // PROV-E4: marcas de la ventana móvil y el aviso del corte, misma clave E.164.
  proveedorCupo: new Map<string, number[]>(),
  proveedorCupoAviso: new Map<string, true>(),
};

export function resetControl() {
  resetStore();
}
