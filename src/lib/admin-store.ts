// LANE admin — Store en memoria (espejo de control en store.ts).
//
// Fuente de verdad en monoproceso; admin-db agrega copia durable best-effort
// cuando hay CONTROL_DATABASE_URL viva. Solo gestión, nunca negocio.

export interface AdminActoMem {
  id: string;
  actorGoogleSub: string;
  actoKind: string;
  tenantId: string | null;
  detalle: unknown;
  prevHash: string | null;
  hash: string;
  origen: string;
  creadoEn: string;
}

export interface AdminHealthMem {
  tenantId: string;
  plan: string;
  estadoVisto: string;
  ticketsHoy: number;
  demosPurgadas: number;
  cobrosCentavos: bigint;
  ultimaSenalEn: string | null;
  actualizadoEn: string;
}

export interface AdminAsientoMem {
  id: string;
  tenantId: string;
  montoCentavos: bigint;
  medio: string;
  referenciaExterna: string;
  idempotencyKey: string;
  asientoCompensatorioDe?: string | undefined;
  creadoPor: string;
  creadoEn: string;
}

export interface AdminEventoVidaMem {
  id: string;
  tenantId: string;
  deEstado: string;
  aEstado: string;
  motivo: string;
  actor: string;
  idempotencyKey: string;
  creadoEn: string;
}

export interface AdminOverrideMem {
  tenantId: string;
  flag: string;
  valor: boolean;
  motivo: string;
  expiraEn: string | null;
  creadoPor?: string | undefined;
  creadoEn: string;
}

export const adminStore = {
  actos: [] as AdminActoMem[],
  health: new Map<string, AdminHealthMem>(),
  asientos: new Map<string, AdminAsientoMem>(),
  eventosVida: [] as AdminEventoVidaMem[],
  overrides: new Map<string, AdminOverrideMem>(),
  // Políticas de mora en memoria (seed PA7; la verdad vive en dunning_policies).
  policies: new Map<string, { plan: string; diasGracia: number; diasASuspension: number; diasABaja: number; activa: boolean }>([
    ["demo", { plan: "demo", diasGracia: 14, diasASuspension: 15, diasABaja: 45, activa: true }],
    ["base", { plan: "base", diasGracia: 14, diasASuspension: 15, diasABaja: 45, activa: true }],
    ["plus", { plan: "plus", diasGracia: 14, diasASuspension: 15, diasABaja: 45, activa: true }],
  ]),
  auditoriaSana: true,
  moraRuns: new Map<string, { fecha: string; aplicados: string[]; corridoEn: string }>(),
};

export function ultimoHashAdmin(): string | null {
  const n = adminStore.actos.length;
  return n === 0 ? null : (adminStore.actos[n - 1]?.hash ?? null);
}

export function resetAdmin(): void {
  adminStore.actos = [];
  adminStore.health.clear();
  adminStore.asientos.clear();
  adminStore.eventosVida = [];
  adminStore.overrides.clear();
  adminStore.moraRuns.clear();
  adminStore.auditoriaSana = true;
}
