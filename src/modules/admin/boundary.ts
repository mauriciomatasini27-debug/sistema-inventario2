// LANE admin — Puerta del bounded context (ADR-0006/0011, PA3 Ley 25.326).
//
// Núcleo puro: sin IO, sin Drizzle. Única puerta: qué puede importar admin
// de control y qué está prohibido. Regla dura: admin NUNCA abre getTenantDb,
// nunca importa server-db ni schemas de negocio (caja, precios, crédito,
// proveedores, fiscal). Todo lo que admin sabe de un comercio entra como
// señal agregada vía ops_signals_outbox (solo contadores).

// Referencia opaca: solo id, nunca objeto tenant ni PII del comerciante.
export interface AdminTenantRef {
  readonly tenantId: string;
}

export type OrigenAdmin =
  | "panel"
  | "job:mora-diaria"
  | "job:verificar-hash"
  | "job:consumir-senales";

// Allowlist cerrada de tipos de señal que admin acepta. Todo lo demás se
// descarta (y se audita el descarte). Solo contadores, nunca negocio.
export const SENALES_PERMITIDAS = [
  "tenant_aprovisionado",
  "membership_otorgada",
  "demo_purgada",
  "sync_lote_confirmado",
] as const;
export type SenalPermitida = (typeof SENALES_PERMITIDAS)[number];

export function es_senal_permitida(tipo: string): tipo is SenalPermitida {
  return (SENALES_PERMITIDAS as readonly string[]).includes(tipo);
}
