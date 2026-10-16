import { z } from "zod";

// C5/C4 ADR-0004: 5 medios fijos, lista cerrada.
export const medioSchema = z.enum([
  "Efectivo",
  "Debito",
  "Mercado Pago",
  "QR",
  "Transferencia",
]);
export type Medio = z.infer<typeof medioSchema>;

// TV1/TV3 ADR-0004: 1 venta = 1 ticket, numeración servidor + provisorio DeviceCode-SeqLocal.
export const salesLineSchema = z.object({
  product_id: z.string().min(1).max(64),
  qty: z.number().int().min(1).max(999),
  precio_centavos: z.number().int().min(0).max(999_999_999),
  precio_id: z.string().max(64).optional(),
});

export const postSalesSchema = z.object({
  lineas: z.array(salesLineSchema).min(1).max(50),
  medio: medioSchema,
  // CAJA-S4: pagos divididos opcionales. Si viene, Σ debe igualar total y
  // se crean N egresos (1 por medio). Si ausente, 1 egreso con medio.
  pagos: z.array(z.object({ medio: medioSchema, monto_centavos: z.number().int().min(1) })).min(1).max(5).optional(),
  device_code: z.string().min(4).max(32),
  seq_local: z.number().int().positive(),
  client_occurred_at: z.string().datetime({ offset: true }),
  offline: z.boolean().default(false),
  // FE-S8: CUIT a pedido + condición IVA receptor declarada (RG 5616).
  // Ausentes = consumidor final por defecto (con umbral $10M).
  fiscal_receptor_cuit: z.string().max(13).optional(),
  fiscal_cond_iva_receptor: z.number().int().min(1).max(9).optional(),
  // FE-S7 (B): emisor para determinar clase. Default monotributo etapa 1
  // preserva el slice C; RI etapa 2 habilita B a CF.
  fiscal_emisor_condicion: z.enum(["monotributo", "exento", "responsable_inscripto"]).optional(),
  fiscal_emisor_etapa: z.number().int().min(1).max(3).optional(),
  // FE-S12 (B): alícuota IVA. Default 5 (21%).
  fiscal_alicuota_id: z.number().int().min(1).max(9).optional(),
});

// C3/C15/C16 ADR-0004: movimientos inmutables, retiros/sueldos restringidos por rol en núcleo.
export const cashMovementSchema = z.object({
  tipo: z.enum(["ingreso", "egreso"]),
  metodo: medioSchema,
  categoria_id: z.string().min(1).max(64),
  origen: z.enum(["venta", "retiro", "sueldo", "devolucion", "cobro_fiado"]),
  sale_id: z.string().uuid().optional(),
  monto_centavos: z.number().int().positive(),
  nota: z.string().max(280).optional(),
  device_code: z.string().min(4).max(32),
  seq_local: z.number().int().positive(),
  client_occurred_at: z.string().datetime({ offset: true }),
});

// ADR-0001/0003: push idempotente por op_id == Idempotency-Key, device_seq + hlc ordenan.
export const syncPushOpSchema = z.object({
  op_id: z.string().uuid(),
  device_code: z.string().min(4).max(32),
  device_seq: z.number().int().positive(),
  hlc: z.string().min(1).max(64),
  modulo: z.enum(["inventory", "sales", "cash", "credit"]),
  payload: z.record(z.string(), z.unknown()),
  client_occurred_at: z.string().datetime({ offset: true }),
});
export const syncPushSchema = syncPushOpSchema;
// SYNC-S7 (OF4.9): lote de hasta 50 ops; cada una responde por separado y la
// sensible responde necesita_conexion sin frenar al resto del lote.
export const syncPushBatchSchema = z.object({
  ops: z.array(syncPushOpSchema).min(1).max(50),
});

export const syncPullQuerySchema = z.object({
  cursor: z.coerce.bigint().refine((v) => v >= 0n, "cursor negativo"),
  limite: z.coerce.number().int().min(1).max(200).default(100),
});

// ADR-0017 sync: promueve un op ya pusheado a ticket definitivo T-*.
export const syncPromoteSchema = z.object({
  op_id: z.string().uuid(),
  device_code: z.string().min(4).max(32),
  device_seq: z.number().int().positive(),
});

