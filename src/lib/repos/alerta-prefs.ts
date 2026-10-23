import { and, eq } from "drizzle-orm";
import { notificationPreferences } from "../../db/schema-whatsapp.js";
import {
  aplicarEleccion,
  aplicarOptIn,
  type EleccionGuardada,
  type EleccionPedida,
  type OptInGuardado,
} from "../../modules/alertas/destinatarios.js";
import type { CanalElegido, PersonaDueno, PersonaEncargado } from "../../modules/alertas/stock-bajo.js";
import { control } from "./_almacen.js";
import { dbVivaTenant, intentarPersistir } from "../server-db.js";

type WaPrefMem = {
  optIn: boolean;
  avisoHora: string;
  pausadoHastaMs: number | null;
  canal?: CanalElegido;
  optInAtMs?: number | null;
};

function claveMem(tenantId: string, googleSub: string): string {
  return `${tenantId}:${googleSub}`;
}

function prefsMem(tenantId: string, googleSub: string): WaPrefMem | undefined {
  return control.waPrefs.get(claveMem(tenantId, googleSub));
}

function defaults(): EleccionGuardada & OptInGuardado {
  return { canal: "email", avisoHora: "08:00", pausadoHastaMs: null, optIn: false, optInAtMs: null };
}

export async function prefsDe(tenantId: string, googleSub: string): Promise<EleccionGuardada & OptInGuardado> {
  const db = dbVivaTenant(tenantId);
  if (db) {
    try {
      const [f] = await db
        .select()
        .from(notificationPreferences)
        .where(and(eq(notificationPreferences.tenantId, tenantId), eq(notificationPreferences.googleSub, googleSub)))
        .limit(1);
      if (f) {
        return {
          canal: (f.canal as CanalElegido) ?? "email",
          avisoHora: f.avisoHora,
          pausadoHastaMs: f.pausadoHasta?.getTime() ?? null,
          optIn: f.optIn,
          optInAtMs: f.optInAt?.getTime() ?? null,
        };
      }
    } catch (e) {
      console.warn("[alertas] preferencias sin DB, uso memoria", e);
    }
  }
  const p = prefsMem(tenantId, googleSub);
  if (!p) return defaults();
  return {
    canal: p.canal ?? "email",
    avisoHora: p.avisoHora,
    pausadoHastaMs: p.pausadoHastaMs,
    optIn: p.optIn,
    optInAtMs: p.optIn ? (p.optInAtMs ?? null) : null,
  };
}

async function escribirMem(tenantId: string, googleSub: string, parcial: Partial<WaPrefMem>): Promise<void> {
  const k = claveMem(tenantId, googleSub);
  const prev = prefsMem(tenantId, googleSub) ?? { optIn: false, avisoHora: "08:00", pausadoHastaMs: null, canal: "email" as CanalElegido };
  control.waPrefs.set(k, { ...prev, ...parcial, canal: parcial.canal ?? prev.canal ?? "email" });
}

export async function guardarEleccion(input: {
  tenantId: string;
  googleSub: string;
  pedido: EleccionPedida;
}): Promise<EleccionGuardada> {
  const prev = await prefsDe(input.tenantId, input.googleSub);
  const applied = aplicarEleccion(prev, input.pedido);
  if (!applied.ok) throw new Error("eleccion_invalida");
  const eleccion = applied.eleccion;
  await escribirMem(input.tenantId, input.googleSub, {
    canal: eleccion.canal,
    avisoHora: eleccion.avisoHora,
    pausadoHastaMs: eleccion.pausadoHastaMs,
  });
  await intentarPersistir(async (db) => {
    await db
      .insert(notificationPreferences)
      .values({
        tenantId: input.tenantId,
        googleSub: input.googleSub,
        canal: eleccion.canal,
        avisoHora: eleccion.avisoHora,
        pausadoHasta: eleccion.pausadoHastaMs != null ? new Date(eleccion.pausadoHastaMs) : null,
        optIn: prev.optIn,
        optInAt: prev.optInAtMs != null ? new Date(prev.optInAtMs) : null,
      })
      .onConflictDoUpdate({
        target: [notificationPreferences.tenantId, notificationPreferences.googleSub],
        set: {
          canal: eleccion.canal,
          avisoHora: eleccion.avisoHora,
          pausadoHasta: eleccion.pausadoHastaMs != null ? new Date(eleccion.pausadoHastaMs) : null,
          updatedAt: new Date(),
        },
      });
  }, input.tenantId);
  return eleccion;
}

export async function guardarOptIn(input: {
  tenantId: string;
  googleSub: string;
  alta: boolean;
  ahoraMs: number;
  optInTexto?: string | null;
}): Promise<void> {
  const prev = await prefsDe(input.tenantId, input.googleSub);
  const next = aplicarOptIn({ optIn: prev.optIn, optInAtMs: prev.optInAtMs }, input.alta, input.ahoraMs);
  await escribirMem(input.tenantId, input.googleSub, {
    optIn: next.optIn,
    optInAtMs: next.optInAtMs,
    pausadoHastaMs: prev.pausadoHastaMs,
  });
  await intentarPersistir(async (db) => {
    const prevRow = await prefsDe(input.tenantId, input.googleSub);
    await db
      .insert(notificationPreferences)
      .values({
        tenantId: input.tenantId,
        googleSub: input.googleSub,
        canal: prevRow.canal,
        avisoHora: prevRow.avisoHora,
        pausadoHasta: prevRow.pausadoHastaMs != null ? new Date(prevRow.pausadoHastaMs) : null,
        optIn: next.optIn,
        optInAt: next.optInAtMs != null ? new Date(next.optInAtMs) : null,
        optInTexto: input.optInTexto ?? null,
      })
      .onConflictDoUpdate({
        target: [notificationPreferences.tenantId, notificationPreferences.googleSub],
        set: {
          optIn: next.optIn,
          optInAt: next.optInAtMs != null ? new Date(next.optInAtMs) : null,
          optInTexto: input.optInTexto ?? null,
          updatedAt: new Date(),
        },
      });
  }, input.tenantId);
}

export async function cargarPersonasAlerta(tenantId: string): Promise<{
  duenos: PersonaDueno[];
  encargados: PersonaEncargado[];
}> {
  const duenos: PersonaDueno[] = [];
  const encargados: PersonaEncargado[] = [];
  const miembros = [...control.memberships.values()].filter((m) => m.tenantId === tenantId && m.estado === "activo");
  for (const m of miembros) {
    const prefs = await prefsDe(tenantId, m.googleSub);
    const email = control.users.get(m.googleSub)?.email;
    if (m.rol === "dueno") {
      duenos.push({
        rol: "dueno",
        googleSub: m.googleSub,
        optInWa: prefs.optIn,
        avisoHora: prefs.avisoHora,
        pausaHastaMs: prefs.pausadoHastaMs,
        ...(email ? { email } : {}),
      });
    } else {
      encargados.push({
        rol: "encargado",
        googleSub: m.googleSub,
        optInWa: prefs.optIn,
        canal: prefs.canal,
        avisoHora: prefs.avisoHora,
        pausaHastaMs: prefs.pausadoHastaMs,
        ...(email ? { email } : {}),
      });
    }
  }
  return { duenos, encargados };
}
