import { and, desc, eq, inArray, isNull, gt, notInArray, or } from "drizzle-orm";
import { deliveryStatus, emailOutbox, emailSuppressions } from "../db/schema-email.js";
import { dbVivaTenant, type TenantDb } from "../lib/server-db.js";
import { dondeTenant } from "../lib/tenant-scope.js";
import type { EmailProvider } from "../modules/email/proveedor.js";
import { clasificar_error, proximo_reintento } from "../modules/email/outbox.js";
import { hash_email } from "../modules/email/entregabilidad.js";
import { PLANTILLAS_EMAIL_AVISO_WA } from "../modules/whatsapp/avisos-cuenta.js";
import { descifrarCampoOutbox } from "../modules/email/outbox-cifrado.js";

// P10-92: manda lo pendiente de email_outbox con el EmailProvider que le
// pasen (Resend en producción, fake en tests). Corre dentro del comercio:
// dondeTenant filtra en modo compartido y en single la base es del comercio.
// Cada intento toma la fila con un UPDATE condicionado (estado + intentos), así
// dos corridas a la vez no mandan el mismo mail. Cada intento deja una fila
// "intento" en delivery_status; de ahí sale la espera del backoff
// (proximo_reintento: 1 m, 5 m, 30 m, 2 h, 6 h) sin otra migración.
// Transitorio (timeout, 429, 5xx) -> "reintentar"; permanente o sin pasos -> "fallido".
// Una fila "enviando" con el último intento de hace más de 15 min se retoma.
// Destinatario suprimido (hash en email_suppressions) -> "suprimido" sin enviar.
// No loguea direcciones, asuntos ni cuerpos: solo cuenta resultados.
// WA-AVISOS-1: Los avisos de cuenta (PLANTILLAS_AVISO_WA) los manda el job de WhatsApp
// (jobs/enviar-avisos-whatsapp.ts) con este mismo reclamo y backoff.

export const ESPERA_ENVIANDO_MS = 15 * 60_000;
export const LOTE_POR_DEFECTO = 50;

export interface ResultadoEnvioEmails {
  readonly revisados: number;
  readonly enviados: number;
  readonly reintentar: number;
  readonly fallidos: number;
  readonly suprimidos: number;
  readonly esperando: number;
}

export type FilaOutbox = typeof emailOutbox.$inferSelect;
type Fila = FilaOutbox;

async function ultimoIntentoMs(db: TenantDb, outboxId: string): Promise<number | null> {
  const [u] = await db
    .select({ at: deliveryStatus.createdAt })
    .from(deliveryStatus)
    .where(dondeTenant(deliveryStatus.tenantId, and(eq(deliveryStatus.outboxId, outboxId), eq(deliveryStatus.evento, "intento"))))
    .orderBy(desc(deliveryStatus.createdAt))
    .limit(1);
  return u ? u.at.getTime() : null;
}

export async function listoParaIntentar(db: TenantDb, f: Fila, ahoraMs: number): Promise<boolean> {
  if (f.estado === "pendiente") return true;
  const ultimo = await ultimoIntentoMs(db, f.id);
  if (ultimo === null) return true;
  if (f.estado === "enviando") return ahoraMs - ultimo >= ESPERA_ENVIANDO_MS;
  const prox = proximo_reintento(Math.max(0, f.intentos - 1), ultimo);
  return prox !== null && ahoraMs >= prox;
}

async function suprimido(db: TenantDb, destinatario: string, ahora: Date): Promise<boolean> {
  const [s] = await db
    .select({ h: emailSuppressions.emailHash })
    .from(emailSuppressions)
    .where(
      and(
        eq(emailSuppressions.emailHash, hash_email(destinatario)),
        or(isNull(emailSuppressions.hasta), gt(emailSuppressions.hasta, ahora)),
      ),
    )
    .limit(1);
  return Boolean(s);
}

