// LANE F — Ingesta Gmail CS1/CS2/CS4 (Nivel 2, Compras y gastos).
//
// Funciones puras: sin Gmail API real, sin PubSub real, sin OAuth tokens,
// sin PaddleOCR real (ADR-0005/0007: la API real y los tokens viven en el
// adaptador/infra, acá solo dominio determinista testeable).
//
// Pipeline ADR-0005: (1) texto embebido PDF digital primero, (2) OCR de
// imagen o PDF escaneado, (3) cuerpo del email como RESPALDO (nunca única
// fuente P1: si solo hay cuerpo, necesita_revision + confianza baja).
// Clasificación en 2 capas: capa 1 reglas (remitente catálogo + keywords +
// adjunto) acá; capa 2 LLM solo descriptor (solicitaLLM, NO implementada).
//
// Watch verificado ADR-0007: el evento trae email + historyId (sin
// contenido); renovación diaria + fallback history.list 15min + labelIds
// por tipo van como descriptores para el job (no llamados reales).
// Idempotencia CS9.1: message-id UNIQUE (duplicado => existente, E2).
// Borrador: vence 7 días + recuerdo 24h (ADR-0005 E5).

import type { ConfianzaCampo, OrigenExtraccion } from "./facturas_servicios.js";
import { parsear_fecha_ar, parsear_monto_ar } from "./facturas_servicios.js";

// ---------------------------------------------------------------------------
// Watch (Gmail users.watch → PubSub). Evento mínimo verificado ADR-0007.
// ---------------------------------------------------------------------------

export interface WatchEvent {
  readonly email: string;
  readonly historyId: string;
}

export function validar_watch_event(ev: WatchEvent): string[] {
  const errores: string[] = [];
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ev.email.trim())) errores.push("email inválido");
  if (!ev.historyId.trim()) errores.push("historyId requerido");
  return errores;
}

// Descriptor del job diario de renovación (expira ~7d, se renueva diario).
export interface JobDescriptor {
  readonly job: string;
  readonly cada: string;
  readonly accion: string;
}

export function descriptor_renovar_watch(): JobDescriptor {
  return Object.freeze({
    job: "renovar_gmail_watch",
    cada: "24h",
    accion: "POST gmail/v1/users/{userId}/watch con topicName PubSub; guarda historyId+expiration",
  });
}

// Descriptor del fallback: history.list cada 15min por si PubSub se pierde.
export function descriptor_fallback_history(desdeHistoryId: string): JobDescriptor & { readonly desde: string } {
  return Object.freeze({
    job: "gmail_history_fallback",
    cada: "15min",
    accion: "history.list con labelIds por tipo de servicio desde historyId guardado",
    desde: desdeHistoryId,
  });
}

// Descriptor del job nocturno de vencimientos (funciones puras en
// facturas_servicios.ts: proximas_a_vencer + vencidas).
export function descriptor_job_vencimientos(): JobDescriptor {
  return Object.freeze({
    job: "revisar_vencimientos_servicios",
    cada: "24h 03:00 America/Argentina_Buenos_Aires",
    accion: "derivar estados + avisar próximas (3d) y vencidas; el bot emite los avisos",
  });
}

// ---------------------------------------------------------------------------
// Entrada: email ya filtrado por remitente (CS1.4). El contenido crudo solo
// se usa para clasificar/extraer; al log va SOLO id+dominio+fecha (CS11.3).
// ---------------------------------------------------------------------------

export interface EmailEntrante {
  readonly messageId: string;
  readonly from: string;
  readonly subject: string;
  readonly cuerpo?: string;
  readonly tienePdf?: boolean;
  readonly pdfTexto?: string;
  readonly tieneImagen?: boolean;
  readonly ocrTexto?: string;
}

export interface FiltroIngesta {
  readonly id: string;
  readonly remitente: string;
  readonly servicio?: string;
  readonly proveedor?: string;
  readonly keywords: ReadonlyArray<string>;
  readonly activo: boolean;
}