// SYNC-S3 (PRD-SYNC-01, OF5/OF12): latido con pendientes + última op.
export const syncHeartbeatSchema = z.object({
  device_code: z.string().min(4).max(32),
  pendientes: z.number().int().min(0).max(1_000_000),
  ultima_op_hlc: z.string().min(1).max(64).optional(),
});

// CH-S2 (PRD-CH-01): URL firmada de subida directa (facturas, consumos,
// fotos). El cliente manda el sha256 de lo que va a subir para dedup 409.
export const mediaUploadUrlSchema = z.object({
  content_type: z.enum(["image/jpeg", "image/webp"]),
  bytes: z.number().int().min(1).max(2 * 1024 * 1024),
  modulo_origen: z.enum(["inventory", "purchases", "tickets"]),
  sha256: z.string().regex(/^[0-9a-f]{64}$/i, "sha256 inválido (hex 64)"),
  device_code: z.string().min(4).max(32).optional(),
});

// PWA-S5: revocación remota de dispositivo (el cliente hace wipe en el
// próximo heartbeat cuando ve wipe:true).
export const revocarRemotoSchema = z.object({
  tenant_id: z.string().min(1).max(128),
  device_code: z.string().min(1).max(64),
  motivo: z.string().max(280).default("revocado por el dueño"),
});

// Auth + Onboarding P0 (ADR-0001). Listas cerradas, mismo estilo que medios.
export const planSchema = z.enum(["demo", "base", "plus"]);

export const tenantSchema = z.object({
  nombre_comercio: z.string().min(3, "el nombre del comercio debe tener al menos 3 letras").max(80),
  plan: planSchema,
  owner_google_sub: z.string().min(1, "falta el dueño").max(128),
  moneda: z.literal("ARS"),
  request_key: z.string().min(1).max(128).optional(),
});

export const rolSchema = z.enum(["dueno", "empleado"]);

// Placeholder mínimo real de interruptores operativos (AU4.4).
export const PERMISOS_EMPLEADO = [
  "registrar_devoluciones",
  "registrar_retiros_caja",
  "ver_saldos_caja",
  "crear_productos",
] as const;
export type PermisoEmpleado = (typeof PERMISOS_EMPLEADO)[number];
export const permisoEmpleadoSchema = z.enum(PERMISOS_EMPLEADO);

export const membershipSchema = z.object({
  google_sub: z.string().min(1, "falta el usuario").max(128),
  rol: rolSchema,
  invitation_token_hash: z.string().min(1).max(256).optional(),
  permisos: z.array(permisoEmpleadoSchema).default([]),
});

export const invitationSchema = z.object({
  email: z.string().email("email inválido").max(320),
  rol: rolSchema,
  permisos: z.array(permisoEmpleadoSchema).default([]),
});

export const acceptInvitationSchema = z.object({
  token: z.string().min(1, "falta el token de invitación").max(512),
});

