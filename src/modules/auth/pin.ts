// PIN de mostrador P1-3. Núcleo puro salvo scrypt de node:crypto (sin IO).
// Bloqueo local por dispositivo nombrado (AU9.3): no crea sesión, no
// sustituye OIDC ni reauth para acciones sensibles (AU10.1). El adaptador
// (ruta) exige Dueño + reauth reciente, guarda solo el hash y audita.

import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export const PIN_MIN = 4 as const;
export const PIN_MAX = 6 as const;
export const MAX_FALLOS_PIN = 5 as const;
export const BLOQUEO_PIN_MS = 5 * 60 * 1000;

export function validarPin(pin: string): boolean {
  return new RegExp(`^\\d{${PIN_MIN},${PIN_MAX}}$`).test(pin);
}

// Formato scrypt$<saltHex>$<hashHex>. Salt de 128 bits, N=16384.
export function hashearPin(pin: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(pin, salt, 32).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

export function verificarPin(pin: string, guardado: string): boolean {
  const partes = guardado.split("$");
  if (partes.length !== 3 || partes[0] !== "scrypt") return false;
  const [_, salt, esperado] = partes as [string, string, string];
  if (!salt || !esperado) return false;
  let real: Buffer;
  try {
    real = scryptSync(pin, salt, 32);
  } catch {
    return false;
  }
  const ref = Buffer.from(esperado, "hex");
  if (real.length !== ref.length) return false;
  return timingSafeEqual(real, ref);
}

export interface EstadoFallosPin {
  fallos: number;
  bloqueadoHastaMs: number;
}

export function estaBloqueadoPin(estado: EstadoFallosPin | undefined, ahoraMs: number): boolean {
  return !!estado && estado.bloqueadoHastaMs > ahoraMs;
}

export function registrarFalloPin(previo: EstadoFallosPin | undefined, ahoraMs: number): EstadoFallosPin {
  const fallos = (previo?.fallos ?? 0) + 1;
  if (fallos >= MAX_FALLOS_PIN) {
    return { fallos, bloqueadoHastaMs: ahoraMs + BLOQUEO_PIN_MS };
  }
  return { fallos, bloqueadoHastaMs: previo?.bloqueadoHastaMs ?? 0 };
}
