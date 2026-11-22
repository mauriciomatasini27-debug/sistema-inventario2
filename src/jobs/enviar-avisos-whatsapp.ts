import { and, eq, inArray, isNull } from "drizzle-orm";
import { tenants, whatsappIdentities } from "../db/schema.js";
import { emailOutbox } from "../db/schema-email.js";
import { getControlDb } from "../lib/db.js";
import { dbVivaTenant, type TenantDb } from "../lib/server-db.js";
import { control } from "../lib/store.js";
import { dondeTenant } from "../lib/tenant-scope.js";
import { clasificar_error, proximo_reintento } from "../modules/email/outbox.js";
import { aviso_wa, PLANTILLAS_EMAIL_AVISO_WA } from "../modules/whatsapp/avisos-cuenta.js";
import type { ResultadoEnvio } from "../modules/whatsapp/cliente-cloud.js";
import type { PayloadPlantilla } from "../modules/whatsapp/envio.js";
import { LOTE_POR_DEFECTO, listoParaIntentar, marcar, tomar } from "./enviar-emails.js";
import { descifrarCampoOutbox } from "../modules/email/outbox-cifrado.js";

// WA-AVISOS-1: Avisos de cuenta por WhatsApp (Mauri 2026-11-21 04:15): las filas de
// email_outbox con plantilla en PLANTILLAS_AVISO_WA salen como plantilla de
// Meta (type "template") al número del dueño, no por mail. Mismo reclamo,
// backoff y estados que P10-92 (enviar-emails.ts): una fila se manda una vez.
// - Plantilla sin id en WHATSAPP_PLANTILLAS_APROBADAS: la fila no se toca.
// - Dueño sin número verificado: "sin_whatsapp" (no hay fallback a mail).
// - Dueño que pidió BAJA: "suprimido".
// - Error de red/429/5xx: "reintentar"; rechazo de Meta: "fallido".
// No loguea números ni textos.

export interface DuenoAviso {
  readonly comercio: string;
  readonly numero: string | null;
  readonly baja: boolean;
}

export interface DepsAvisosWa {
  readonly dueno: (tenantId: string) => Promise<DuenoAviso>;
  readonly aprobada: (plantillaMeta: string) => boolean;
  readonly enviar: (toE164: string, payload: PayloadPlantilla) => Promise<ResultadoEnvio>;
}

export interface ResultadoAvisosWa {
  readonly revisados: number;
  readonly enviados: number;
  readonly reintentar: number;
  readonly fallidos: number;
  readonly suprimidos: number;
  readonly sinWhatsapp: number;
  readonly sinPlantilla: number;
  readonly esperando: number;
}

