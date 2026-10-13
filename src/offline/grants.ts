import { SignJWT, jwtVerify } from "jose";
import type { AlcanceGrant, OfflineGrant } from "./types.js";

// Predicado puro de grant offline (OF9.5 / E3 ADR-0003).
// Acciones sensibles (sueldos, retiro dueño, ajustes tope, cierre) exigen
// online: este predicado devuelve false para ellas aunque haya grant.

const ALCANCES_EMPLEADO: readonly AlcanceGrant[] = ["venta", "stock", "caja", "fiado_cobro"];

/** ¿Puede operar offline con este grant ahora? Puro, sin IO. */
export function puedeOperarOffline(
  grant: OfflineGrant | null,
  alcancePedido: AlcanceGrant,
  ahora: Date = new Date(),
): boolean {
  if (!grant) return false;
  if (grant.alcance !== alcancePedido) return false;
  if (!ALCANCES_EMPLEADO.includes(grant.alcance)) return false;
  // Revocado => cuarentena: exige revalidar online aunque no haya vencido.
  const revocadoEn = (grant as { revocadoEn?: string | undefined }).revocadoEn;
  if (revocadoEn) return false;
  return new Date(grant.expiraEn).getTime() > ahora.getTime();
}

// SYNC-S7: emisión JWT verificable offline (jose HS256).
// El token es el JWT; en memoria/DB solo queda sha256(token).
// La verificación offline no toca DB: solo firma + exp + alcance.

export function obtenerSecretoGrant(env: NodeJS.ProcessEnv = process.env): string {
  const s = env.OFFLINE_GRANT_SECRET ?? env.JOBS_SECRET ?? "";
  if (s) return s;
  return "dev-offline-grant-secret-solo-tests";
}

export interface EmitirGrantInput {
  grantId: string;
  tenantId: string;
  deviceCode: string;
  alcance: AlcanceGrant;
  expiraEn: string;
  secreto?: string | undefined;
}

export async function emitirGrantJWT(input: EmitirGrantInput): Promise<string> {
  const secreto = input.secreto ?? obtenerSecretoGrant();
  const key = new TextEncoder().encode(secreto);
  return await new SignJWT({
    grant_id: input.grantId,
    tenant_id: input.tenantId,
    device_code: input.deviceCode,
    alcance: input.alcance,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setJti(input.grantId)
    .setIssuedAt()
    .setExpirationTime(new Date(input.expiraEn))
    .sign(key);
}

export interface GrantVerificado {
  grantId: string;
  tenantId: string;
  deviceCode: string;
  alcance: AlcanceGrant;
  expiraEn: string;
}

/** Verifica firma + exp + forma sin DB. Null si inválido o vencido. */
export async function verificarGrantOffline(
  token: string,
  opts?: { secreto?: string | undefined },
): Promise<GrantVerificado | null> {
  try {
    const secreto = opts?.secreto ?? obtenerSecretoGrant();
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secreto));
    const grantId = payload["grant_id"];
    const tenantId = payload["tenant_id"];
    const deviceCode = payload["device_code"];
    const alcance = payload["alcance"];
    if (typeof grantId !== "string" || !grantId) return null;
    if (typeof tenantId !== "string" || !tenantId) return null;
    if (typeof deviceCode !== "string" || !deviceCode) return null;
    if (typeof alcance !== "string" || !ALCANCES_EMPLEADO.includes(alcance as AlcanceGrant)) return null;
    const exp = typeof payload.exp === "number" ? new Date(payload.exp * 1000).toISOString() : null;
    if (!exp) return null;
    return { grantId, tenantId, deviceCode, alcance: alcance as AlcanceGrant, expiraEn: exp };
  } catch {
    return null;
  }
}