export interface CuentaCatalogo {
  readonly accountId: string;
  readonly servicio: string;
  readonly proveedor: string;
  readonly emails: ReadonlyArray<string>;
}

// Keywords de comprobante (capa 1, CS2.2) y de descarte ("no es factura").
const KEYWORDS_FACTURA = ["factura", "boleta", "vencimiento", "liquidacion", "vep", "monotributo", "kwh", "m3"] as const;
const KEYWORDS_NO_FACTURA = [
  "recibimos tu pago",
  "gracias por tu pago",
  "pago acreditado",
  "publicidad",
  "encuesta",
  "promo",
] as const;

function dominio_de(from: string): string {
  const arroba = from.lastIndexOf("@");
  if (arroba < 0) return from.trim().toLowerCase();
  return from.slice(arroba + 1).trim().toLowerCase();
}

// El filtro guarda dominio ("edenor.com") o email exacto ("tasas@muni.gob.ar").
export function matchea_remitente(from: string, remitente: string): boolean {
  const f = from.trim().toLowerCase();
  const r = remitente.trim().toLowerCase();
  if (!r) return false;
  if (r.includes("@")) return f === r || f.endsWith(`<${r}>`);
  return dominio_de(f) === r || dominio_de(f).endsWith(`.${r}`);
}

function contiene_alguna(haystack: string, agujas: ReadonlyArray<string>): boolean {
  const h = haystack.toLowerCase();
  return agujas.some((k) => h.includes(k.toLowerCase()));
}

// ---------------------------------------------------------------------------
// Clasificación capa 1 (CS2.2): remitente en catálogo/filtro + keywords +
// adjunto. Si no alcanza => necesita_revision con descriptor a capa 2 LLM
// (NO implementada: queda el descriptor solicitaLLM para el adaptador).
// ---------------------------------------------------------------------------

export type DecisionIngesta = "para_procesar" | "necesita_revision" | "ignorar";

export interface Clasificacion {
  readonly decision: DecisionIngesta;
  readonly motivo: string;
  readonly filtroId: string | null;
  readonly accountId: string | null;
  readonly confianza: ConfianzaCampo;
  // Capa 2 LLM (Zod mínimo) pendiente: el adaptador lo pide solo si true.
  readonly solicitaLLM: boolean;
}

export function clasificar_capa1(
  email: Pick<EmailEntrante, "from" | "subject" | "cuerpo">,
  filtros: ReadonlyArray<FiltroIngesta>,
  catalogo: ReadonlyArray<CuentaCatalogo>,
): Clasificacion {
  const texto = `${email.subject} ${email.cuerpo ?? ""}`;
  if (contiene_alguna(texto, KEYWORDS_NO_FACTURA)) {
    return {
      decision: "ignorar",
      motivo: "no es factura (aviso de pago / publicidad)",
      filtroId: null,
      accountId: null,
      confianza: "alta",
      solicitaLLM: false,
    };
  }
  const filtro = filtros.find((f) => f.activo && matchea_remitente(email.from, f.remitente)) ?? null;
  const cuenta =
    catalogo.find((c) => c.emails.some((e) => matchea_remitente(email.from, e))) ?? null;
  const keywordsFiltro = filtro === null ? [] : filtro.keywords;
  const tieneKeyword =
    contiene_alguna(texto, KEYWORDS_FACTURA) || (keywordsFiltro.length > 0 && contiene_alguna(texto, keywordsFiltro));

  if ((filtro !== null || cuenta !== null) && tieneKeyword) {
    const ambos = filtro !== null && cuenta !== null;
    return {
      decision: "para_procesar",
      motivo: ambos ? "remitente en catálogo + keyword" : "remitente conocido + keyword",
      filtroId: filtro?.id ?? null,
      accountId: cuenta?.accountId ?? null,
      confianza: ambos ? "alta" : "media",
      solicitaLLM: false,
    };
  }
  if (filtro !== null || cuenta !== null) {
    // Remitente conocido pero sin keyword ni adjunto informado: dudoso
    // (CS2.3) => el Dueño confirma "¿esto es una factura?".
    return {
      decision: "necesita_revision",
      motivo: "remitente conocido sin señal de comprobante (capa 2 LLM pendiente)",
      filtroId: filtro?.id ?? null,
      accountId: cuenta?.accountId ?? null,
      confianza: "baja",
      solicitaLLM: true,
    };
  }
  return {
    decision: "necesita_revision",
    motivo: "remitente desconocido (capa 2 LLM pendiente)",
    filtroId: null,
    accountId: null,
    confianza: "baja",
    solicitaLLM: true,
  };
}

