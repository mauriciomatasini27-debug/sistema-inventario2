// ADMIN-PANEL-WIRE: un proceso, una lectura. Las escrituras de este PID no se pisan.

import { resetAdmin, adminStore } from "./admin-store.js";
import type {
  AdminActoMem,
  AdminAsientoMem,
  AdminEventoVidaMem,
  AdminHealthMem,
  AdminOverrideMem,
} from "./admin-store.js";
import {
  leerActosAdminMem,
  leerAsientosAdminBatch,
  leerEventosVidaAdminBatch,
  leerHealthAdminBatch,
  leerOverridesAdminBatch,
  leerPoliciesMoraAdminBatch,
  leerUsoDiarioAdminBatch,
  type DunningPolicyMem,
} from "./admin-db.js";
import { guardarUsoDiario, type UsoDiarioContadores } from "../modules/admin/uso-margen.js";

export type HydratePhase =
  | "actos"
  | "health"
  | "asientos"
  | "eventos_vida"
  | "overrides"
  | "rollouts"
  | "policies"
  | "uso_diario";

export type HydrateReport = {
  ok: boolean;
  fases: ReadonlySet<HydratePhase>;
  merged: Partial<Record<HydratePhase, number>>;
};

export type HidratacionLeida = {
  actos: AdminActoMem[];
  health: AdminHealthMem[];
  asientos: AdminAsientoMem[];
  eventosVida: AdminEventoVidaMem[];
  overrides: AdminOverrideMem[];
  policies: Map<string, DunningPolicyMem>;
  usoDiario: Map<string, UsoDiarioContadores>;
};

const SEMILLA_MORA: Readonly<Record<string, Omit<DunningPolicyMem, "plan">>> = {
  demo: { diasGracia: 14, diasASuspension: 15, diasABaja: 45, activa: true },
  base: { diasGracia: 14, diasASuspension: 15, diasABaja: 45, activa: true },
  plus: { diasGracia: 14, diasASuspension: 15, diasABaja: 45, activa: true },
};

let hidratando: Promise<HydrateReport> | null = null;

function porCreadoEn(a: { creadoEn: string }, b: { creadoEn: string }): number {
  if (a.creadoEn < b.creadoEn) return -1;
  if (a.creadoEn > b.creadoEn) return 1;
  return 0;
}

function esSemilla(plan: string, mem: DunningPolicyMem): boolean {
  const s = SEMILLA_MORA[plan];
  if (!s) return false;
  return (
    mem.diasGracia === s.diasGracia &&
    mem.diasASuspension === s.diasASuspension &&
    mem.diasABaja === s.diasABaja &&
    mem.activa === s.activa
  );
}

export function fusionarHidratacion(leido: HidratacionLeida): Partial<Record<HydratePhase, number>> {
  const merged: Partial<Record<HydratePhase, number>> = {};

  // La cadena vive en el último hash. Si este PID ya escribió, mezclar la base la parte.
  if (adminStore.actos.length > 0) {
    merged.actos = 0;
  } else {
    const ordenados = [...leido.actos].sort(porCreadoEn).slice(-500);
    adminStore.actos = ordenados;
    merged.actos = ordenados.length;
  }

  let health = 0;
  for (const h of leido.health) {
    const mem = adminStore.health.get(h.tenantId);
    if (mem && mem.actualizadoEn >= h.actualizadoEn) continue;
    adminStore.health.set(h.tenantId, h);
    health += 1;
  }
  merged.health = health;

  // Un cobro repetido después del reinicio tiene que seguir respondiendo 409.
  const claves = new Set([...adminStore.asientos.values()].map((a) => a.idempotencyKey));
  let asientos = 0;
  for (const a of leido.asientos) {
    if (claves.has(a.idempotencyKey) || adminStore.asientos.has(a.id)) continue;
    adminStore.asientos.set(a.id, a);
    claves.add(a.idempotencyKey);
    asientos += 1;
  }
  merged.asientos = asientos;

  const vistas = new Set(adminStore.eventosVida.map((e) => e.idempotencyKey));
  let eventos = 0;
  for (const e of [...leido.eventosVida].sort(porCreadoEn)) {
    if (vistas.has(e.idempotencyKey)) continue;
    adminStore.eventosVida.push(e);
    vistas.add(e.idempotencyKey);
    eventos += 1;
  }
  merged.eventos_vida = eventos;

  let overrides = 0;
  for (const o of leido.overrides) {
    const clave = `${o.tenantId}:${o.flag}`;
    const mem = adminStore.overrides.get(clave);
    if (mem && mem.creadoEn >= o.creadoEn) continue;
    adminStore.overrides.set(clave, o);
    overrides += 1;
  }
  merged.overrides = overrides;

  let policies = 0;
  for (const [plan, pol] of leido.policies) {
    const mem = adminStore.policies.get(plan);
    if (mem && !esSemilla(plan, mem)) continue;
    if (
      mem &&
      mem.diasGracia === pol.diasGracia &&
      mem.diasASuspension === pol.diasASuspension &&
      mem.diasABaja === pol.diasABaja &&
      mem.activa === pol.activa
    ) {
      continue;
    }
    adminStore.policies.set(plan, pol);
    policies += 1;
  }
  merged.policies = policies;

  let uso = 0;
  for (const [clave, fila] of leido.usoDiario) {
    if (adminStore.usoDiario.has(clave)) continue;
    if (!guardarUsoDiario(adminStore.usoDiario, fila).ok) continue;
    uso += 1;
  }
  merged.uso_diario = uso;

  return merged;
}

async function correr(): Promise<HydrateReport> {
  if (!process.env.CONTROL_DATABASE_URL) {
    return { ok: false, fases: new Set(), merged: {} };
  }
  try {
    const [actos, health, asientos, eventosVida, overrides, policies, usoDiario] = await Promise.all([
      leerActosAdminMem(),
      leerHealthAdminBatch(),
      leerAsientosAdminBatch(),
      leerEventosVidaAdminBatch(),
      leerOverridesAdminBatch(),
      leerPoliciesMoraAdminBatch(),
      leerUsoDiarioAdminBatch(),
    ]);
    const merged = fusionarHidratacion({
      actos,
      health,
      asientos,
      eventosVida,
      overrides,
      policies,
      usoDiario,
    });
    const fases = new Set<HydratePhase>(Object.keys(merged) as HydratePhase[]);
    return { ok: true, fases, merged };
  } catch {
    return { ok: false, fases: new Set(), merged: {} };
  }
}

export function asegurarAdminHidratado(): Promise<HydrateReport> {
  if (!hidratando) hidratando = correr();
  return hidratando;
}

export function _resetHydrateGateForTests(): void {
  hidratando = null;
  resetAdmin();
}
