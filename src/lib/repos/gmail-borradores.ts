import { and, eq } from "drizzle-orm";
import { emailIngestionLog, serviceAccounts } from "../../db/schema-servicios.js";
import { emailIngestionDrafts } from "../../db/schema-google.js";
import { BaseNoDisponible, dbVivaTenant, type TenantDb } from "../server-db.js";
import { registrarFactura } from "./servicios.js";
import {
  periodo_de,
  type ConfianzaCampo,
  type OrigenExtraccion,
} from "../../modules/utilities/facturas_servicios.js";
import {
  confirmar_borrador,
  type BorradorIngesta,
  type EstadoBorrador,
} from "../../modules/utilities/ingesta_gmail.js";
import { leerConfianzaGuardada } from "../../modules/utilities/cuerpo-factura.js";

export interface BorradorPendiente {
  readonly id: string;
  readonly messageId: string;
  readonly accountId: string | null;
  readonly remitenteDominio: string | null;
  readonly periodo: string | null;
  readonly vencimiento: string | null;
  readonly montoCentavos: bigint | null;
  readonly origen: OrigenExtraccion;
  readonly confianzaMonto: ConfianzaCampo;
  readonly confianzaVencimiento: ConfianzaCampo;
  readonly venceEn: Date;
  readonly vencido: boolean;
  readonly pideRevision: boolean;
  readonly comprobanteCuerpo: { readonly mime: "image/png"; readonly bytes: Buffer } | null;
}

export interface BorradorLeido extends BorradorPendiente {
  readonly estado: EstadoBorrador;
  readonly gmailAttachmentId: string | null;
  readonly createdAt: Date;
  readonly recordatorioEn: Date | null;
}

export type ConfirmarBorradorGmailResultado =
  | { ok: true; billId: string | null; creado: boolean }
  | {
      ok: false;
      codigo:
        | "NO_ENCONTRADO"
        | "YA_RESUELTO"
        | "VENCIDO"
        | "SIN_CUENTA"
        | "CUENTA_INVALIDA"
        | "FALTA_MONTO"
        | "FALTA_VENCIMIENTO"
        | "NO_VALIDO";
      status: number;
      error: string;
    };

export type DescartarBorradorGmailResultado =
  | { ok: true; creado: boolean }
  | { ok: false; codigo: "NO_ENCONTRADO" | "YA_RESUELTO"; status: number; error: string };

type FilaBorrador = typeof emailIngestionDrafts.$inferSelect;

function origenDe(valor: string): OrigenExtraccion {
  return valor === "pdf_digital" || valor === "ocr" || valor === "email_respaldo" ? valor : "pdf_digital";
}

function estadoDe(valor: string): EstadoBorrador {
  return valor === "pendiente" || valor === "confirmado" || valor === "descartado" || valor === "vencido"
    ? valor
    : "pendiente";
}

function aBorradorPendiente(fila: FilaBorrador, remitenteDominio: string | null, ahora: Date): BorradorPendiente {
  const confianza = leerConfianzaGuardada(fila.confianza);
  return {
    id: fila.id,
    messageId: fila.messageId,
    accountId: fila.accountId,
    remitenteDominio,
    periodo: fila.periodo,
    vencimiento: fila.vencimiento,
    montoCentavos: fila.montoCentavos,
    origen: origenDe(fila.origen),
    confianzaMonto: confianza.monto,
    confianzaVencimiento: confianza.vencimiento,
    venceEn: fila.venceEn,
    vencido: ahora.getTime() > fila.venceEn.getTime(),
    pideRevision: confianza.pideRevision,
    comprobanteCuerpo: confianza.comprobanteCuerpo,
  };
}

function aBorradorLeido(fila: FilaBorrador, remitenteDominio: string | null, ahora: Date): BorradorLeido {
  return {
    ...aBorradorPendiente(fila, remitenteDominio, ahora),
    estado: estadoDe(fila.estado),
    gmailAttachmentId: fila.gmailAttachmentId,
    createdAt: fila.createdAt,
    recordatorioEn: fila.recordatorioEn,
  };
}

function requerirDb(tenantId: string): TenantDb {
  const db = dbVivaTenant(tenantId);
  if (!db) throw new BaseNoDisponible();
  return db;
}

export async function listarBorradoresPendientes(
  tenantId: string,
  ahora: Date = new Date(),
): Promise<BorradorPendiente[]> {
  const db = requerirDb(tenantId);
  const filas = await db
    .select({
      draft: emailIngestionDrafts,
      remitenteDominio: emailIngestionLog.remitenteDominio,
    })
    .from(emailIngestionDrafts)
    .leftJoin(emailIngestionLog, eq(emailIngestionLog.messageId, emailIngestionDrafts.messageId))
    .where(
      and(
        eq(emailIngestionDrafts.tenantId, tenantId),
        eq(emailIngestionDrafts.estado, "pendiente"),
      ),
    );
  return filas.map((fila) => aBorradorPendiente(fila.draft, fila.remitenteDominio, ahora));
}

export async function leerBorrador(tenantId: string, draftId: string): Promise<BorradorLeido | null> {
  const db = requerirDb(tenantId);
  const filas = await db
    .select({
      draft: emailIngestionDrafts,
      remitenteDominio: emailIngestionLog.remitenteDominio,
    })
    .from(emailIngestionDrafts)
    .leftJoin(emailIngestionLog, eq(emailIngestionLog.messageId, emailIngestionDrafts.messageId))
    .where(
      and(eq(emailIngestionDrafts.tenantId, tenantId), eq(emailIngestionDrafts.id, draftId)),
    )
    .limit(1);
  const fila = filas[0];
  if (!fila) return null;
  return aBorradorLeido(fila.draft, fila.remitenteDominio, new Date());
}