// C17 turnos (ADR-0004): apertura de turno pendiente + conteo a ciegas.
// El que cuenta no ve el esperado hasta conciliar.
export const postShiftSchema = z.object({
  fecha_jornada: z.string().min(1).max(10),
  turno: z.string().min(1).max(32),
  entregado_por: z.string().min(1).max(128),
  esperado_centavos: z.number().int().min(0).max(999_999_999),
});
export const conciliateShiftSchema = z.object({
  turno_id: z.string().uuid(),
  contado_centavos: z.number().int().min(0).max(999_999_999),
  conteos_por_medio: z
    .array(z.object({ medio: z.string().min(1).max(32), monto_centavos: z.number().int().min(0).max(999_999_999) }))
    .min(1)
    .max(5),
});
export const resolveShiftSchema = z.object({
  turno_id: z.string().uuid(),
  nota: z.string().min(1).max(280),
  rol: rolSchema,
  resuelto_por: z.string().min(1).max(128),
});
export const dropSchema = z.object({
  fecha_jornada: z.string().min(1).max(10),
  monto_centavos: z.number().int().positive().max(999_999_999),
  motivo: z.string().max(280).optional(),
  creado_por: z.string().min(1).max(128),
  sorpresa: z.boolean().default(false),
});
export const closeSchema = z.object({
  fecha_jornada: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  close_type: z.enum(["manual", "automatica"]),
});
export const reversalSchema = z.object({
  revierte_a: z.string().min(1).max(128),
  motivo: z.string().max(280).optional(),
  actor: z.string().min(1).max(128),
});
const descuentoSpecSchema = z.union([
  z.object({ tipo: z.literal("monto"), monto_centavos: z.number().int().min(0) }),
  z.object({ tipo: z.literal("porcentaje"), porcentaje_bp: z.number().int().min(1).max(10000) }),
]);
export const discountPreviewSchema = z.object({
  lineas: z.array(salesLineSchema).min(1).max(50),
  descuentos_linea: z.array(descuentoSpecSchema.nullable()).max(50).optional(),
  descuento_ticket: descuentoSpecSchema.optional(),
});
export const mediumCorrectionSchema = z.object({
  sale_id: z.string().uuid(),
  medio_nuevo: medioSchema,
  motivo: z.string().min(1).max(280),
  actor: z.string().min(1).max(128),
});
export const pricePreviewSchema = z.object({
  direccion: z.enum(["suba", "baja"]),
  porcentaje: z.number().min(0.01).max(3000),
  paso_centavos: z.number().int().positive().max(999_999_999).optional(),
  items: z.array(z.object({ sku: z.string().min(1), vigente_centavos: z.number().int().min(0), costo_centavos: z.number().int().min(0).optional() })).min(1).max(500),
});
export const priceAdjustmentSchema = pricePreviewSchema.extend({
  vigencia_tipo: z.enum(["ahora", "programada"]),
  aplica_en: z.string().datetime({ offset: true }).nullable().optional(),
  confirmado: z.boolean(),
  creado_por: z.string().min(1).max(128),
  // GP7: scoping opcional al comercio; con tenant_id se exige Dueño.
  tenant_id: z.string().min(1).max(128).optional(),
});
export const creditSaleSchema = z.object({
  customer_id: z.string().min(1).max(64),
  lineas: z.array(salesLineSchema).min(1).max(50),
  device_code: z.string().min(4).max(32),
  seq_local: z.number().int().positive(),
  tope_centavos: z.number().int().min(0).max(999_999_999),
  saldo_actual_centavos: z.number().int().min(0).max(999_999_999).default(0),
});
export const creditPaymentSchema = z.object({
  customer_id: z.string().min(1).max(64),
  monto_centavos: z.number().int().positive().max(999_999_999),
  medio: medioSchema,
});
// O2.1 proveedores + OC (espejo de supplierInputSchema del módulo).
export const purchaseOrderCreateSchema = z.object({
  supplier_cuit: z.string().min(11).max(14),
  lineas: z
    .array(z.object({ sku: z.string().min(1).max(64), qty: z.number().int().min(1).max(9999), costo_centavos: z.number().int().min(0).max(999_999_999) }))
    .min(1)
    .max(100),
  creado_por: z.string().min(1).max(128),
});
export const closeOrderSchema = z.object({
  order_id: z.string().min(1).max(128),
  quien: z.string().min(1).max(128),
});
// O2.2 borradores proveedor (FP1-FP12): foto al bot -> OCR -> confirma 1 toque.
export const draftIngestSchema = z.object({
  origen: z.enum(["wa", "gmail"]),
  bytes_ref: z.string().min(1).max(512),
  es_comprobante: z.boolean(),
  cuit_texto: z.string().max(14).optional(),
  nombre_proveedor: z.string().max(80).optional(),
  fecha_texto: z.string().max(10).optional(),
  total_texto: z.string().max(32).optional(),
  foto_pendiente: z.boolean().default(false),
});
export const draftResolveSchema = z.object({
  draft_id: z.string().min(1).max(128),
  quien: z.string().min(1).max(128),
});
export const supplierPaymentSchema = z.object({
  supplier_cuit: z.string().min(11).max(14),
  monto_centavos: z.number().int().positive().max(999_999_999),
  metodo: medioSchema,
  fecha_iso: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  creado_por: z.string().min(1).max(128),
  factura_id: z.string().min(1).max(128).optional(),
});
// O2.3 cuentas + facturas de servicios (reusa cuentaSchema/facturaSchema del módulo).
export const serviceBillPaySchema = z.object({
  bill_id: z.string().min(1).max(128),
  servicio: z.enum(["luz", "gas", "agua", "internet", "telefono", "tasas", "arca", "otro"]),
  proveedor: z.string().min(2).max(80),
  numero_cuenta: z.string().max(40).nullable().optional(),
  medio: medioSchema,
  nota_extra: z.string().max(280).optional(),
});
// O2.4 beneficiarios + órdenes de pago (OP: el bot prepara, el comerciante paga).
export const payeeSchema = z.object({
  nombre: z.string().min(1).max(80),
  tipo: z.enum(["proveedor", "propietario", "servicio", "impuesto", "otro"]),
  medio_preferido: medioSchema,
  alias: z.string().max(80).optional(),
  cbu: z.string().max(24).optional(),
  cuit: z.string().max(14).optional(),
  link_pago_url: z.string().url().max(512).optional(),
});
export const prepareOrderSchema = z.object({
  payee_id: z.string().min(1).max(128),
  concepto: z.string().min(1).max(140),
  monto_centavos: z.number().int().positive().max(999_999_999),
  vence_el_ms: z.number().int().positive(),
  medio_sugerido: medioSchema,
  instruccion: z.enum(["link", "transferencia", "codigo_pago", "efectivo"]),
  link_url: z.string().url().max(512).optional(),
  referencia: z.string().min(1).max(64).optional(),
  categoria: z.enum(["pago_proveedores", "sin_factura", "alquiler", "luz", "gas", "servicios", "impuestos"]).optional(),
  nota: z.string().max(280).optional(),
  creado_por: z.string().min(1).max(128),
});
export const confirmOrderPaymentSchema = z.object({
  order_id: z.string().min(1).max(128),
  version_esperada: z.number().int().min(1),
  monto_pagado_centavos: z.number().int().positive().max(999_999_999).optional(),
  medio: medioSchema,
  nota: z.string().max(280).optional(),
  comprobante_ref: z.string().min(1).max(512).optional(),
  actor: z.string().min(1).max(128),
});
export const cancelOrderSchema = z.object({
  order_id: z.string().min(1).max(128),
  version_esperada: z.number().int().min(1),
  motivo: z.string().min(1).max(280),
  actor: z.string().min(1).max(128),
});
// O3.1 resumen de cierre por email (NE4): snapshot inmutable del cierre.
export const emailCloseSummarySchema = z.object({
  tenant_id: z.string().min(1).max(128),
  cierre_id: z.string().min(1).max(128),
  fecha_jornada: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  destinatario: z.string().email("email inválido").max(320),
  nombre_comercio: z.string().min(1).max(80).default("Mi comercio"),
  tipo: z.enum(["manual", "automatica"]).default("manual"),
});
export const returnItemSchema = z.object({
  product_id: z.string().min(1).max(64),
  qty: z.number().int().min(1).max(999),
});

