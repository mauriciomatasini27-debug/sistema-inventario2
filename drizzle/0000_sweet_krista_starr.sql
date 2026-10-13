CREATE TABLE "cash_audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"accion" text NOT NULL,
	"movimiento_id" uuid,
	"revierte_a" uuid,
	"detalle" jsonb,
	"actor" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cash_days" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fecha_jornada" text NOT NULL,
	"opened_at" timestamp DEFAULT now() NOT NULL,
	"opened_by" text NOT NULL,
	"estado" text DEFAULT 'abierta' NOT NULL,
	"ultimo_movimiento_id" uuid,
	CONSTRAINT "cash_days_fecha_jornada_unique" UNIQUE("fecha_jornada")
);
--> statement-breakpoint
CREATE TABLE "cash_drawer_drops" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"idempotency_key" text NOT NULL,
	"fecha_jornada" text NOT NULL,
	"monto_centavos" bigint NOT NULL,
	"motivo" text,
	"creado_por" text NOT NULL,
	"sorpresa" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "cash_drawer_drops_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "cash_reversals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"idempotency_key" text NOT NULL,
	"revierte_a" uuid NOT NULL,
	"movimiento_id" uuid NOT NULL,
	"actor" text NOT NULL,
	"motivo" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "cash_reversals_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "cash_reversals_revierte_a_unique" UNIQUE("revierte_a"),
	CONSTRAINT "cash_reversals_movimiento_id_unique" UNIQUE("movimiento_id")
);
--> statement-breakpoint
CREATE TABLE "closing_summaries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"idempotency_key" text NOT NULL,
	"fecha_jornada" text NOT NULL,
	"close_type" text NOT NULL,
	"total_centavos" bigint NOT NULL,
	"por_medio" jsonb NOT NULL,
	"ultimo_movimiento_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "closing_summaries_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "closing_summaries_fecha_jornada_unique" UNIQUE("fecha_jornada")
);
--> statement-breakpoint
CREATE TABLE "handover_counts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"handover_id" uuid NOT NULL,
	"medio" text NOT NULL,
	"monto_centavos" bigint NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shift_handovers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"idempotency_key" text NOT NULL,
	"fecha_jornada" text NOT NULL,
	"turno" text NOT NULL,
	"entregado_por" text NOT NULL,
	"recibido_por" text,
	"esperado_centavos" bigint NOT NULL,
	"contado_centavos" bigint,
	"diferencia_centavos" bigint,
	"estado" text DEFAULT 'pendiente' NOT NULL,
	"resolucion_nota" text,
	"resuelto_por" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "shift_handovers_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "customer_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"debe_centavos" bigint DEFAULT 0 NOT NULL,
	"haber_centavos" bigint DEFAULT 0 NOT NULL,
	"sale_id" uuid,
	"revierte_a" uuid,
	"idempotency_key" text NOT NULL,
	"motivo" varchar(280),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"client_occurred_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "customer_movements_revierte_a_unique" UNIQUE("revierte_a"),
	CONSTRAINT "customer_movements_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nombre" varchar(80) NOT NULL,
	"telefono" text,
	"dni" text,
	"notas" varchar(280),
	"tope_centavos" bigint DEFAULT 0 NOT NULL,
	"plazo_dias" integer DEFAULT 30 NOT NULL,
	"saldo_cache_centavos" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "delivery_status" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"outbox_id" uuid NOT NULL,
	"evento" text NOT NULL,
	"provider_event_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "delivery_status_provider_event_id_unique" UNIQUE("provider_event_id")
);
--> statement-breakpoint
CREATE TABLE "email_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid,
	"categoria" text DEFAULT 'cierre' NOT NULL,
	"plantilla" text DEFAULT 'cierre_v1' NOT NULL,
	"destinatario" text NOT NULL,
	"asunto" text NOT NULL,
	"html" text NOT NULL,
	"texto" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"estado" text DEFAULT 'pendiente' NOT NULL,
	"intentos" integer DEFAULT 0 NOT NULL,
	"provider_message_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "email_outbox_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "email_suppressions" (
	"email_hash" text PRIMARY KEY NOT NULL,
	"motivo" text NOT NULL,
	"desde" timestamp DEFAULT now() NOT NULL,
	"hasta" timestamp
);
--> statement-breakpoint
CREATE TABLE "notification_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"google_sub" text NOT NULL,
	"canal" text DEFAULT 'email' NOT NULL,
	"idempotency_key" text NOT NULL,
	"estado" text DEFAULT 'pendiente' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "notification_deliveries_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "notification_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid,
	"tipo" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"ref_tipo" text,
	"ref_id" text,
	"payload" jsonb NOT NULL,
	"dedupe_key" text NOT NULL,
	"estado" text DEFAULT 'pendiente' NOT NULL,
	"procesar_desde" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "notification_events_dedupe_key_unique" UNIQUE("dedupe_key")
);
--> statement-breakpoint
CREATE TABLE "fiscal_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"idempotency_key" text NOT NULL,
	"sale_id" uuid,
	"cbte_tipo" text NOT NULL,
	"pto_vta" text NOT NULL,
	"cbte_nro" bigint,
	"cbte_fch" text NOT NULL,
	"doc_tipo" text NOT NULL,
	"doc_nro" bigint NOT NULL,
	"cond_iva_receptor" text NOT NULL,
	"imp_total_centavos" bigint NOT NULL,
	"imp_iva_centavos" bigint,
	"alic_iva_id" text,
	"client_ocurred_at" timestamp,
	"venta_leyenda" text,
	"estado" text DEFAULT 'pendiente' NOT NULL,
	"cae" text,
	"cae_vto" text,
	"qr_payload" text,
	"request" jsonb,
	"response" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "fiscal_documents_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "fiscal_sequences" (
	"punto_venta" text NOT NULL,
	"cbte_tipo" text NOT NULL,
	"last_number" bigint DEFAULT 0 NOT NULL,
	"last_cbte_fch" text,
	"in_flight_document_id" uuid
);
--> statement-breakpoint
CREATE TABLE "fiscal_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cuit" text NOT NULL,
	"condicion_iva" text DEFAULT 'monotributo' NOT NULL,
	"punto_venta" text NOT NULL,
	"modo" text DEFAULT 'automatico' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "official_payment_domains" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dominio" text NOT NULL,
	"tipo" text NOT NULL,
	"entidad" text NOT NULL,
	"url_pago_base" text,
	"activo" boolean DEFAULT true NOT NULL,
	"verificado_por" text,
	"verificado_at" timestamp,
	"notas" text,
	CONSTRAINT "official_payment_domains_dominio_unique" UNIQUE("dominio")
);
--> statement-breakpoint
CREATE TABLE "payees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nombre" text NOT NULL,
	"tipo" text DEFAULT 'proveedor' NOT NULL,
	"cuit" text,
	"numero_cliente" text,
	"official_domain_id" uuid,
	"cbu" text,
	"alias" text,
	"titular" text,
	"cuit_titular" text,
	"medio_preferido" text DEFAULT 'Transferencia' NOT NULL,
	"link_pago_url" text,
	"link_pago_dominio" text,
	"activo" boolean DEFAULT true NOT NULL,
	"datos_cobro_actualizados_at" timestamp,
	"datos_cobro_actualizados_por" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_order_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_order_id" uuid NOT NULL,
	"de_estado" text,
	"a_estado" text NOT NULL,
	"version" integer NOT NULL,
	"actor" text NOT NULL,
	"origen" text NOT NULL,
	"detalle" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"idempotency_key" text NOT NULL,
	"numero" text NOT NULL,
	"payee_id" uuid NOT NULL,
	"tipo" text DEFAULT 'proveedor' NOT NULL,
	"concepto" text NOT NULL,
	"categoria" text DEFAULT 'pago_proveedores' NOT NULL,
	"monto_centavos" bigint NOT NULL,
	"moneda" text DEFAULT 'ARS' NOT NULL,
	"vence_el" timestamp NOT NULL,
	"metodo_sugerido" text NOT NULL,
	"instruccion_tipo" text NOT NULL,
	"instruccion_snapshot" jsonb NOT NULL,
	"link_dominio" text,
	"referencia" text,
	"supplier_invoice_id" text,
	"servicio_id" text,
	"estado" text DEFAULT 'preparada' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"cash_movement_id" uuid,
	"paid_at" timestamp,
	"paid_amount_centavos" bigint,
	"paid_method" text,
	"nota" text,
	"comprobante_ref" text,
	"cancel_motivo" text,
	"creado_por" text NOT NULL,
	"confirmado_por" text,
	"enviado_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp,
	CONSTRAINT "payment_orders_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "payment_orders_numero_unique" UNIQUE("numero")
);
--> statement-breakpoint
CREATE TABLE "cost_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sku" text NOT NULL,
	"costo_centavos" bigint NOT NULL,
	"precio_vigente_centavos" bigint NOT NULL,
	"motivo" text NOT NULL,
	"creado_por" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "price_adjustments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"idempotency_key" text NOT NULL,
	"direccion" text NOT NULL,
	"porcentaje_bp" integer NOT NULL,
	"paso_centavos" bigint DEFAULT 1000 NOT NULL,
	"vigencia_tipo" text NOT NULL,
	"aplica_en" timestamp,
	"estado" text DEFAULT 'pendiente' NOT NULL,
	"confirmado" boolean DEFAULT false NOT NULL,
	"creado_por" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"aplicado_en" timestamp,
	"cancelado_en" timestamp,
	CONSTRAINT "price_adjustments_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "price_overrides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sku" text NOT NULL,
	"paso_centavos" bigint,
	"motivo" text,
	"creado_por" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "price_overrides_sku_unique" UNIQUE("sku")
);
--> statement-breakpoint
CREATE TABLE "price_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"paso_centavos" bigint DEFAULT 1000 NOT NULL,
	"direccion" text DEFAULT 'arriba' NOT NULL,
	"tope_suba_bp" integer DEFAULT 30000 NOT NULL,
	"tope_baja_bp" integer DEFAULT 9000 NOT NULL,
	"actualizado_por" text,
	"updated_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "pricing_audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor" text NOT NULL,
	"ajuste_id" uuid,
	"sku" text,
	"antes" jsonb NOT NULL,
	"despues" jsonb NOT NULL,
	"motivo" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_markups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sku" text NOT NULL,
	"modo" text DEFAULT 'manual' NOT NULL,
	"markup_bp" integer,
	"precio_manual_centavos" bigint,
	"updated_at" timestamp,
	CONSTRAINT "product_markups_sku_unique" UNIQUE("sku")
);
--> statement-breakpoint
CREATE TABLE "purchase_order_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"sku" text NOT NULL,
	"qty" integer NOT NULL,
	"costo_centavos" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"idempotency_key" text NOT NULL,
	"supplier_cuit" text NOT NULL,
	"estado" text DEFAULT 'abierta' NOT NULL,
	"total_centavos" bigint NOT NULL,
	"creado_por" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"cerrado_en" timestamp,
	CONSTRAINT "purchase_orders_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "supplier_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"idempotency_key" text NOT NULL,
	"origen" text NOT NULL,
	"bytes_ref" text NOT NULL,
	"cuit" text,
	"nombre_proveedor" text,
	"fecha_iso" text,
	"total_centavos" bigint,
	"items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"confianza" jsonb NOT NULL,
	"estado" text DEFAULT 'pendiente' NOT NULL,
	"foto_pendiente" boolean DEFAULT false NOT NULL,
	"factura_id" uuid,
	"confirmado_por" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"vence_at" timestamp NOT NULL,
	CONSTRAINT "supplier_drafts_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "supplier_invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"idempotency_key" text NOT NULL,
	"draft_id" uuid,
	"supplier_cuit" text NOT NULL,
	"nombre_proveedor" text,
	"tipo" text DEFAULT 'factura' NOT NULL,
	"fecha_iso" text NOT NULL,
	"total_centavos" bigint NOT NULL,
	"items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"compensatoria_de" uuid,
	"creado_por" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "supplier_invoices_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "supplier_match_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"draft_id" text NOT NULL,
	"order_id" uuid NOT NULL,
	"coincide" boolean NOT NULL,
	"motivo" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"idempotency_key" text NOT NULL,
	"factura_id" uuid,
	"supplier_cuit" text NOT NULL,
	"monto_centavos" bigint NOT NULL,
	"metodo" text NOT NULL,
	"categoria_id" text DEFAULT 'pago_proveedor' NOT NULL,
	"creado_por" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "supplier_payments_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cuit" text NOT NULL,
	"nombre" text NOT NULL,
	"email" text,
	"telefono" text,
	"activo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp,
	CONSTRAINT "suppliers_cuit_unique" UNIQUE("cuit")
);
--> statement-breakpoint
CREATE TABLE "email_ingestion_filters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"remitente" text NOT NULL,
	"servicio" text,
	"proveedor" text,
	"keywords" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_ingestion_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_id" text NOT NULL,
	"history_id" text,
	"remitente_dominio" text,
	"decision" text NOT NULL,
	"motivo" text,
	"filtro_id" uuid,
	"account_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "email_ingestion_log_message_id_unique" UNIQUE("message_id")
);
--> statement-breakpoint
CREATE TABLE "service_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"servicio" text NOT NULL,
	"proveedor" text NOT NULL,
	"titular" text NOT NULL,
	"numero_cuenta" text,
	"alias" text,
	"vencimiento_tipico_dia" integer,
	"email_origen" text,
	"medio_habitual" text,
	"debito_automatico" boolean DEFAULT false NOT NULL,
	"activa" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "utility_bills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"message_id" text NOT NULL,
	"periodo" text NOT NULL,
	"vencimiento" text NOT NULL,
	"monto_centavos" bigint NOT NULL,
	"estado" text DEFAULT 'pendiente' NOT NULL,
	"necesita_revision" boolean DEFAULT false NOT NULL,
	"origen" text NOT NULL,
	"confianza" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "utility_bills_message_id_unique" UNIQUE("message_id")
);
--> statement-breakpoint
CREATE TABLE "sale_returns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"idempotency_key" text NOT NULL,
	"sale_id" uuid NOT NULL,
	"numero_devolucion" text NOT NULL,
	"monto_centavos" bigint NOT NULL,
	"acumulado_previo_centavos" bigint DEFAULT 0 NOT NULL,
	"acumulado_nuevo_centavos" bigint NOT NULL,
	"medio" text NOT NULL,
	"fue_a_cuenta" boolean DEFAULT false NOT NULL,
	"motivo" text NOT NULL,
	"actor" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "sale_returns_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "sale_returns_numero_devolucion_unique" UNIQUE("numero_devolucion")
);
--> statement-breakpoint
CREATE TABLE "ticket_discounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sale_id" uuid NOT NULL,
	"linea_idx" integer NOT NULL,
	"sku" text NOT NULL,
	"bruto_centavos" bigint NOT NULL,
	"desc_linea_centavos" bigint DEFAULT 0 NOT NULL,
	"desc_ticket_centavos" bigint DEFAULT 0 NOT NULL,
	"neto_centavos" bigint NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ticket_payment_corrections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"idempotency_key" text NOT NULL,
	"sale_id" uuid NOT NULL,
	"medio_original" text NOT NULL,
	"medio_nuevo" text NOT NULL,
	"motivo" text NOT NULL,
	"actor" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ticket_payment_corrections_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "notification_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid,
	"google_sub" text NOT NULL,
	"opt_in" boolean DEFAULT false NOT NULL,
	"opt_in_at" timestamp,
	"opt_in_texto" text,
	"aviso_matutino" boolean DEFAULT true NOT NULL,
	"aviso_hora" text DEFAULT '08:00' NOT NULL,
	"resumen_viernes" boolean DEFAULT true NOT NULL,
	"resumen_viernes_hora" text DEFAULT 'vie 18:00' NOT NULL,
	"resumen_cierre" boolean DEFAULT false NOT NULL,
	"pausado_hasta" timestamp,
	"zona_horaria" text DEFAULT 'America/Argentina' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_aliases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid,
	"sku" text NOT NULL,
	"alias" text NOT NULL,
	"alias_norm" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whatsapp_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"numero_e164" text NOT NULL,
	"codigo_hash" text NOT NULL,
	"metodo" text DEFAULT 'vincular' NOT NULL,
	"expira_en" timestamp NOT NULL,
	"usado_en" timestamp,
	"intentos" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whatsapp_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"numero_e164" text NOT NULL,
	"paso" text DEFAULT 'libre' NOT NULL,
	"contexto" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "whatsapp_sessions_numero_e164_unique" UNIQUE("numero_e164")
);
--> statement-breakpoint
CREATE TABLE "whatsapp_usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid,
	"numero_e164" text NOT NULL,
	"wamid" text NOT NULL,
	"tipo" text NOT NULL,
	"plantilla" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "whatsapp_usage_wamid_unique" UNIQUE("wamid")
);
--> statement-breakpoint
CREATE TABLE "auth_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid,
	"tipo" text NOT NULL,
	"actor" text,
	"detalle" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cash_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"idempotency_key" text NOT NULL,
	"sale_id" uuid,
	"tipo" text NOT NULL,
	"metodo" text NOT NULL,
	"categoria_id" text NOT NULL,
	"origen" text NOT NULL,
	"monto_centavos" bigint NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "cash_movements_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"device_code" text NOT NULL,
	"plataforma" text NOT NULL,
	"app_version" text NOT NULL,
	CONSTRAINT "devices_device_code_unique" UNIQUE("device_code")
);
--> statement-breakpoint
CREATE TABLE "id_mappings" (
	"op_id" uuid PRIMARY KEY NOT NULL,
	"id_provisorio" text NOT NULL,
	"id_definitivo" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"tenant_id" uuid,
	"email" varchar(320) NOT NULL,
	"rol" text DEFAULT 'empleado' NOT NULL,
	"permisos" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"estado" text DEFAULT 'pendiente' NOT NULL,
	"expira_at" timestamp NOT NULL,
	"creada_por" text,
	"aceptada_por" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "invitations_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid,
	"google_sub" text,
	"rol" text DEFAULT 'empleado' NOT NULL,
	"permisos" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"estado" text DEFAULT 'activo' NOT NULL,
	"revocado_at" timestamp,
	"revocado_por" text
);
--> statement-breakpoint
CREATE TABLE "ops_signals_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tipo" text NOT NULL,
	"payload" jsonb NOT NULL,
	"estado" text DEFAULT 'pendiente' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outbox" (
	"op_id" uuid PRIMARY KEY NOT NULL,
	"device_code" text NOT NULL,
	"device_seq" integer NOT NULL,
	"hlc" text NOT NULL,
	"modulo" text NOT NULL,
	"payload" jsonb NOT NULL,
	"estado" text DEFAULT 'pendiente' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_codes" (
	"codigo" text PRIMARY KEY NOT NULL,
	"sku" text NOT NULL,
	"padre" text
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sku" text NOT NULL,
	"nombre" text NOT NULL,
	"precio_centavos" bigint NOT NULL,
	"stock_actual" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "products_sku_unique" UNIQUE("sku")
);
--> statement-breakpoint
CREATE TABLE "provision_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid,
	"estado" text DEFAULT 'pendiente' NOT NULL,
	"paso_actual" text,
	"intentos" integer DEFAULT 0 NOT NULL,
	"error" text,
	"request_key" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "sales" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"idempotency_key" text NOT NULL,
	"medio" text NOT NULL,
	"total_centavos" bigint NOT NULL,
	"sobreventa" boolean DEFAULT false NOT NULL,
	"offline" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"client_occurred_at" timestamp NOT NULL,
	CONSTRAINT "sales_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id_hash" text PRIMARY KEY NOT NULL,
	"google_sub" text,
	"tenant_id" uuid,
	"expira_at" timestamp NOT NULL,
	"expira_absoluta" timestamp,
	"creado_at" timestamp DEFAULT now() NOT NULL,
	"last_seen_at" timestamp,
	"revocada_at" timestamp,
	"motivo_revocacion" text
);
--> statement-breakpoint
CREATE TABLE "stock_lots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sku" text NOT NULL,
	"cantidad" integer NOT NULL,
	"cantidad_restante" integer DEFAULT 0 NOT NULL,
	"vence_el" timestamp,
	"costo_centavos" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"idem_key" text NOT NULL,
	"sku" text NOT NULL,
	"lote_id" uuid,
	"delta" integer NOT NULL,
	"tipo" text NOT NULL,
	"motivo" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenant_databases" (
	"tenant_id" uuid PRIMARY KEY NOT NULL,
	"database" text NOT NULL,
	"estado" text DEFAULT 'pendiente' NOT NULL,
	"schema_version" text,
	CONSTRAINT "tenant_databases_database_unique" UNIQUE("database")
);
--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nombre_comercio" varchar(80) NOT NULL,
	"slug" varchar(100) NOT NULL,
	"estado" text DEFAULT 'pendiente' NOT NULL,
	"plan" text DEFAULT 'demo' NOT NULL,
	"moneda" varchar(3) DEFAULT 'ARS' NOT NULL,
	"owner_google_sub" text,
	"es_demo" boolean DEFAULT false NOT NULL,
	"request_key" text,
	"trial_hasta" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tenants_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "ticket_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sale_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"qty" integer NOT NULL,
	"precio_centavos" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tickets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sale_id" uuid NOT NULL,
	"definitivo" text,
	"provisorio" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tickets_definitivo_unique" UNIQUE("definitivo")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"google_sub" text PRIMARY KEY NOT NULL,
	"email" varchar(320) NOT NULL,
	"email_verificado" boolean DEFAULT false NOT NULL,
	"nombre" text,
	"foto_url" text,
	"estado" text DEFAULT 'activo' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"ultimo_login_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "whatsapp_identities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid,
	"google_sub" text,
	"numero" text,
	"estado" text DEFAULT 'pendiente' NOT NULL,
	"revocado_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "handover_counts" ADD CONSTRAINT "handover_counts_handover_id_shift_handovers_id_fk" FOREIGN KEY ("handover_id") REFERENCES "public"."shift_handovers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_status" ADD CONSTRAINT "delivery_status_outbox_id_email_outbox_id_fk" FOREIGN KEY ("outbox_id") REFERENCES "public"."email_outbox"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_event_id_notification_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."notification_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_order_id_purchase_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_events" ADD CONSTRAINT "auth_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_google_sub_users_google_sub_fk" FOREIGN KEY ("google_sub") REFERENCES "public"."users"("google_sub") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_codes" ADD CONSTRAINT "product_codes_sku_products_sku_fk" FOREIGN KEY ("sku") REFERENCES "public"."products"("sku") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provision_jobs" ADD CONSTRAINT "provision_jobs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_google_sub_users_google_sub_fk" FOREIGN KEY ("google_sub") REFERENCES "public"."users"("google_sub") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_lots" ADD CONSTRAINT "stock_lots_sku_products_sku_fk" FOREIGN KEY ("sku") REFERENCES "public"."products"("sku") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_databases" ADD CONSTRAINT "tenant_databases_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_owner_google_sub_users_google_sub_fk" FOREIGN KEY ("owner_google_sub") REFERENCES "public"."users"("google_sub") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_identities" ADD CONSTRAINT "whatsapp_identities_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_identities" ADD CONSTRAINT "whatsapp_identities_google_sub_users_google_sub_fk" FOREIGN KEY ("google_sub") REFERENCES "public"."users"("google_sub") ON DELETE no action ON UPDATE no action;