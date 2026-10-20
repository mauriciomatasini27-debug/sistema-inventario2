import { createHmac } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { gmailWatchRoutes } from "../../db/schema-google.js";
import { getControlDb } from "../db.js";

export class CasillaEnOtroComercio extends Error {
  constructor() {
    super("La casilla ya está conectada a otro comercio");
    this.name = "CasillaEnOtroComercio";
  }
}

export interface RutaWatch {
  readonly tenantId: string;
  readonly connectionId: string;
}

function pepper(env: NodeJS.ProcessEnv = process.env): string {
  const valor = env["GMAIL_ROUTE_PEPPER"] ?? "";
  if (!valor) throw new Error("Falta GMAIL_ROUTE_PEPPER");
  return valor;
}

export function hmacCasilla(email: string, env: NodeJS.ProcessEnv = process.env): string {
  const normalizado = email.trim().toLowerCase();
  return createHmac("sha256", pepper(env)).update(normalizado).digest("hex");
}

function esConflictoUnico(e: unknown): boolean {
  return typeof e === "object" && e !== null && "code" in e && (e as { code: unknown }).code === "23505";
}

async function buscarActiva(emailHmac: string) {
  const db = getControlDb();
  const [fila] = await db
    .select()
    .from(gmailWatchRoutes)
    .where(and(eq(gmailWatchRoutes.emailHmac, emailHmac), eq(gmailWatchRoutes.activo, true)))
    .limit(1);
  return fila ?? null;
}

export async function guardarRutaWatch(input: {
  readonly email: string;
  readonly tenantId: string;
  readonly connectionId: string;
  readonly env?: NodeJS.ProcessEnv;
}): Promise<RutaWatch> {
  const emailHmac = hmacCasilla(input.email, input.env ?? process.env);
  const previa = await buscarActiva(emailHmac);
  if (previa) {
    if (previa.tenantId !== input.tenantId || previa.connectionId !== input.connectionId) {
      throw new CasillaEnOtroComercio();
    }
    await getControlDb()
      .update(gmailWatchRoutes)
      .set({ updatedAt: new Date() })
      .where(eq(gmailWatchRoutes.id, previa.id));
    return { tenantId: previa.tenantId, connectionId: previa.connectionId };
  }
  try {
    await getControlDb().insert(gmailWatchRoutes).values({
      emailHmac,
      tenantId: input.tenantId,
      connectionId: input.connectionId,
      activo: true,
    });
    return { tenantId: input.tenantId, connectionId: input.connectionId };
  } catch (e) {
    if (!esConflictoUnico(e)) throw e;
    const ganadora = await buscarActiva(emailHmac);
    if (!ganadora) throw e;
    if (ganadora.tenantId !== input.tenantId || ganadora.connectionId !== input.connectionId) {
      throw new CasillaEnOtroComercio();
    }
    return { tenantId: ganadora.tenantId, connectionId: ganadora.connectionId };
  }
}

export async function resolverRutaWatch(
  email: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<RutaWatch | null> {
  const fila = await buscarActiva(hmacCasilla(email, env));
  if (!fila) return null;
  return { tenantId: fila.tenantId, connectionId: fila.connectionId };
}

export async function desactivarRutaWatch(input: {
  readonly tenantId: string;
  readonly connectionId: string;
}): Promise<void> {
  await getControlDb()
    .update(gmailWatchRoutes)
    .set({ activo: false, updatedAt: new Date() })
    .where(
      and(
        eq(gmailWatchRoutes.tenantId, input.tenantId),
        eq(gmailWatchRoutes.connectionId, input.connectionId),
        eq(gmailWatchRoutes.activo, true),
      ),
    );
}