export const postReturnsSchema = z.object({
  sale_id: z.string().uuid(),
  monto_centavos: z.number().int().positive().max(999_999_999),
  items: z.array(returnItemSchema).min(1).max(50),
  medio: medioSchema,
  motivo: z.string().min(1).max(280),
  actor: z.string().min(1).max(128),
  client_occurred_at: z.string().datetime({ offset: true }),
});

// FE-S16 ND manual Dueño: vinculada a factura con CAE + CbtesAsoc + caja asociada.
export const postNdSchema = z.object({
  factura_sale_id: z.string().uuid(),
  monto_centavos: z.number().int().positive().max(999_999_999),
  motivo: z.string().min(1).max(280),
  actor: z.string().min(1).max(128),
  caja_movement_id: z.string().min(1).max(128).optional(),
  client_occurred_at: z.string().datetime({ offset: true }),
});

// T3 fiscal: wizard + retry bandeja (FE-S4/S5/S20).
export const fiscalWizardSchema = z.object({
  tenant_id: z.string().min(1).max(128),
  accion: z.enum(["avanzar", "pausar", "resumir"]),
  paso: z.number().int().min(0).max(6).optional(),
});

export const fiscalRetrySchema = z.object({
  fiscal_document_id: z.string().min(1).max(128),
  correccion_doc_nro: z.string().max(11).optional(),
  correccion_cond_iva: z.number().int().min(1).max(9).optional(),
});