// ---------------------------------------------------------------------------
// Extracción en orden ADR-0005: PDF digital > OCR > cuerpo (respaldo).
// Cuerpo como única fuente => necesitaRevision + confianza baja (P1).
// ---------------------------------------------------------------------------

export interface FuentesExtraccion {
  readonly pdfTexto?: string;
  readonly ocrTexto?: string;
  readonly cuerpo?: string;
}

export interface Extraccion {
  readonly origen: OrigenExtraccion;
  readonly montoCentavos: bigint | null;
  readonly vencimientoIso: string | null;
  readonly confianzaMonto: ConfianzaCampo;
  readonly confianzaVencimiento: ConfianzaCampo;
  readonly necesitaRevision: boolean;
}

const MONTO_RE = /\$?\s*(\d{1,3}(?:\.\d{3})+,\d{2}|\d+,\d{2}|\$?\s*\d[\d.]*)/;
const FECHA_RE = /(\d{1,2}[/\-.]\d{1,2}[/\-.]\d{4})/;

function extraer_monto(texto: string): bigint | null {
  // Las fechas (20/10/2026) contienen dígitos que un patrón abierto
  // confundiría con montos: se tapan antes de buscar.
  const sinFechas = texto.replace(/\d{1,2}[/\-.]\d{1,2}[/\-.]\d{4}/g, " ");
  const conSigno = /\$\s*([\d.,]+)/.exec(sinFechas);
  const candidatos = conSigno?.[1] !== undefined ? [conSigno[1]] : [];
  const m = MONTO_RE.exec(sinFechas);
  if (m?.[1] !== undefined) candidatos.push(m[1]);
  for (const c of candidatos) {
    try {
      return parsear_monto_ar(c);
    } catch {
      continue;
    }
  }
  return null;
}

function extraer_fecha(texto: string): string | null {
  const m = FECHA_RE.exec(texto);
  if (!m?.[1]) return null;
  try {
    return parsear_fecha_ar(m[1]);
  } catch {
    return null;
  }
}

export function extraer_comprobante(fuentes: FuentesExtraccion): Extraccion {
  const pdf = fuentes.pdfTexto?.trim() ? fuentes.pdfTexto.trim() : null;
  const ocr = fuentes.ocrTexto?.trim() ? fuentes.ocrTexto.trim() : null;
  const cuerpo = fuentes.cuerpo?.trim() ? fuentes.cuerpo.trim() : null;
  const elegido = pdf ?? ocr ?? cuerpo;
  const origen: OrigenExtraccion = pdf !== null ? "pdf_digital" : ocr !== null ? "ocr" : "email_respaldo";
  if (elegido === null) {
    return {
      origen: "email_respaldo",
      montoCentavos: null,
      vencimientoIso: null,
      confianzaMonto: "baja",
      confianzaVencimiento: "baja",
      necesitaRevision: true,
    };
  }
  const monto = extraer_monto(elegido);
  const venc = extraer_fecha(elegido);
  const soloRespaldo = pdf === null && ocr === null;
  const confianzaBase: ConfianzaCampo = pdf !== null ? "alta" : ocr !== null ? "media" : "baja";
  return {
    origen,
    montoCentavos: monto,
    vencimientoIso: venc,
    confianzaMonto: monto === null ? "baja" : soloRespaldo ? "baja" : confianzaBase,
    confianzaVencimiento: venc === null ? "baja" : soloRespaldo ? "baja" : confianzaBase,
    necesitaRevision: monto === null || venc === null || soloRespaldo,
  };
}

