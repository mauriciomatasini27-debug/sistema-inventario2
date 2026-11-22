import type { StoredMovement } from "../../lib/store.js";
import { es_fecha_jornada_valida, fecha_jornada_ar } from "./cierre.js";

export type TipoMovHistorial = "ingreso" | "egreso";

export interface FiltroHistorial {
  readonly tipo?: TipoMovHistorial | undefined;
  readonly medio?: string | undefined;
  readonly origen?: string | undefined;
  readonly desde?: string | undefined;
  readonly hasta?: string | undefined;
}

export interface ParamsHistorial extends FiltroHistorial {
  readonly limit: number;
  readonly cursor: number;
}

export const TIPOS_HISTORIAL: ReadonlyArray<string> = ["ingreso", "egreso"];
export const MEDIOS_HISTORIAL: ReadonlyArray<string> = [
  "Efectivo",
  "Debito",
  "Mercado Pago",
  "QR",
  "Transferencia",
];
export const ORIGENES_HISTORIAL: ReadonlyArray<string> = [
  "venta",
  "retiro",
  "sueldo",
  "devolucion",
  "cobro_fiado",
];

export function parsear_params(sp: URLSearchParams): { ok: true; params: ParamsHistorial } | { ok: false; error: string } {
  const tipo = sp.get("tipo");
  const medio = sp.get("medio");
  const origen = sp.get("origen");
  const desde = sp.get("desde");
  const hasta = sp.get("hasta");
  if (tipo !== null && !TIPOS_HISTORIAL.includes(tipo)) return { ok: false, error: "tipo inválido (ingreso|egreso)" };
  if (medio !== null && !MEDIOS_HISTORIAL.includes(medio)) return { ok: false, error: "medio inválido" };
  if (origen !== null && !ORIGENES_HISTORIAL.includes(origen)) return { ok: false, error: "origen inválido" };
  if (desde !== null && !es_fecha_jornada_valida(desde)) return { ok: false, error: "desde inválida (AAAA-MM-DD)" };
  if (hasta !== null && !es_fecha_jornada_valida(hasta)) return { ok: false, error: "hasta inválida (AAAA-MM-DD)" };
  const limit = Number(sp.get("limit") ?? "50");
  const cursor = Number(sp.get("cursor") ?? "0");
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) return { ok: false, error: "limit 1-200" };
  if (!Number.isInteger(cursor) || cursor < 0) return { ok: false, error: "cursor >= 0" };
  return {
    ok: true,
    params: {
      ...(tipo !== null ? { tipo: tipo as TipoMovHistorial } : {}),
      ...(medio !== null ? { medio } : {}),
      ...(origen !== null ? { origen } : {}),
      ...(desde !== null ? { desde } : {}),
      ...(hasta !== null ? { hasta } : {}),
      limit,
      cursor,
    },
  };
}

export function filtrar_historial(
  movs: ReadonlyArray<StoredMovement>,
  f: FiltroHistorial,
): StoredMovement[] {
  const out: StoredMovement[] = [];
  for (let i = movs.length - 1; i >= 0; i--) {
    const m = movs[i];
    if (m === undefined) continue;
    if (f.tipo !== undefined && m.tipo !== f.tipo) continue;
    if (f.medio !== undefined && m.metodo !== f.medio) continue;
    if (f.origen !== undefined && m.origen !== f.origen) continue;
    if (f.desde !== undefined || f.hasta !== undefined) {
      if (m.ocurrido_en === undefined) continue;
      const fecha = new Date(m.ocurrido_en);
      if (Number.isNaN(fecha.getTime())) continue;
      const jornada = fecha_jornada_ar(fecha);
      if (f.desde !== undefined && jornada < f.desde) continue;
      if (f.hasta !== undefined && jornada > f.hasta) continue;
    }
    out.push(m);
  }
  return out;
}

export function paginar<T>(items: ReadonlyArray<T>, cursor: number, limit: number): { pagina: T[]; nextCursor: number | null } {
  const pagina = items.slice(cursor, cursor + limit);
  return { pagina, nextCursor: cursor + limit < items.length ? cursor + limit : null };
}

function celda(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export const CSV_HEADER = "id,tipo,metodo,monto_centavos,origen,sale_id,idempotency_key";

export function historial_a_csv(movs: ReadonlyArray<StoredMovement>): string {
  const filas = movs.map((m) =>
    [m.id, m.tipo, m.metodo, m.monto_centavos, m.origen, m.sale_id ?? "", m.idempotency_key]
      .map(celda)
      .join(","),
  );
  return `${CSV_HEADER}\n${filas.length > 0 ? `${filas.join("\n")}\n` : ""}`;
}
