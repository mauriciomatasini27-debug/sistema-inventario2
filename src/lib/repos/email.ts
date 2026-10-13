import { eq } from "drizzle-orm";
import { cashMovements } from "../../db/schema.js";
import { emailOutbox, notificationEvents } from "../../db/schema-email.js";
import { conTenant, esModoMulti, tenantActual } from "../tenant-mode.js";
import { BaseNoDisponible, dbVivaTenant } from "../server-db.js";
import { store, type EstadoStore } from "../store.js";
import { encolar_resumen_cierre, type EncolarResultado } from "../../modules/email/resumen-cierre.js";
import type { DatosCierre } from "../../modules/email/plantilla-cierre.js";

function aBaseNoDisponible(e: unknown): BaseNoDisponible {
  return e instanceof BaseNoDisponible ? e : new BaseNoDisponible();
}

// Sin contexto en multi (email/send) la memoria particionada no es
// alcanzable: solo se toca con tenant explícito o dentro de conTenant.
function hayMemoria(tenantId?: string): boolean {
  if (!esModoMulti()) return true;
  return Boolean(tenantId ?? tenantActual());
}

function enMemoria<T>(tenantId: string | undefined, fn: (s: EstadoStore) => T): T {
  if (tenantId) return conTenant(tenantId, () => fn(store));
  return fn(store);
}

export type EncolarEnvioResultado =
  | { ok: true; key: string; fuente: "db" | "memoria" }
  | { ok: false; codigo: "DUPLICADO"; key: string };

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
  if (usaMemoria && enMemoria(input.tenantId, (s) => s.emailOutbox.has(input.key))) {
    return { ok: false, codigo: "DUPLICADO", key: input.key };
  }
  const db = dbVivaTenant(input.tenantId);
  if (!db) {
    enMemoria(input.tenantId, (s) => {
      s.emailOutbox.set(input.key, {
        id: crypto.randomUUID(),
        idempotencyKey: input.key,
        stream: input.stream,
        to: input.to,
        plantilla: input.plantilla,
        estado: "encolado",
        creadoEn: new Date().toISOString(),
      } as never);
    });
    return { ok: true, key: input.key, fuente: "memoria" };
  }
  try {
    const previo = await db.select({ id: emailOutbox.id }).from(emailOutbox).where(eq(emailOutbox.idempotencyKey, input.key)).limit(1);
    if (previo[0]) return { ok: false, codigo: "DUPLICADO", key: input.key };
    const texto = Object.keys(input.vars).length > 0 ? JSON.stringify(input.vars) : input.plantilla;
    await db.insert(emailOutbox).values({
      categoria: input.stream,
      plantilla: input.plantilla,
      destinatario: input.to,
      asunto: input.plantilla,
      html: `<p>${input.plantilla}</p>`,
      texto,
      idempotencyKey: input.key,
      estado: "pendiente",
    });
  } catch (e) {
    if (esModoMulti()) throw aBaseNoDisponible(e);
    enMemoria(input.tenantId, (s) => {
      s.emailOutbox.set(input.key, {
        id: crypto.randomUUID(),
        idempotencyKey: input.key,
        stream: input.stream,
        to: input.to,
        plantilla: input.plantilla,
        estado: "encolado",
        creadoEn: new Date().toISOString(),
      } as never);
    });
    return { ok: true, key: input.key, fuente: "memoria" };
  }
  if (usaMemoria) {
    enMemoria(input.tenantId, (s) => {
      s.emailOutbox.set(input.key, {
        id: crypto.randomUUID(),
        idempotencyKey: input.key,
        stream: input.stream,
        to: input.to,
        plantilla: input.plantilla,
        estado: "encolado",
        creadoEn: new Date().toISOString(),
      } as never);
    });
  }
  return { ok: true, key: input.key, fuente: "db" };
}

// Snapshot de caja para el resumen: cash_movements del tenant con DB viva,
// memoria particionada en single sin base. En multi sin base propaga.
export async function resumenMovimientosCaja(tenantId?: string): Promise<{ total: bigint; porMedio: Record<string, bigint> }> {
  const db = dbVivaTenant(tenantId);
  if (db) {
    try {
      const filas = await db.select({ tipo: cashMovements.tipo, metodo: cashMovements.metodo, monto: cashMovements.montoCentavos }).from(cashMovements);
      const porMedio: Record<string, bigint> = {};
      let total = 0n;
      for (const m of filas) {
        const signo = m.tipo === "ingreso" ? 1n : -1n;
        porMedio[m.metodo] = (porMedio[m.metodo] ?? 0n) + signo * m.monto;
        total += signo * m.monto;
      }
      return { total, porMedio };
    } catch (e) {
      if (esModoMulti()) throw aBaseNoDisponible(e);
    }
  }
  if (!hayMemoria(tenantId)) return { total: 0n, porMedio: {} };
  return enMemoria(tenantId, (s) => {
    const porMedio: Record<string, bigint> = {};
    let total = 0n;
    for (const m of s.movements) {
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
  const r = enMemoria(input.tenantId, (s) =>
    encolar_resumen_cierre(
      { eventos: s.emailEventos, outbox: s.emailOutbox },
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
    const tenantUuid = esUuid(input.tenantId) ? input.tenantId : null;
    await db.transaction(async (tx) => {
      await tx
        .insert(notificationEvents)
        .values({
          tenantId: tenantUuid,
          tipo: r.evento.tipo,
          version: 1,
          payload: r.evento.payload as never,
          dedupeKey: r.evento.dedupeKey,
          estado: "pendiente",
        })
        .onConflictDoNothing({ target: notificationEvents.dedupeKey });
      await tx
        .insert(emailOutbox)
        .values({
          tenantId: tenantUuid,
          categoria: "cierre",
          plantilla: "cierre_v1",
          destinatario: r.envio.destinatario,
          asunto: r.envio.asunto,
          html: r.envio.html,
          texto: r.envio.texto,
          idempotencyKey: r.envio.idempotencyKey,
          estado: "pendiente",
        })
        .onConflictDoNothing({ target: emailOutbox.idempotencyKey });
    });
  } catch (e) {
    if (esModoMulti()) throw aBaseNoDisponible(e);
  }
  return r;
}

function esUuid(v: unknown): v is string {
  return typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}
