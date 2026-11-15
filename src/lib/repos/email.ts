import { eq } from "drizzle-orm";
import { dondeTenant, filaConTenant } from "../tenant-scope.js";
import { emailOutbox, notificationEvents } from "../../db/schema-email.js";
import { listarMovimientosCaja } from "./movimientos-caja.js";
import { conTenant, tenantActual } from "../tenant-mode.js";
import { dbVivaTenant } from "../server-db.js";
import { crearAlmacenEmailEventos, crearAlmacenEmailOutbox, crearListaMovimientos } from "./_almacen.js";
import { encolar_resumen_cierre, type EncolarResultado, type OutboxPendiente } from "../../modules/email/resumen-cierre.js";
import type { DatosCierre } from "../../modules/email/plantilla-cierre.js";

// Sin contexto en multi (email/send) la memoria particionada no es
// alcanzable: solo se toca con tenant explícito o dentro de conTenant. Las
// factorías resuelven la partición al crearse, por eso se crean dentro del
// contexto del tenant y nunca a nivel de módulo.
function conParticion<T>(tenantId: string | undefined, fn: () => T): T {
  if (tenantId) return conTenant(tenantId, fn);
  return fn();
}

// Sin leer el modo en este archivo: con tenant (explícito o ambiente) la
// memoria es alcanzable; sin tenant solo single la tiene (en multi el acceso
// lanza "Falta tenant" y se responde que no hay memoria).
function hayMemoria(tenantId?: string): boolean {
  if (tenantId ?? tenantActual()) return true;
  try {
    crearAlmacenEmailOutbox().comoMapaSoloLectura();
    return true;
  } catch {
    return false;
  }
}

export type EncolarEnvioResultado =
  | { ok: true; key: string; fuente: "db" | "memoria" }
  | { ok: false; codigo: "DUPLICADO"; key: string };

function pendienteDeEnvio(input: { key: string; to: string; plantilla: string; vars: Record<string, string> }): OutboxPendiente {
  return {
    idempotencyKey: input.key,
    destinatario: input.to,
    asunto: input.plantilla,
    html: `<p>${input.plantilla}</p>`,
    texto: Object.keys(input.vars).length > 0 ? JSON.stringify(input.vars) : input.plantilla,
    estado: "pendiente",
    intentos: 0,
    providerMessageId: null,
  };
}

// Cola de envíos (CH-S1): email_outbox del tenant con DB viva, memoria
// particionada en single sin base. En multi sin base propaga.
export async function encolarEnvio(input: {
  key: string;
  stream: string;
  to: string;
  plantilla: string;
  vars: Record<string, string>;
  tenantId?: string | undefined;
}): Promise<EncolarEnvioResultado> {
  const usaMemoria = hayMemoria(input.tenantId);
  if (usaMemoria && conParticion(input.tenantId, () => crearAlmacenEmailOutbox().contiene(input.key))) {
    return { ok: false, codigo: "DUPLICADO", key: input.key };
  }
  const db = dbVivaTenant(input.tenantId);
  if (!db) {
    conParticion(input.tenantId, () => {
      crearAlmacenEmailOutbox().guardar(input.key, pendienteDeEnvio(input));
    });
    return { ok: true, key: input.key, fuente: "memoria" };
  }
  try {
    const previo = await db
      .select({ id: emailOutbox.id })
      .from(emailOutbox)
      .where(dondeTenant(emailOutbox.tenantId, eq(emailOutbox.idempotencyKey, input.key)))
      .limit(1);
    if (previo[0]) return { ok: false, codigo: "DUPLICADO", key: input.key };
    const texto = Object.keys(input.vars).length > 0 ? JSON.stringify(input.vars) : input.plantilla;
    await db.insert(emailOutbox).values(
      filaConTenant({
        categoria: input.stream,
        plantilla: input.plantilla,
        destinatario: input.to,
        asunto: input.plantilla,
        html: `<p>${input.plantilla}</p>`,
        texto,
        idempotencyKey: input.key,
        estado: "pendiente",
      }),
    );
  } catch (e) {
    conParticion(input.tenantId, () => crearAlmacenEmailOutbox()).anteFalloPersistencia(e);
    conParticion(input.tenantId, () => {
      crearAlmacenEmailOutbox().guardar(input.key, pendienteDeEnvio(input));
    });
    return { ok: true, key: input.key, fuente: "memoria" };
  }
  if (usaMemoria) {
    conParticion(input.tenantId, () => {
      crearAlmacenEmailOutbox().guardar(input.key, pendienteDeEnvio(input));
    });
  }
  return { ok: true, key: input.key, fuente: "db" };
}

