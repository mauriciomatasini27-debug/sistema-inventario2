import { bigint, boolean, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

// LANE WA — Bot WhatsApp slice mínimo (PRD Bot B1/B2, ADR-0001/0003).
// Control: identidades ya existen mínimas en schema.ts (whatsappIdentities);
// acá van códigos VINCULAR, uso/costo y preferencias. Comercio: nada de stock
// cacheado — el bot lee la base del tenant en vivo por identidad verificada.
// Todo append-only salvo preferencias (upsert por usuario+tenant).

// B1.1/B1.2: código VINCULAR de un solo uso, 6 dígitos, vence 10 min.
// Se guarda hash, nunca el código plano. Un pendiente por número.
export const whatsappCodes = pgTable("whatsapp_codes", {
  id: uuid("id").primaryKey().defaultRandom(),
  numeroE164: text("numero_e164").notNull(),
  codigoHash: text("codigo_hash").notNull(),
  metodo: text("metodo").notNull().default("vincular"),
  expiraEn: timestamp("expira_en").notNull(),
  usadoEn: timestamp("usado_en"),
  intentos: integer("intentos").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// B2.6/Costos: cada plantilla de utilidad paga (~USD 0,026 AR) se contabiliza
// por comercio. Respuestas libres dentro de ventana 24h no usan plantilla.
export const whatsappUsage = pgTable("whatsapp_usage", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id"),
  numeroE164: text("numero_e164").notNull(),
  wamid: text("wamid").notNull().unique(),
  tipo: text("tipo").notNull(),
  plantilla: text("plantilla"),
  // B5/B9/B14/B15: cada plantilla de utilidad paga (~USD 0,026 AR) se
  // contabiliza por comercio. Dinero siempre bigint centavos.
  costoCentavos: bigint("costo_centavos", { mode: "bigint" }).notNull().default(0n),
  estado: text("estado").notNull().default("enviado"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// El opt-in de WhatsApp no es el canal: ALTA y BAJA no escriben `canal`.
export const notificationPreferences = pgTable("notification_preferences", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id"),
  googleSub: text("google_sub").notNull(),
  canal: text("canal").notNull().default("email"),
  optIn: boolean("opt_in").notNull().default(false),
  optInAt: timestamp("opt_in_at"),
  optInTexto: text("opt_in_texto"),
  avisoMatutino: boolean("aviso_matutino").notNull().default(true),
  avisoHora: text("aviso_hora").notNull().default("08:00"),
  resumenViernes: boolean("resumen_viernes").notNull().default(true),
  resumenViernesHora: text("resumen_viernes_hora").notNull().default("vie 18:00"),
  resumenCierre: boolean("resumen_cierre").notNull().default(false),
  pausadoHasta: timestamp("pausado_hasta"),
  zonaHoraria: text("zona_horaria").notNull().default("America/Argentina"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [
  uniqueIndex("notification_preferences_tenant_sub_uidx").on(t.tenantId, t.googleSub),
]);

export const botTurnos = pgTable("bot_turnos", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  wamid: text("wamid").notNull().unique(),
  numeroE164: text("numero_e164").notNull(),
  googleSub: text("google_sub").notNull(),
  pregunta: text("pregunta").notNull(),
  respuesta: text("respuesta").notNull(),
  fuente: text("fuente").notNull(),
  creadoEn: timestamp("creado_en").notNull().defaultNow(),
});

// Estado de conversación corto por usuario (Flujos 2-4): paso actual,
// producto en desambiguación, borrador abierto. Sin datos de stock.
// El TTL se aplica en el adaptador (expiración por updatedAt).
export type ContextoSesionWhatsapp = Record<string, unknown>;

export const whatsappSessions = pgTable("whatsapp_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  numeroE164: text("numero_e164").notNull().unique(),
  paso: text("paso").notNull().default("libre"),
  contexto: jsonb("contexto").$type<ContextoSesionWhatsapp>().notNull().default({}),
  // B4-B10: TTL de sesión corta (30 min). El adaptador la expira por updatedAt
  // o por esta columna cuando hay reloj real; en memoria equivale al TTL.
  expiraEn: timestamp("expira_en"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Alias de producto por comercio para la búsqueda del bot (PRD 6.5, F1.5):
// GIN `f_norm(alias)` en migración 0041; aliasNorm se mantiene para otros usos.
export const productAliases = pgTable("product_aliases", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id"),
  sku: text("sku").notNull(),
  alias: text("alias").notNull(),
  aliasNorm: text("alias_norm").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