// ---------------------------------------------------------------------------
// Borrador de ingesta (hasta confirmar no toca caja ni panel, CS4.8).
// Vence 7 días (E5), recuerdo a las 24h.
// ---------------------------------------------------------------------------

export const BORRADOR_MS = 7 * 86_400_000;
export const RECUERDO_MS = 86_400_000;

export type EstadoBorrador = "pendiente" | "confirmado" | "descartado" | "vencido";

export interface BorradorIngesta {
  readonly messageId: string;
  readonly accountId: string | null;
  readonly montoCentavos: bigint | null;
  readonly vencimientoIso: string | null;
  readonly origen: OrigenExtraccion;
  readonly creadoEnMs: number;
  readonly venceEnMs: number;
  readonly recuerdoEnMs: number;
  readonly estado: EstadoBorrador;
}

export function crear_borrador(args: {
  readonly messageId: string;
  readonly accountId?: string;
  readonly montoCentavos?: bigint;
  readonly vencimientoIso?: string;
  readonly origen?: OrigenExtraccion;
  readonly ahoraMs: number;
}): BorradorIngesta {
  return Object.freeze({
    messageId: args.messageId,
    accountId: args.accountId ?? null,
    montoCentavos: args.montoCentavos ?? null,
    vencimientoIso: args.vencimientoIso ?? null,
    origen: args.origen ?? "pdf_digital",
    creadoEnMs: args.ahoraMs,
    venceEnMs: args.ahoraMs + BORRADOR_MS,
    recuerdoEnMs: args.ahoraMs + RECUERDO_MS,
    estado: "pendiente" as const,
  });
}

export type ConfirmarBorradorResult =
  | { readonly status: 201; readonly borrador: BorradorIngesta }
  | { readonly status: 409; readonly error: string }
  | { readonly status: 410; readonly error: string };

export function confirmar_borrador(borrador: BorradorIngesta, ahoraMs: number): ConfirmarBorradorResult {
  if (borrador.estado !== "pendiente") return { status: 409, error: "borrador ya resuelto" };
  if (ahoraMs > borrador.venceEnMs) {
    return { status: 410, error: "borrador vencido (7 días)" };
  }
  return { status: 201, borrador: Object.freeze({ ...borrador, estado: "confirmado" as const }) };
}

// ---------------------------------------------------------------------------
// Log mínimo CS11.3: id + dominio + fecha. NUNCA contenido.
// ---------------------------------------------------------------------------

export interface LogIngesta {
  readonly messageId: string;
  readonly historyId: string | null;
  readonly remitenteDominio: string;
  readonly decision: DecisionIngesta;
  readonly motivo: string;
  readonly filtroId: string | null;
  readonly accountId: string | null;
}

function dominio_remitente(from: string): string {
  const arroba = from.lastIndexOf("@");
  const dom = arroba < 0 ? from : from.slice(arroba + 1);
  return dom.trim().toLowerCase().replace(/^<|>$/g, "");
}

export function registrar_log_ingesta(args: {
  readonly messageId: string;
  readonly historyId?: string;
  readonly from: string;
  readonly decision: DecisionIngesta;
  readonly motivo: string;
  readonly filtroId?: string;
  readonly accountId?: string;
}): LogIngesta {
  return Object.freeze({
    messageId: args.messageId,
    historyId: args.historyId ?? null,
    remitenteDominio: dominio_remitente(args.from),
    decision: args.decision,
    motivo: args.motivo,
    filtroId: args.filtroId ?? null,
    accountId: args.accountId ?? null,
  });
}

