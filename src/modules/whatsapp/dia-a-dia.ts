// NÃºcleo puro Track4 B10 (P0): el dÃ­a a dÃ­a por el Bot WA.
// Sin IO, sin red, sin reloj propio (ahoraMs entra por parÃ¡metro).
// Dinero siempre bigint centavos, montos con el mismo formato que la web.
// Links web contra anclas verificadas de panel.astro (#proveedores,
// #movimientos).
//
// B10.1 "quÃ© pedÃ­": borradores/programados/enviados de los Ãºltimos 14 dÃ­as.
// B10.2 "Ãºltimos movimientos de X": Ãºltimos 5 con link a la web.

import type { TipoMovimiento } from "../inventario/inventario.js";
import { formatear_monto } from "./envio-proveedor.js";

export type EstadoPedido = "borrador" | "programado" | "enviado";

export interface PedidoDia {
  readonly id: string;
  readonly proveedor: string;
  readonly estado: EstadoPedido;
  readonly creadoEnMs: number;
  readonly totalCentavos: bigint;
}

export interface MovimientoVista {
  readonly idemKey: string;
  readonly sku: string;
  readonly nombre?: string | undefined;
  readonly delta: number;
  readonly tipo: TipoMovimiento;
  readonly fechaMs: number;
}

export const VENTANA_PEDIDOS_MS = 14 * 24 * 60 * 60 * 1000;
export const LIMITE_MOVIMIENTOS = 5 as const;

/** Anclas verificadas en panel.astro. */
export const PEDIDOS_WEB_URL = "/panel#proveedores" as const;
export const MOVIMIENTOS_WEB_URL = "/panel#movimientos" as const;

const SIN_TILDES = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

function fecha_corta(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

// B10.1: lista borradores/programados/enviados de los Ãºltimos 14 dÃ­as,
// opcionalmente filtrados por proveedor ("quÃ© le pedÃ­ a X").
export function listar_pedidos_14d(
  pedidos: ReadonlyArray<PedidoDia>,
  ahoraMs: number,
  proveedorFiltro?: string | undefined,
): { readonly texto: string; readonly cantidad: number } {
  const corte = ahoraMs - VENTANA_PEDIDOS_MS;
  const filtro = SIN_TILDES(proveedorFiltro ?? "").trim();
  const dentro = pedidos
    .filter((p) => p.creadoEnMs >= corte && p.creadoEnMs <= ahoraMs)
    .filter((p) => !filtro || SIN_TILDES(p.proveedor).includes(filtro))
    .sort((a, b) => b.creadoEnMs - a.creadoEnMs);
  if (dentro.length === 0) {
    return { texto: "No tenÃ©s pedidos en los Ãºltimos 14 dÃ­as.", cantidad: 0 };
  }
  const lineas = dentro.map(
    (p) => `â€¢ ${p.proveedor} â€” ${p.estado} â€” ${formatear_monto(p.totalCentavos)} (${fecha_corta(p.creadoEnMs)})`,
  );
  return {
    texto: `Tus pedidos (Ãºltimos 14 dÃ­as):\n${lineas.join("\n")}\nVer mÃ¡s: ${PEDIDOS_WEB_URL}`,
    cantidad: dentro.length,
  };
}

// B10.2: Ãºltimos 5 movimientos, opcionalmente de un producto ("Ãºltimos
// movimientos de X"). Siempre con link a la web.
export function ultimos_movimientos(
  movs: ReadonlyArray<MovimientoVista>,
  filtro?: string | undefined,
  limite: number = LIMITE_MOVIMIENTOS,
): { readonly texto: string; readonly cantidad: number } {
  const f = SIN_TILDES(filtro ?? "").trim();
  const elegidos = movs
    .filter((m) => {
      if (!f) return true;
      return SIN_TILDES(m.sku).includes(f) || SIN_TILDES(m.nombre ?? "").includes(f);
    })
    .sort((a, b) => b.fechaMs - a.fechaMs)
    .slice(0, limite);
  if (elegidos.length === 0) {
    return { texto: f ? `No hay movimientos para "${(filtro ?? "").trim()}".` : "TodavÃ­a no hay movimientos.", cantidad: 0 };
  }
  const lineas = elegidos.map((m) => {
    const nombre = m.nombre ?? m.sku;
    const signo = m.delta > 0 ? "+" : "";
    return `â€¢ ${nombre} (${signo}${m.delta} u.) â€” ${m.tipo} â€” ${fecha_corta(m.fechaMs)}`;
  });
  return {
    texto: `Ãšltimos movimientos${f ? ` de "${(filtro ?? "").trim()}"` : ""}:\n${lineas.join("\n")}\nVer mÃ¡s: ${MOVIMIENTOS_WEB_URL}`,
    cantidad: elegidos.length,
  };
}

export type IntencionDia =
  | { readonly kind: "que_pedi"; readonly proveedor: string | null }
  | { readonly kind: "movimientos"; readonly termino: string }
  | { readonly kind: "nada" };

// Entiende "quÃ© pedÃ­", "quÃ© le pedÃ­ a X" y "Ãºltimos movimientos de X".
// Rioplatense, sin tildes, sin LLM: lo que no matchea es "nada".
export function parsear_dia_a_dia(texto: string): IntencionDia {
  const n = SIN_TILDES(texto).replace(/\s+/g, " ").trim();
  const mPedi = n.match(/que\s+(le\s+)?pedi\w*\s*(a\s+(.+))?/);
  if (mPedi) {
    const prov = (mPedi[3] ?? "").trim();
    return { kind: "que_pedi", proveedor: prov ? prov : null };
  }
  const mMov = n.match(/movimientos?\s*(de\s+(.+))?/);
  if (mMov) {
    return { kind: "movimientos", termino: (mMov[2] ?? "").trim() };
  }
  return { kind: "nada" };
}
