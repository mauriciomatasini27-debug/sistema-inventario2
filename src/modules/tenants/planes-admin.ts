import { LIMITE_USUARIOS_POR_PLAN } from "./invitaciones.js";

// Los planes que administra el panel (alta y cambio) son demo/base/plus.
// El catálogo de producto usa basico/plus/pro: demo y base equivalen a básico.
export const PLANES_ADMIN = ["demo", "base", "plus"] as const;
export type PlanAdmin = (typeof PLANES_ADMIN)[number];

export function esPlanAdmin(valor: string): valor is PlanAdmin {
  return (PLANES_ADMIN as readonly string[]).includes(valor);
}

export function limiteUsuariosDe(plan: string): number {
  return LIMITE_USUARIOS_POR_PLAN[plan] ?? 2;
}

export function catalogoPlanesAdmin(): ReadonlyArray<{ id: PlanAdmin; limite: number }> {
  return PLANES_ADMIN.map((id) => ({ id, limite: limiteUsuariosDe(id) }));
}

export function planCatalogoDe(plan: PlanAdmin): "basico" | "plus" {
  return plan === "plus" ? "plus" : "basico";
}