export async function ejecutarAvisosWhatsapp(
  db: TenantDb,
  deps: DepsAvisosWa,
  ahora: Date,
  lote = LOTE_POR_DEFECTO,
): Promise<ResultadoAvisosWa> {
  const ahoraMs = ahora.getTime();
  const filas = await db
    .select()
    .from(emailOutbox)
    .where(
      dondeTenant(
        emailOutbox.tenantId,
        and(
          inArray(emailOutbox.estado, ["pendiente", "reintentar", "enviando"]),
          inArray(emailOutbox.plantilla, PLANTILLAS_EMAIL_AVISO_WA),
        ),
      ),
    )
    .orderBy(emailOutbox.createdAt)
    .limit(lote);
  const r = { revisados: filas.length, enviados: 0, reintentar: 0, fallidos: 0, suprimidos: 0, sinWhatsapp: 0, sinPlantilla: 0, esperando: 0 };
  const duenos = new Map<string, DuenoAviso>();
  for (const f of filas) {
    const dueno = duenos.get(f.tenantId) ?? (await deps.dueno(f.tenantId));
    duenos.set(f.tenantId, dueno);
    const texto = descifrarCampoOutbox(f.textoCiphertext, f.tenantId, "texto");
    const aviso = aviso_wa({ plantilla: f.plantilla, idempotencyKey: f.idempotencyKey, texto }, dueno.comercio);
    if (aviso && !deps.aprobada(aviso.plantilla)) {
      r.sinPlantilla++;
      continue;
    }
    if (!(await listoParaIntentar(db, f, ahoraMs))) {
      r.esperando++;
      continue;
    }
    if (!(await tomar(db, f))) continue;
    if (!aviso) {
      await marcar(db, f, "fallido", "fallo_datos");
      r.fallidos++;
      continue;
    }
    if (dueno.baja) {
      await marcar(db, f, "suprimido", "baja_whatsapp");
      r.suprimidos++;
      continue;
    }
    if (!dueno.numero) {
      await marcar(db, f, "sin_whatsapp", "sin_whatsapp");
      r.sinWhatsapp++;
      continue;
    }
    const res = await deps.enviar(dueno.numero, aviso.payload);
    if (res.ok) {
      await marcar(db, f, "enviado", "enviado", res.wamid);
      r.enviados++;
      continue;
    }
    // WA-AVISOS-1: "red" ya cubre timeout, 429 y 5xx (cliente-cloud); el resto es rechazo.
    const quedan = proximo_reintento(f.intentos, ahoraMs) !== null;
    if (clasificar_error(res.codigo === "red" ? "timeout" : res.codigo) === "transitorio" && quedan) {
      await marcar(db, f, "reintentar", `fallo_${res.codigo}`);
      r.reintentar++;
    } else {
      await marcar(db, f, "fallido", `fallo_${res.codigo}`);
      r.fallidos++;
    }
  }
  return r;
}

// WA-AVISOS-1: Dueño del comercio: nombre y número verificado de whatsapp_identities en
// control (el mapa en memoria no sobrevive a un cold start). Sin control,
// la memoria. Vale para comercios cerrados: el cierre no borra el número.
export async function duenoAviso(tenantId: string): Promise<DuenoAviso> {
  const t = control.tenants.get(tenantId);
  let comercio = t?.nombreComercio ?? "";
  let owner = t?.ownerGoogleSub ?? null;
  let numero: string | null = null;
  if (process.env.CONTROL_DATABASE_URL) {
    const db = getControlDb();
    const [fila] = await db
      .select({ nombre: tenants.nombreComercio, owner: tenants.ownerGoogleSub })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);
    if (fila) {
      comercio = fila.nombre;
      owner = fila.owner;
    }
    if (owner) {
      const [id] = await db
        .select({ numero: whatsappIdentities.numero })
        .from(whatsappIdentities)
        .where(
          and(
            eq(whatsappIdentities.tenantId, tenantId),
            eq(whatsappIdentities.googleSub, owner),
            eq(whatsappIdentities.estado, "verificado"),
            isNull(whatsappIdentities.revocadoAt),
          ),
        )
        .limit(1);
      numero = id?.numero ?? null;
    }
  }
  if (!numero && owner) {
    for (const [n, l] of control.botLinks) {
      if (l.tenantId === tenantId && l.googleSub === owner && l.estado === "verificado") numero = n;
    }
  }
  // WA-AVISOS-1: BAJA explícita: tuvo opt-in y lo sacó. Sin preferencias guardadas vale el
  // número verificado (el dueño lo vinculó escribiéndole al bot).
  const p = owner ? control.waPrefs.get(`${tenantId}:${owner}`) : undefined;
  const baja = p !== undefined && !p.optIn && p.optInAtMs != null;
  return { comercio: comercio || "tu comercio", numero, baja };
}

export async function enviarAvisosWhatsappDelComercio(deps: DepsAvisosWa, ahora: Date): Promise<ResultadoAvisosWa | null> {
  const db = dbVivaTenant();
  if (!db) return null;
  return ejecutarAvisosWhatsapp(db, deps, ahora);
}