export async function marcarBorrador(
  tenantId: string,
  draftId: string,
  estado: "confirmado" | "descartado" | "vencido",
): Promise<boolean> {
  const db = requerirDb(tenantId);
  const filas = await db
    .update(emailIngestionDrafts)
    .set({ estado, updatedAt: new Date() })
    .where(
      and(
        eq(emailIngestionDrafts.tenantId, tenantId),
        eq(emailIngestionDrafts.id, draftId),
        eq(emailIngestionDrafts.estado, "pendiente"),
      ),
    )
    .returning({ id: emailIngestionDrafts.id });
  return filas.length > 0;
}

export async function cuentaActiva(tenantId: string, accountId: string): Promise<boolean> {
  const db = requerirDb(tenantId);
  const filas = await db
    .select({ activa: serviceAccounts.activa })
    .from(serviceAccounts)
    .where(eq(serviceAccounts.id, accountId))
    .limit(1);
  return Boolean(filas[0]?.activa);
}

export async function confirmarBorradorGmail(input: {
  tenantId: string;
  draftId: string;
  accountId?: string;
  montoCentavos?: bigint;
  vencimiento?: string;
  periodo?: string;
  ahora?: Date;
}): Promise<ConfirmarBorradorGmailResultado> {
  const ahora = input.ahora ?? new Date();
  const draft = await leerBorrador(input.tenantId, input.draftId);
  if (!draft) {
    return { ok: false, codigo: "NO_ENCONTRADO", status: 404, error: "borrador inexistente" };
  }
  if (draft.estado !== "pendiente") {
    return { ok: false, codigo: "YA_RESUELTO", status: 409, error: "borrador ya resuelto" };
  }
  const accountId = input.accountId ?? draft.accountId;
  if (!accountId) {
    return { ok: false, codigo: "SIN_CUENTA", status: 422, error: "elegí una cuenta de servicio" };
  }
  if (!(await cuentaActiva(input.tenantId, accountId))) {
    return { ok: false, codigo: "CUENTA_INVALIDA", status: 422, error: "cuenta de servicio inválida" };
  }
  const montoCentavos = input.montoCentavos ?? draft.montoCentavos;
  if (montoCentavos === null) {
    return { ok: false, codigo: "FALTA_MONTO", status: 422, error: "falta el monto" };
  }
  const vencimiento = input.vencimiento ?? draft.vencimiento;
  if (vencimiento === null) {
    return { ok: false, codigo: "FALTA_VENCIMIENTO", status: 422, error: "falta el vencimiento" };
  }
  const periodo = input.periodo ?? draft.periodo ?? periodo_de(vencimiento);
  const candidato: BorradorIngesta = {
    messageId: draft.messageId,
    accountId,
    montoCentavos,
    vencimientoIso: vencimiento,
    origen: draft.origen,
    creadoEnMs: draft.createdAt.getTime(),
    venceEnMs: draft.venceEn.getTime(),
    recuerdoEnMs: draft.recordatorioEn?.getTime() ?? draft.venceEn.getTime(),
    estado: draft.estado,
  };
  const confirmado = confirmar_borrador(candidato, ahora.getTime());
  if (confirmado.status === 409) {
    return { ok: false, codigo: "YA_RESUELTO", status: 409, error: confirmado.error };
  }
  if (confirmado.status === 410) {
    await marcarBorrador(input.tenantId, input.draftId, "vencido");
    return { ok: false, codigo: "VENCIDO", status: 410, error: confirmado.error };
  }
  const factura = await registrarFactura(
    {
      accountId,
      messageId: draft.messageId,
      periodo,
      vencimiento,
      montoCentavos,
      necesitaRevision: false,
      origen: draft.origen,
      confianzaMonto: draft.confianzaMonto,
      confianzaVencimiento: draft.confianzaVencimiento,
      canal: "gmail",
      gmailAttachmentId: draft.gmailAttachmentId,
    },
    { requerirDb: true },
  );
  if (factura.ok) {
    await marcarBorrador(input.tenantId, input.draftId, "confirmado");
    return { ok: true, billId: factura.factura.id, creado: true };
  }
  if (factura.codigo === "MENSAJE_REPETIDO") {
    await marcarBorrador(input.tenantId, input.draftId, "confirmado");
    return { ok: true, billId: null, creado: false };
  }
  return { ok: false, codigo: "NO_VALIDO", status: 422, error: factura.error };
}

export async function descartarBorradorGmail(input: {
  tenantId: string;
  draftId: string;
}): Promise<DescartarBorradorGmailResultado> {
  const draft = await leerBorrador(input.tenantId, input.draftId);
  if (!draft) {
    return { ok: false, codigo: "NO_ENCONTRADO", status: 404, error: "borrador inexistente" };
  }
  if (draft.estado === "descartado") return { ok: true, creado: false };
  if (draft.estado !== "pendiente") {
    return { ok: false, codigo: "YA_RESUELTO", status: 409, error: "borrador ya resuelto" };
  }
  const actualizado = await marcarBorrador(input.tenantId, input.draftId, "descartado");
  if (!actualizado) {
    return { ok: false, codigo: "YA_RESUELTO", status: 409, error: "borrador ya resuelto" };
  }
  return { ok: true, creado: true };
}
