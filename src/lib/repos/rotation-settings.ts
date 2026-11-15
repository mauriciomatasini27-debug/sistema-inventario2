import { eq } from "drizzle-orm";
import { rotationSettings } from "../../db/schema-analytics.js";
import { intentarLeer, intentarPersistir } from "../server-db.js";
import { dondeTenant, filaConTenant } from "../tenant-scope.js";
import { DEFAULT_SETTINGS, type RotationSettings } from "../../modules/analytics/tipos.js";

// Analytics es una base por comercio: una sola fila de settings por DB. El id
// fijo evita que dos upserts simultáneos inserten filas distintas.
export const ID_SETTINGS = "00000000-0000-0000-0000-000000000001";

let memoria: RotationSettings | null = null;

export function restablecerRotationSettings(): void {
  memoria = null;
}

function ventanaDe(n: number): 14 | 28 | 56 {
  return n === 14 || n === 28 || n === 56 ? n : DEFAULT_SETTINGS.ventanaCoberturaDias;
}

function aDominio(fila: typeof rotationSettings.$inferSelect): RotationSettings {
  return {
    ventanaCoberturaDias: ventanaDe(fila.ventanaCoberturaDias),
    dormidoN: fila.dormidoN,
    dormidoX: fila.dormidoX,
    coberturaReponerDias: fila.coberturaReponerDias,
    abcCorteA_bp: fila.abcCorteA,
    abcCorteB_bp: fila.abcCorteB,
    abcMinDias: fila.abcMinDias,
    markupMinBp: fila.markupMinBp,
  };
}

function aColumnas(settings: RotationSettings) {
  return {
    ventanaCoberturaDias: settings.ventanaCoberturaDias,
    dormidoN: settings.dormidoN,
    dormidoX: settings.dormidoX,
    coberturaReponerDias: settings.coberturaReponerDias,
    abcCorteA: settings.abcCorteA_bp,
    abcCorteB: settings.abcCorteB_bp,
    abcMinDias: settings.abcMinDias,
    markupMinBp: settings.markupMinBp,
  };
}

export async function leerRotationSettings(): Promise<RotationSettings> {
  // P1-84: una fila por comercio (tenant_id), no id global.
  const filas = await intentarLeer((db) =>
    db.select().from(rotationSettings).where(dondeTenant(rotationSettings.tenantId)).limit(1),
  );
  const fila = filas?.[0];
  if (fila) return aDominio(fila);
  return memoria ?? DEFAULT_SETTINGS;
}

export async function guardarRotationSettings(settings: RotationSettings): Promise<RotationSettings> {
  memoria = settings;
  const columnas = aColumnas(settings);
  const ahora = new Date();
  await intentarPersistir(async (db) => {
    const prev = await db.select({ id: rotationSettings.id }).from(rotationSettings).where(dondeTenant(rotationSettings.tenantId)).limit(1);
    if (prev[0]) {
      await db
        .update(rotationSettings)
        .set({ ...columnas, updatedAt: ahora })
        .where(eq(rotationSettings.id, prev[0].id));
      return;
    }
    await db.insert(rotationSettings).values(filaConTenant({ ...columnas, updatedAt: ahora }));
  });
  return settings;
}
