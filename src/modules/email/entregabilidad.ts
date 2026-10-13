// Núcleo puro NE13: supresión, webhooks y métricas. Sin IO.
// Se guarda hash, nunca el email plano (NE10/NE11).

import { createHash, timingSafeEqual } from "node:crypto";

export function hash_email(email: string): string {
  return createHash("sha256").update(email.trim().toLowerCase(), "utf8").digest("hex");
}

export type WebhookEvento = "entregado" | "demorado" | "duro" | "blando" | "queja";

export interface Supresion {
  readonly emailHash: string;
  readonly motivo: string;
  readonly hasta: number | null;
}

// Rebote duro o queja → supresión + banner NE9.9. Blandos: 3 en 7 días →
// temporal 7 días (seguridad y cuenta se siguen intentando).
export function evaluar_supresion(args: {
  evento: WebhookEvento;
  blandosSeguidos: number;
  ahoraMs: number;
}): Supresion | null {
  if (args.evento === "duro" || args.evento === "queja") {
    return { emailHash: "", motivo: args.evento, hasta: null };
  }
  if (args.evento === "blando" && args.blandosSeguidos >= 3) {
    return { emailHash: "", motivo: "blando_temporal", hasta: args.ahoraMs + 7 * 24 * 3600_000 };
  }
  return null;
}

// Webhook idempotente por provider_event_id (delivery_status único).
export function es_webhook_duplicado(vistos: ReadonlySet<string>, providerEventId: string): boolean {
  return vistos.has(providerEventId);
}

// Firma del proveedor (Svix en el adaptador): interfaz pura de comparación.
export function verificar_firma(esperadaHex: string, recibidaHex: string): boolean {
  const a = Buffer.from(esperadaHex, "utf8");
  const b = Buffer.from(recibidaHex, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

export function metricas(args: { enviados: number; entregados: number; rebotes: number; quejas: number }): {
  tasaQuejas: number;
  tasaRebotes: number;
  alerta: boolean;
} {
  const tasaQuejas = args.enviados > 0 ? args.quejas / args.enviados : 0;
  const tasaRebotes = args.enviados > 0 ? args.rebotes / args.enviados : 0;
  return { tasaQuejas, tasaRebotes, alerta: tasaQuejas > 0.001 || tasaRebotes > 0.02 };
}
