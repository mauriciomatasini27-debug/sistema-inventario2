import {
  ErrorGmail,
  ErrorGmailTransitorio,
  MAX_ADJUNTO_BYTES,
  detectarMimeComprobante,
  type GmailAdjunto,
  type GmailAdjuntoRef,
  type GmailApi,
  type GmailMensaje,
} from "./gmail-cliente.js";
import { BORRADOR_MS, RECUERDO_MS, clasificar_capa1, extraer_comprobante, registrar_log_ingesta, type CuentaCatalogo, type FiltroIngesta, type LogIngesta } from "../utilities/ingesta_gmail.js";
import type { MotorOcr } from "../ocr/motor.js";
import type { ConfianzaCampo, OrigenExtraccion } from "../utilities/facturas_servicios.js";
import {
  extraer_texto_embebido_pdf,
  type ExtractadorPdfDigital,
} from "../utilities/extraer-pdf-digital.js";

export interface BorradorSync {
  readonly connectionId: string;
  readonly messageId: string;
  readonly gmailAttachmentId: string | null;
  readonly accountId: string | null;
  readonly periodo: string | null;
  readonly vencimiento: string | null;
  readonly montoCentavos: bigint | null;
  readonly origen: OrigenExtraccion;
  readonly confianzaMonto: ConfianzaCampo;
  readonly confianzaVencimiento: ConfianzaCampo;
  readonly venceEn: Date;
  readonly recordatorioEn: Date;
}

export interface PersistenciaSyncGmail {
  existeLog(messageId: string): Promise<boolean>;
  registrarLog(log: LogIngesta): Promise<void>;
  guardarBorrador(borrador: BorradorSync): Promise<{ readonly id: string; readonly nuevo: boolean }>;
  avanzarCursor(cursor: string): Promise<void>;
}

export interface EntradaSyncGmail {
  readonly gmail: GmailApi;
  readonly connectionId: string;
  readonly cursor: string | null;
  readonly filtros: ReadonlyArray<FiltroIngesta>;
  readonly catalogo: ReadonlyArray<CuentaCatalogo>;
  readonly ahoraMs: number;
  readonly ventanaInicialDias?: number;
  readonly ventanaRecuperacionDias?: number;
  readonly labelId?: string;
  readonly motor?: MotorOcr | null;
  readonly extraerPdfTexto?: ExtractadorPdfDigital;
  readonly persistencia: PersistenciaSyncGmail;
}

export interface ResultadoSyncGmail {
  readonly cursor: string;
  readonly procesados: number;
  readonly borradores: number;
  readonly ignorados: number;
  readonly recuperados: boolean;
}

const MAX_PAGINAS = 20;
const MAX_MENSAJES = 5000;

function diasMs(dias: number): number {
  return dias * 86_400_000;
}

async function listarMensajesIniciales(input: {
  readonly gmail: GmailApi;
  readonly desdeMs: number;
  readonly labelId: string;
}): Promise<ReadonlyArray<string>> {
  const ids: string[] = [];
  let pageToken: string | undefined;
  for (let pagina = 0; pagina < MAX_PAGINAS && ids.length < MAX_MENSAJES; pagina++) {
    const r = await input.gmail.listMessages({
      query: `after:${Math.floor(input.desdeMs / 1000)}`,
      labelIds: [input.labelId],
      ...(pageToken !== undefined ? { pageToken } : {}),
      maxResults: 500,
    });
    ids.push(...r.ids);
    if (!r.nextPageToken) break;
    pageToken = r.nextPageToken;
  }
  return [...new Set(ids)];
}

async function listarHistorial(input: {
  readonly gmail: GmailApi;
  readonly cursor: string;
  readonly labelId: string;
}): Promise<{ readonly ids: ReadonlyArray<string>; readonly cursor: string }> {
  const ids: string[] = [];
  let cursor = input.cursor;
  let pageToken: string | undefined;
  for (let pagina = 0; pagina < MAX_PAGINAS && ids.length < MAX_MENSAJES; pagina++) {
    const r = await input.gmail.listHistory({
      startHistoryId: input.cursor,
      labelId: input.labelId,
      ...(pageToken !== undefined ? { pageToken } : {}),
      maxResults: 500,
    });
    ids.push(...r.ids);
    if (r.historyId) cursor = r.historyId;
    if (!r.nextPageToken) break;
    pageToken = r.nextPageToken;
  }
  return { ids: [...new Set(ids)], cursor };
}