// G2d fiscal: emisión durable de un doc pendiente por id. Cuit opcional; sin
// él se usa la fila fiscal_settings o ARCA_CUIT_PROVEEDOR.
export const fiscalEmitirSchema = z.object({
  fiscal_document_id: z.string().uuid(),
  cuit: z.string().min(11).max(14).optional(),
});
// OCR Fase 0 (ADR-0005): job idempotente por wamid/message-id (E2).
export const ocrJobSchema = z.object({
  origen: z.enum(["wa", "gmail"]),
  bytes_ref: z.string().min(1).max(512).optional(),
  pdf_ref: z.string().min(1).max(512).optional(),
  emisor: z.string().min(1).max(120).optional(),
  device_code: z.string().min(4).max(32).optional(),
  es_comprobante: z.boolean(),
  nombre_proveedor: z.string().max(80).optional(),
  foto_pendiente: z.boolean().default(false),
  // Textos para extracción determinista Fase 0 (pdf digital → ocr → email).
  texto_pdf: z.string().max(20000).optional(),
  texto_ocr: z.string().max(20000).optional(),
  cuerpo_email: z.string().max(20000).optional(),
});
export const ocrEditarSchema = z.object({
  quien: z.string().min(1).max(128),
  cuit_texto: z.string().max(14).optional(),
  nombre_proveedor: z.string().max(80).optional(),
  fecha_texto: z.string().max(10).optional(),
  total_texto: z.string().max(32).optional(),
});
export const ocrConfirmarSchema = z.object({
  quien: z.string().min(1).max(128),
});
export const ocrDescartarSchema = z.object({
  quien: z.string().min(1).max(128).optional(),
  motivo: z.string().max(280).optional(),
});
// ON5-ON12 sin UX: contratos API onboarding. Listas cerradas, mismo estilo.
export const tourPasoSchema = z.object({
  tenant_id: z.string().min(1).max(128),
  paso: z.number().int().min(0).max(50),
  estado: z.enum(["en_curso", "completado", "saltado"]),
});
export const checklistSaltarSchema = z.object({
  tenant_id: z.string().min(1).max(128),
  paso: z.enum(["productos", "umbrales", "proveedor", "empleado", "whatsapp"]),
  accion: z.enum(["saltar", "retomar", "ocultar", "mostrar"]),
});
export const ejemploSchema = z.object({
  tenant_id: z.string().min(1).max(128),
  accion: z.enum(["activar", "descartar"]),
  rubro: z.enum(["kiosco", "almacen", "despensa", "libreria", "otro"]).default("kiosco"),
});
export const bienvenidaSchema = z.object({
  tenant_id: z.string().min(1).max(128),
  numero: z.string().min(1).max(32),
});
export const videoProgresoSchema = z.object({
  tenant_id: z.string().min(1).max(128),
  progreso: z.number().min(0).max(100),
  evento: z.enum(["inicio", "mitad", "fin"]),
});
export const embudoQuerySchema = z.object({
  desde: z.string().datetime({ offset: true }).optional(),
  rubro: z.string().max(32).optional(),
  dispositivo: z.enum(["celular", "pc", "tablet"]).optional(),
});
// ON1 alta autoservicio: tres datos más opt-in. Sin CUIT ni tarjeta.
export const rubroSchema = z.enum(["kiosco", "almacen", "despensa", "libreria", "otro"]);
export const altaAutoservicioSchema = z.object({
  nombre_comercio: z.string().min(2, "el nombre debe tener al menos 2 letras").max(60),
  rubro: rubroSchema,
  rubro_detalle: z.string().max(80).optional().default(""),
  numero: z.string().max(32).optional().default(""),
  opt_in: z.boolean().default(false),
  request_key: z.string().min(1).max(128).optional(),
});