// Snapshot de caja para el resumen: cash_movements del tenant con DB viva,
// memoria particionada en single sin base. En multi sin base propaga.
export async function resumenMovimientosCaja(tenantId?: string): Promise<{ total: bigint; porMedio: Record<string, bigint> }> {
  const leer = async () => {
    const db = dbVivaTenant();
    if (!db) return null;
    return listarMovimientosCaja(db);
  };
  try {
    const filas = tenantId ? await conTenant(tenantId, leer) : await leer();
    if (filas !== null) {
      const porMedio: Record<string, bigint> = {};
      let total = 0n;
      for (const m of filas) {
        const signo = m.tipo === "ingreso" ? 1n : -1n;
        porMedio[m.metodo] = (porMedio[m.metodo] ?? 0n) + signo * m.montoCentavos;
        total += signo * m.montoCentavos;
      }
      return { total, porMedio };
    }
  } catch (e) {
    conParticion(tenantId, () => crearListaMovimientos()).anteFalloPersistencia(e);
  }
  if (!hayMemoria(tenantId)) return { total: 0n, porMedio: {} };
  return conParticion(tenantId, () => {
    const porMedio: Record<string, bigint> = {};
    let total = 0n;
    for (const m of crearListaMovimientos().listar()) {
      const monto = BigInt(m.monto_centavos);
      const signo = m.tipo === "ingreso" ? 1n : -1n;
      porMedio[m.metodo] = (porMedio[m.metodo] ?? 0n) + signo * monto;
      total += signo * monto;
    }
    return { total, porMedio };
  });
}

// Resumen de cierre (NE4/NE11): dedupe por tenant+fecha en memoria y
// evento + outbox en 1 tx con DB viva. En multi sin base propaga.
export async function encolarResumen(input: {
  tenantId: string;
  cierreId: string;
  fechaJornada: string;
  totalCentavos: bigint;
  porMedio: Record<string, bigint>;
  tipo: string;
  datosPlantilla: DatosCierre;
  destinatario: string;
}): Promise<EncolarResultado> {
  const r = conParticion(input.tenantId, () =>
    encolar_resumen_cierre(
      { eventos: crearAlmacenEmailEventos().mapaVivo(), outbox: crearAlmacenEmailOutbox().mapaVivo() },
      {
        tenantId: input.tenantId,
        cierreId: input.cierreId,
        fechaJornada: input.fechaJornada,
        totalCentavos: input.totalCentavos,
        porMedio: input.porMedio,
        tipo: input.tipo,
        datosPlantilla: input.datosPlantilla,
        destinatario: input.destinatario,
      },
    ),
  );
  if (r.status !== 201) return r;
  const db = dbVivaTenant(input.tenantId);
  if (!db) return r;
  try {
    await db.transaction(async (tx) => {
      await tx
        .insert(notificationEvents)
        .values(
          filaConTenant({
            tipo: r.evento.tipo,
            version: 1,
            payload: r.evento.payload,
            dedupeKey: r.evento.dedupeKey,
            estado: "pendiente",
          }),
        )
        .onConflictDoNothing({ target: [notificationEvents.tenantId, notificationEvents.dedupeKey] });
      await tx
        .insert(emailOutbox)
        .values(
          filaConTenant({
            categoria: "cierre",
            plantilla: "cierre_v1",
            destinatario: r.envio.destinatario,
            asunto: r.envio.asunto,
            html: r.envio.html,
            texto: r.envio.texto,
            idempotencyKey: r.envio.idempotencyKey,
            estado: "pendiente",
          }),
        )
        .onConflictDoNothing({ target: [emailOutbox.tenantId, emailOutbox.idempotencyKey] });
    });
  } catch (e) {
    conParticion(input.tenantId, () => crearAlmacenEmailOutbox()).anteFalloPersistencia(e);
  }
  return r;
}

function esUuid(v: unknown): v is string {
  return typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}