async function primerAdjuntoValido(
  gmail: GmailApi,
  mensaje: GmailMensaje,
): Promise<{ readonly ref: GmailAdjuntoRef; readonly adjunto: GmailAdjunto; readonly mime: string } | null> {
  for (const ref of mensaje.adjuntos) {
    if (ref.size > MAX_ADJUNTO_BYTES) continue;
    let adjunto: GmailAdjunto;
    try {
      adjunto = await gmail.getAttachment({
        messageId: mensaje.id,
        attachmentId: ref.attachmentId,
      });
    } catch (e) {
      if (e instanceof ErrorGmailTransitorio) throw e;
      continue;
    }
    if (adjunto.bytes.length > MAX_ADJUNTO_BYTES) continue;
    const mime = detectarMimeComprobante(adjunto.bytes);
    if (mime === null) continue;
    return { ref, adjunto, mime };
  }
  return null;
}

export async function extraerDeAdjunto(input: {
  readonly mime: string;
  readonly bytes: Buffer;
  readonly cuerpo: string | null;
  readonly motor: MotorOcr | null;
  readonly extraerPdfTexto?: ExtractadorPdfDigital;
}) {
  if (input.mime === "application/pdf") {
    const extraer = input.extraerPdfTexto ?? extraer_texto_embebido_pdf;
    const pdfTexto = await extraer(input.bytes);
    return extraer_comprobante({
      ...(pdfTexto !== null ? { pdfTexto } : {}),
      ...(input.cuerpo !== null ? { cuerpo: input.cuerpo } : {}),
    });
  }
  let ocrTexto: string | null = null;
  if (input.motor) {
    const r = await input.motor.extraer({ bytes: input.bytes, mimeType: input.mime });
    if (r?.texto) ocrTexto = r.texto;
  }
  return extraer_comprobante({
    ...(ocrTexto !== null ? { ocrTexto } : {}),
    ...(input.cuerpo !== null ? { cuerpo: input.cuerpo } : {}),
  });
}

function motivoConAdjunto(motivo: string, mime: string | null, varios: number): string {
  const partes = [motivo];
  if (mime !== null) partes.push(`adjunto ${mime}`);
  if (varios > 1) partes.push(`${varios} adjuntos, se usa el primero`);
  return partes.join("; ");
}

