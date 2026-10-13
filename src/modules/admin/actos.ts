// LANE admin — Actos auditables PA2 (hash-chain, append-only).
//
// Núcleo puro: sin IO, sin Drizzle. Acto = quién hizo qué sobre qué tenant,
// sin dato personal del comercio. registrar_acto exige prevHash: imposible
// insertar fuera de cadena. La persistencia vive en admin-db (fase 3).

import { createHash } from "node:crypto";
import type { OrigenAdmin } from "./boundary.js";

export type ActoAdmin =
  | { readonly kind: "suspension_marcada"; readonly tenantId: string; readonly motivo: string }
  | { readonly kind: "regularizacion_asentada"; readonly tenantId: string; readonly ledgerEntryId: string }
  | { readonly kind: "cobro_asentado"; readonly tenantId: string; readonly ledgerEntryId: string }
  | { readonly kind: "flag_resuelto"; readonly tenantId: string; readonly flag: string; readonly valor: boolean }
  | { readonly kind: "mora_evaluada"; readonly tenantId: string; readonly resultado: string }
  | { readonly kind: "senal_consumida"; readonly outboxId: string; readonly tenantId: string | null }
  | { readonly kind: "senal_descartada"; readonly outboxId: string; readonly tipo: string }
  | { readonly kind: "verificacion_hash"; readonly ok: boolean; readonly filas: number; readonly primeraRota?: string };

export interface ActoRegistrado {
  readonly acto: ActoAdmin;
  readonly actorGoogleSub: string;
  readonly prevHash: string | null;
  readonly hash: string;
  readonly creadoEn: string;
  readonly origen: OrigenAdmin;
}

// JSON canónico: claves ordenadas para que el hash sea estable.
function canonico(valor: unknown): string {
  if (valor === null || typeof valor !== "object") return JSON.stringify(valor);
  if (Array.isArray(valor)) return `[${valor.map(canonico).join(",")}]`;
  const claves = Object.keys(valor as Record<string, unknown>).sort();
  return `{${claves.map((k) => `${JSON.stringify(k)}:${canonico((valor as Record<string, unknown>)[k])}`).join(",")}}`;
}

export function hash_acto(args: {
  readonly acto: ActoAdmin;
  readonly actorGoogleSub: string;
  readonly prevHash: string | null;
  readonly creadoEn: string;
}): string {
  return createHash("sha256")
    .update(`${args.prevHash ?? ""}‖${args.actorGoogleSub}‖${canonico(args.acto)}‖${args.creadoEn}`)
    .digest("hex");
}

export function registrar_acto(args: {
  readonly acto: ActoAdmin;
  readonly actorGoogleSub: string;
  readonly prevHash: string | null;
  readonly origen: OrigenAdmin;
  readonly ahora?: Date;
}): ActoRegistrado {
  if (!args.actorGoogleSub) throw new Error("acto sin actor");
  const creadoEn = (args.ahora ?? new Date()).toISOString();
  return {
    acto: args.acto,
    actorGoogleSub: args.actorGoogleSub,
    prevHash: args.prevHash,
    hash: hash_acto({ acto: args.acto, actorGoogleSub: args.actorGoogleSub, prevHash: args.prevHash, creadoEn }),
    creadoEn,
    origen: args.origen,
  };
}

// Job verificar-hash: recalcula y compara. No auto-repara; si rompe, el panel
// muestra banner rojo y congela POST mutantes hasta revisión (PA2).
export function verificar_acto(
  registrado: ActoRegistrado,
): { readonly ok: true } | { readonly ok: false; readonly error: string } {
  const esperado = hash_acto({
    acto: registrado.acto,
    actorGoogleSub: registrado.actorGoogleSub,
    prevHash: registrado.prevHash,
    creadoEn: registrado.creadoEn,
  });
  if (esperado !== registrado.hash) return { ok: false, error: `cadena rota en acto ${registrado.hash.slice(0, 8)}` };
  return { ok: true };
}