export async function marcar(db: TenantDb, f: Fila, estado: string, evento: string, providerMessageId?: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .update(emailOutbox)
      .set(providerMessageId ? { estado, providerMessageId } : { estado })
      .where(dondeTenant(emailOutbox.tenantId, and(eq(emailOutbox.id, f.id), eq(emailOutbox.estado, "enviando"))));
    await tx.insert(deliveryStatus).values({ tenantId: f.tenantId, outboxId: f.id, evento });
  });
}

// WA-AVISOS-1: Toma la fila para un intento: UPDATE condicionado por estado e intentos más
// la fila "intento" en delivery_status. false si otra corrida la tomó antes.
export async function tomar(db: TenantDb, f: Fila): Promise<boolean> {
  return db.transaction(async (tx) => {
    const t = await tx
      .update(emailOutbox)
      .set({ estado: "enviando", intentos: f.intentos + 1 })
      .where(
        dondeTenant(
          emailOutbox.tenantId,
          and(eq(emailOutbox.id, f.id), eq(emailOutbox.estado, f.estado), eq(emailOutbox.intentos, f.intentos)),
        ),
      )
      .returning({ id: emailOutbox.id });
    if (t.length === 0) return false;
    await tx.insert(deliveryStatus).values({ tenantId: f.tenantId, outboxId: f.id, evento: "intento" });
    return true;
  });
}

export async function ejecutarEnvioEmails(
  db: TenantDb,
  proveedor: EmailProvider,
  ahora: Date,
  lote = LOTE_POR_DEFECTO,
): Promise<ResultadoEnvioEmails> {
  const ahoraMs = ahora.getTime();
  const filas = await db
    .select()
    .from(emailOutbox)
    .where(
      dondeTenant(
        emailOutbox.tenantId,
        and(
          inArray(emailOutbox.estado, ["pendiente", "reintentar", "enviando"]),
          notInArray(emailOutbox.plantilla, PLANTILLAS_EMAIL_AVISO_WA),
        ),
      ),
    )
    .orderBy(emailOutbox.createdAt)
    .limit(lote);
  const r = { revisados: filas.length, enviados: 0, reintentar: 0, fallidos: 0, suprimidos: 0, esperando: 0 };
  for (const f of filas) {
    if (!(await listoParaIntentar(db, f, ahoraMs))) {
      r.esperando++;
      continue;
    }
    if (!(await tomar(db, f))) continue;
    if (await suprimido(db, f.destinatario, ahora)) {
      await marcar(db, f, "suprimido", "suprimido");
      r.suprimidos++;
      continue;
    }
    const res = await proveedor.send({
      para: f.destinatario,
      asunto: f.asunto,
      html: descifrarCampoOutbox(f.htmlCiphertext, f.tenantId, "html"),
      texto: descifrarCampoOutbox(f.textoCiphertext, f.tenantId, "texto"),
      idempotencyKey: `${f.tenantId}:${f.idempotencyKey}`,
      categoria: f.categoria,
      plantilla: f.plantilla,
    });
    if (res.ok) {
      await marcar(db, f, "enviado", "enviado", res.providerMessageId);
      r.enviados++;
      continue;
    }
    const codigo = /^\d+$/.test(res.motivo) ? Number(res.motivo) : res.motivo;
    const quedan = proximo_reintento(f.intentos, ahoraMs) !== null;
    if (clasificar_error(codigo) === "transitorio" && quedan) {
      await marcar(db, f, "reintentar", `fallo_${res.motivo}`);
      r.reintentar++;
    } else {
      await marcar(db, f, "fallido", `fallo_${res.motivo}`);
      r.fallidos++;
    }
  }
  return r;
}

// P10-92: entrada de la ruta, base del comercio del contexto, o null sin base.
export async function enviarEmailsDelComercio(proveedor: EmailProvider, ahora: Date): Promise<ResultadoEnvioEmails | null> {
  const db = dbVivaTenant();
  if (!db) return null;
  return ejecutarEnvioEmails(db, proveedor, ahora);
}
