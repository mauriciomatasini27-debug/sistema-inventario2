import { actualizarCursorGmail } from "./google-conexiones.js";
import {
  existeLogIngesta,
  guardarBorradorIngesta,
  registrarLogIngesta,
} from "./gmail-ingesta.js";
import type { PersistenciaGmail } from "../../modules/integraciones/gmail-sync.js";

// Adapter DB del seam PersistenciaGmail: los repos siguen dueños de su
// propia persistencia; acá vive solo el mapping module↔repos.
export function crearPersistenciaGmailDb(tenantId: string): PersistenciaGmail {
  return {
    existeLog: (messageId) => existeLogIngesta(tenantId, messageId),
    registrarLog: (log) =>
      registrarLogIngesta({
        tenantId,
        messageId: log.messageId,
        historyId: log.historyId,
        remitenteDominio: log.remitenteDominio,
        decision: log.decision,
        motivo: log.motivo,
        filtroId: log.filtroId,
        accountId: log.accountId,
      }),
    guardarBorrador: (borrador) =>
      guardarBorradorIngesta({
        tenantId,
        connectionId: borrador.connectionId,
        messageId: borrador.messageId,
        gmailAttachmentId: borrador.gmailAttachmentId,
        accountId: borrador.accountId,
        periodo: borrador.periodo,
        vencimiento: borrador.vencimiento,
        montoCentavos: borrador.montoCentavos,
        origen: borrador.origen,
        confianzaMonto: borrador.confianzaMonto,
        confianzaVencimiento: borrador.confianzaVencimiento,
        venceEn: borrador.venceEn,
        recordatorioEn: borrador.recordatorioEn,
        ...(borrador.pideRevision === true ? { pideRevision: true } : {}),
        ...(borrador.comprobanteCuerpo ? { comprobanteCuerpo: borrador.comprobanteCuerpo } : {}),
      }),
    avanzarCursor: (cursor) => actualizarCursorGmail(tenantId, cursor),
  };
}
