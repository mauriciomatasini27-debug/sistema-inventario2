// BOT-S1/S2 (ADR-0039): un solo bot con módulos activables por tenant según
// rubro. Núcleo puro: sin IO, sin Drizzle, sin reloj. La persistencia vive en
// el repo (DB primero en tenant_bot_modules; memoria vía el puerto Almacen).
import { leerVarEntorno } from "../../lib/env.js";

export const MODULOS_BOT = [
  "rotacion",
  "vencimientos",
  "flujo_caja",
  "cobranza",
  "ordenes_produccion",
  "entregas",
] as const;
export type ModuloBot = (typeof MODULOS_BOT)[number];

export const RUBROS_BOT = ["quiosco", "pyme", "fabrica", "logistica"] as const;
export type RubroBot = (typeof RUBROS_BOT)[number];

export const DEFAULTS_POR_RUBRO: Record<RubroBot, readonly ModuloBot[]> = {
  quiosco: ["rotacion", "vencimientos"],
  pyme: ["flujo_caja", "cobranza"],
  fabrica: ["ordenes_produccion"],
  logistica: ["entregas"],
};

// ADR-0039 Pendientes: fábrica y logística quedan apagadas hasta validar con
// un cliente real; el flag las prende sin cambiar código.
export const MODULOS_AVANZADOS: readonly ModuloBot[] = ["ordenes_produccion", "entregas"];
export const FLAG_RUBROS_AVANZADOS = "BOT_RUBROS_AVANZADOS";

export const MENSAJE_MODULO_APAGADO = "no disponible en tu plan/rubro";

export function rubrosAvanzadosHabilitados(env: NodeJS.ProcessEnv = process.env): boolean {
  const v = leerVarEntorno(FLAG_RUBROS_AVANZADOS, env).trim().toLowerCase();
  return v === "1" || v === "true" || v === "on";
}

export function defaultsDeRubro(rubro: RubroBot, opts: { readonly rubrosAvanzados: boolean }): ModuloBot[] {
  const base = DEFAULTS_POR_RUBRO[rubro];
  if (opts.rubrosAvanzados) return [...base];
  return base.filter((m) => !MODULOS_AVANZADOS.includes(m));
}

// El onboarding de hoy solo conoce rubros de comercio minorista. Kiosco mapea
// a quiosco; el resto cae en pyme (flujo de caja + cobranza). Los rubros del
// bot (pyme, fabrica, logistica) pasan directo si ya vienen con ese nombre.
export function resolverRubroBot(rubro: string): RubroBot {
  if ((RUBROS_BOT as readonly string[]).includes(rubro)) return rubro as RubroBot;
  return rubro === "kiosco" ? "quiosco" : "pyme";
}
