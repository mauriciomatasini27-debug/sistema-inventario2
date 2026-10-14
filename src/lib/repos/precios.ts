import { eq } from "drizzle-orm";
import { priceAdjustments, pricingAuditLog } from "../../db/schema-precios.js";
import { esModoMulti } from "../tenant-mode.js";
import { BaseNoDisponible, dbVivaTenant, type TenantDb } from "../server-db.js";
import { store } from "../store.js";
import {
  crearAjuste,
  type Ajuste,
  type AuditoriaPrecios,
  type DireccionAjuste,
  type ItemCatalogo,
} from "../../modules/pricing/precios.js";

export interface AjusteNuevo {
  readonly idempotencyKey: string;
  readonly direccion: DireccionAjuste;
  readonly porcentaje: number;
  readonly vigenciaTipo: "ahora" | "programada";
  readonly aplicaEn: string | null;
  readonly confirmado: boolean;
  readonly creadoPor: string;
  readonly ahoraIso: string;
  readonly pasoCentavos?: bigint | undefined;
  readonly items: ReadonlyArray<ItemCatalogo>;
}

export type RegistrarAjusteResultado =
  | { ok: true; ajusteId: string; fuente: "db" | "memoria" }
  | { ok: false; codigo: "CLAVE_REPETIDA"; error: string }
  | { ok: false; codigo: "NO_VALIDO"; status: 403 | 422; error: string };

function esConflictoUnico(e: unknown): boolean {
  return typeof e === "object" && e !== null && "code" in e && (e as { code: unknown }).code === "23505";
}

function aBaseNoDisponible(e: unknown): BaseNoDisponible {
  return e instanceof BaseNoDisponible ? e : new BaseNoDisponible();
}

export async function registrarAjuste(input: AjusteNuevo): Promise<RegistrarAjusteResultado> {
  const r = crearAjuste({
    idempotencyKey: input.idempotencyKey,
    direccion: input.direccion,
    porcentaje: input.porcentaje,
    vigenciaTipo: input.vigenciaTipo,
    aplicaEn: input.aplicaEn,
    confirmado: input.confirmado,
    online: true,
    rol: "dueno",
    creadoPor: input.creadoPor,
    ahoraIso: input.ahoraIso,
    ...(input.pasoCentavos !== undefined ? { pasoCentavos: input.pasoCentavos } : {}),
    items: input.items,
    vistos: store.ajustes,
  });
  if (r.status !== 201) {
    if (r.status === 409) return { ok: false, codigo: "CLAVE_REPETIDA", error: r.error };
    return { ok: false, codigo: "NO_VALIDO", status: r.status, error: r.error };
  }
  const db = dbVivaTenant();
  if (!db) {
    store.ajustes.set(input.idempotencyKey, r.ajuste);
    return { ok: true, ajusteId: r.ajuste.id, fuente: "memoria" };
  }
  try {
    return await registrarAjusteEnDb(db, input.idempotencyKey, r.ajuste, r.auditoria, input.confirmado);
  } catch (e) {
    if (esConflictoUnico(e)) {
      try {
        const previo = await db
          .select()
          .from(priceAdjustments)
          .where(eq(priceAdjustments.idempotencyKey, input.idempotencyKey))
          .limit(1);
        if (previo[0]) return { ok: false, codigo: "CLAVE_REPETIDA", error: "idempotency-key repetida" };
      } catch (e2) {
        if (esModoMulti()) throw aBaseNoDisponible(e2);
      }
      if (esModoMulti()) throw aBaseNoDisponible(e);
    } else if (esModoMulti()) {
      throw aBaseNoDisponible(e);
    }
    store.ajustes.set(input.idempotencyKey, r.ajuste);
    return { ok: true, ajusteId: r.ajuste.id, fuente: "memoria" };
  }
}

async function registrarAjusteEnDb(
  db: TenantDb,
  key: string,
  ajuste: Ajuste,
  auditoria: AuditoriaPrecios,
  confirmado: boolean,
): Promise<RegistrarAjusteResultado> {
  const previo = await db.select().from(priceAdjustments).where(eq(priceAdjustments.idempotencyKey, key)).limit(1);
  if (previo[0]) return { ok: false, codigo: "CLAVE_REPETIDA", error: "idempotency-key repetida" };
  const ahora = new Date();
  const ins = await db.transaction(async (tx) => {
    const filas = await tx
      .insert(priceAdjustments)
      .values({
        idempotencyKey: key,
        direccion: ajuste.direccion,
        porcentajeBp: Math.round(ajuste.porcentaje * 100),
        pasoCentavos: ajuste.pasoCentavos,
        vigenciaTipo: ajuste.vigenciaTipo,
        aplicaEn: ajuste.aplicaEn ? new Date(ajuste.aplicaEn) : null,
        estado: ajuste.estado,
        confirmado,
        creadoPor: ajuste.creadoPor,
        createdAt: ahora,
      })
      .returning({ id: priceAdjustments.id });
    const fila = filas[0];
    if (!fila) throw new Error("ajuste sin fila");
    await tx.insert(pricingAuditLog).values({
      actor: ajuste.creadoPor,
      ajusteId: fila.id,
      motivo: auditoria.motivo,
      antes: { texto: auditoria.antes },
      despues: { texto: auditoria.despues },
    });
    return fila.id;
  });
  store.ajustes.set(key, ajuste);
  return { ok: true, ajusteId: ins, fuente: "db" };
}