export async function sincronizarGmail(input: EntradaSyncGmail): Promise<ResultadoSyncGmail> {
  const ventanaInicial = input.ventanaInicialDias ?? 90;
  const ventanaRecuperacion = input.ventanaRecuperacionDias ?? 30;
  const labelId = input.labelId ?? "INBOX";
  let cursor = input.cursor;
  let ids: ReadonlyArray<string>;
  let recuperados = false;

  if (cursor === null) {
    const perfil = await input.gmail.getProfile();
    ids = await listarMensajesIniciales({
      gmail: input.gmail,
      desdeMs: input.ahoraMs - diasMs(ventanaInicial),
      labelId,
    });
    cursor = perfil.historyId;
  } else {
    try {
      const r = await listarHistorial({ gmail: input.gmail, cursor, labelId });
      ids = r.ids;
      cursor = r.cursor;
    } catch (e) {
      if (!(e instanceof ErrorGmail) || e.codigo !== "historial_vencido") throw e;
      recuperados = true;
      const perfil = await input.gmail.getProfile();
      ids = await listarMensajesIniciales({
        gmail: input.gmail,
        desdeMs: input.ahoraMs - diasMs(ventanaRecuperacion),
        labelId,
      });
      cursor = perfil.historyId;
    }
  }

  let procesados = 0;
  let borradores = 0;
  let ignorados = 0;

  for (const messageId of ids) {
    if (await input.persistencia.existeLog(messageId)) {
      ignorados++;
      continue;
    }
    let meta: GmailMensaje;
    try {
      meta = await input.gmail.getMessage({ id: messageId, format: "metadata" });
    } catch (e) {
      if (e instanceof ErrorGmailTransitorio) throw e;
      const log = registrar_log_ingesta({
        messageId,
        from: "",
        decision: "ignorar",
        motivo: `no se pudo leer el mensaje: ${e instanceof ErrorGmail ? e.codigo : "error"}`,
      });
      await input.persistencia.registrarLog(log);
      ignorados++;
      procesados++;
      continue;
    }

    const previa = clasificar_capa1(
      { from: meta.from, subject: meta.subject },
      input.filtros,
      input.catalogo,
    );
    if (previa.decision === "ignorar") {
      await input.persistencia.registrarLog(
        registrar_log_ingesta({
          messageId,
          from: meta.from,
          decision: "ignorar",
          motivo: previa.motivo,
        }),
      );
      ignorados++;
      procesados++;
      continue;
    }
    if (previa.filtroId === null && previa.accountId === null) {
      await input.persistencia.registrarLog(
        registrar_log_ingesta({
          messageId,
          from: meta.from,
          decision: "ignorar",
          motivo: "remitente sin filtro activo",
        }),
      );
      ignorados++;
      procesados++;
      continue;
    }

    let mensaje: GmailMensaje;
    try {
      mensaje = await input.gmail.getMessage({ id: messageId, format: "full" });
    } catch (e) {
      if (e instanceof ErrorGmailTransitorio) throw e;
      const log = registrar_log_ingesta({
        messageId,
        from: meta.from,
        decision: "ignorar",
        motivo: `no se pudo leer el mensaje: ${e instanceof ErrorGmail ? e.codigo : "error"}`,
      });
      await input.persistencia.registrarLog(log);
      ignorados++;
      procesados++;
      continue;
    }

    const cuerpo = mensaje.bodyText;
    const clas = clasificar_capa1(
      {
        from: mensaje.from,
        subject: mensaje.subject,
        ...(cuerpo !== null ? { cuerpo } : {}),
      },
      input.filtros,
      input.catalogo,
    );
    if (clas.decision === "ignorar") {
      await input.persistencia.registrarLog(
        registrar_log_ingesta({
          messageId,
          from: mensaje.from,
          decision: "ignorar",
          motivo: clas.motivo,
        }),
      );
      ignorados++;
      procesados++;
      continue;
    }

    let adjunto: Awaited<ReturnType<typeof primerAdjuntoValido>>;
    try {
      adjunto = await primerAdjuntoValido(input.gmail, mensaje);
    } catch (e) {
      if (e instanceof ErrorGmailTransitorio) throw e;
      adjunto = null;
    }

    if (clas.decision === "necesita_revision" && adjunto === null) {
      await input.persistencia.registrarLog(
        registrar_log_ingesta({
          messageId,
          from: mensaje.from,
          decision: "necesita_revision",
          motivo: clas.motivo,
        }),
      );
      ignorados++;
      procesados++;
      continue;
    }

    const extraccion = adjunto
      ? await extraerDeAdjunto({
          mime: adjunto.mime,
          bytes: adjunto.adjunto.bytes,
          cuerpo,
          motor: input.motor ?? null,
          ...(input.extraerPdfTexto ? { extraerPdfTexto: input.extraerPdfTexto } : {}),
        })
      : extraer_comprobante({ ...(cuerpo !== null ? { cuerpo } : {}) });

    if (
      adjunto === null &&
      extraccion.montoCentavos === null &&
      extraccion.vencimientoIso === null
    ) {
      await input.persistencia.registrarLog(
        registrar_log_ingesta({
          messageId,
          from: mensaje.from,
          decision: "necesita_revision",
          motivo: "sin adjunto ni datos en el cuerpo",
        }),
      );
      ignorados++;
      procesados++;
      continue;
    }

    const venceEn = new Date(input.ahoraMs + BORRADOR_MS);
    const recordatorioEn = new Date(input.ahoraMs + RECUERDO_MS);
    await input.persistencia.guardarBorrador({
      connectionId: input.connectionId,
      messageId,
      gmailAttachmentId: adjunto?.ref.attachmentId ?? null,
      accountId: clas.accountId,
      periodo: extraccion.vencimientoIso === null ? null : extraccion.vencimientoIso.slice(0, 7),
      vencimiento: extraccion.vencimientoIso,
      montoCentavos: extraccion.montoCentavos,
      origen: extraccion.origen,
      confianzaMonto: extraccion.confianzaMonto,
      confianzaVencimiento: extraccion.confianzaVencimiento,
      venceEn,
      recordatorioEn,
    });
    await input.persistencia.registrarLog(
      registrar_log_ingesta({
        messageId,
        from: mensaje.from,
        decision: "para_procesar",
        motivo: motivoConAdjunto(clas.motivo, adjunto?.mime ?? null, mensaje.adjuntos.length),
        ...(clas.filtroId !== null ? { filtroId: clas.filtroId } : {}),
        ...(clas.accountId !== null ? { accountId: clas.accountId } : {}),
      }),
    );
    borradores++;
    procesados++;
  }

  await input.persistencia.avanzarCursor(cursor);
  return { cursor, procesados, borradores, ignorados, recuperados };
}
