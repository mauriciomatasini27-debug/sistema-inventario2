import { createHmac, timingSafeEqual } from "node:crypto";

// P1-80: manifest oficial Mercado Pago (id/request-id/ts) + HMAC-SHA256 del secreto del panel.
export const MP_WEBHOOK_SKEW_MS = 5 * 60 * 1000;

const UMBRAL_TS_MS = 1e12;

export function esProduccionMpWebhook(): boolean {
  return process.env.NODE_ENV === "production";
}

export function permiteBypassTestMpWebhook(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.MP_WEBHOOK_ALLOW_TEST === "1" && env.NODE_ENV !== "production";
}

/** MP manda ts en segundos (10 dígitos); si ya es ms (≥ 1e12), no escala. */
export function timestampFirmaMpMs(tsRaw: string): number | null {
  const n = Number(tsRaw);
  if (!Number.isFinite(n)) return null;
  return n < UMBRAL_TS_MS ? n * 1000 : n;
}

export function manifestFirmaMp(dataId: string | undefined, requestId: string | undefined, ts: string): string {
  const partes: string[] = [];
  const id = dataId?.trim();
  if (id) partes.push(`id:${id.toLowerCase()}`);
  const rid = requestId?.trim();
  if (rid) partes.push(`request-id:${rid}`);
  partes.push(`ts:${ts}`);
  return `${partes.join(";")};`;
}

export function parsearHeaderFirmaMp(xSignature: string): { ts: string; v1: string } | null {
  const normalizado = xSignature.trim();
  if (!normalizado) return null;
  let ts = "";
  let v1 = "";
  for (const trozo of normalizado.split(",")) {
    const eq = trozo.indexOf("=");
    if (eq <= 0) continue;
    const clave = trozo.slice(0, eq).trim();
    const valor = trozo.slice(eq + 1).trim();
    if (clave === "ts") ts = valor;
    else if (clave === "v1") v1 = valor;
  }
  if (!ts || !v1) return null;
  return { ts, v1 };
}

function hmacManifest(manifest: string, secreto: string): string {
  return createHmac("sha256", secreto).update(manifest, "utf8").digest("hex");
}

function compararHexConstante(esperado: string, recibido: string): boolean {
  if (esperado.length !== recibido.length) return false;
  try {
    return timingSafeEqual(Buffer.from(esperado, "utf8"), Buffer.from(recibido, "utf8"));
  } catch {
    return false;
  }
}

export type VerificacionFirmaMp =
  | { ok: true }
  | { ok: false; codigo: "firma_ausente" | "firma_invalida" | "ts_viejo" | "sin_secreto" };

export function verificarFirmaMpWebhook(input: {
  xSignature: string | null;
  xRequestId: string | null;
  dataId: string | undefined;
  secreto: string;
  ahoraMs?: number;
  toleranciaMs?: number;
}): VerificacionFirmaMp {
  const { secreto } = input;
  if (!secreto) {
    return { ok: false, codigo: "sin_secreto" };
  }
  const cabecera = input.xSignature ?? "";
  const parsed = parsearHeaderFirmaMp(cabecera);
  if (!parsed) {
    return { ok: false, codigo: cabecera ? "firma_invalida" : "firma_ausente" };
  }
  const manifest = manifestFirmaMp(input.dataId, input.xRequestId ?? undefined, parsed.ts);
  const esperado = hmacManifest(manifest, secreto);
  if (!compararHexConstante(esperado, parsed.v1)) {
    return { ok: false, codigo: "firma_invalida" };
  }
  const tsMs = timestampFirmaMpMs(parsed.ts);
  if (tsMs === null) {
    return { ok: false, codigo: "firma_invalida" };
  }
  const ahora = input.ahoraMs ?? Date.now();
  const tol = input.toleranciaMs ?? MP_WEBHOOK_SKEW_MS;
  const delta = ahora - tsMs;
  if (Math.abs(delta) > tol) {
    return { ok: false, codigo: "ts_viejo" };
  }
  return { ok: true };
}

export function dataIdDesdeCuerpoMp(body: unknown): string | undefined {
  if (!body || typeof body !== "object") return undefined;
  const data = (body as { data?: unknown }).data;
  if (!data || typeof data !== "object") return undefined;
  const id = (data as { id?: unknown }).id;
  return typeof id === "string" && id.trim() ? id.trim() : undefined;
}