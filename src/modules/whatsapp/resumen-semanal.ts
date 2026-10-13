// Núcleo puro B9: resumen viernes WA + programar lunes. Sin IO.
// Reutiliza calcular_semanal de email/resumen-semanal.ts (B9.2 sale en
// paralelo por email con la misma base, cada canal con su idempotencia).
// Dinero siempre bigint. Rioplatense, sin emojis.

import { formatear_pesos } from "../email/plantilla-cierre.js";
import type { CalculoSemanal } from "../email/resumen-semanal.js";

export const PLANTILLA_RESUMEN_SEMANAL = "resumen_semanal" as const;

export interface ConfigSemanal {
  readonly diaEnvio: number;
  readonly horaEnvio: string;
  readonly zona: string;
  readonly horaLunes: string;
}

export const CONFIG_SEMANAL_DEFECTO: ConfigSemanal = {
  diaEnvio: 5,
  horaEnvio: "18:00",
  zona: "America/Argentina/Buenos_Aires",
  horaLunes: "10:00",
};

export interface BotonWa {
  readonly id: string;
  readonly titulo: string;
}

export interface ResumenSemanalWa {
  readonly plantilla: typeof PLANTILLA_RESUMEN_SEMANAL;
  readonly texto: string;
  readonly botones: ReadonlyArray<BotonWa>;
  readonly idempotencyKey: string;
}

export function clave_semanal_wa(tenantId: string, semanaISO: string): string {
  return `resumen_semanal:wa:${tenantId}:${semanaISO}`;
}

// B9.1 + B9.7: texto corto para plantilla WA. Sin ventas igual sale con
// aclaración (B9.7). Top 5 para no pasar el límite Meta (1024 cuerpo).
export function armar_resumen_semanal_wa(args: {
  tenantId: string;
  nombreComercio: string;
  semanaISO: string;
  calculo: CalculoSemanal;
}): ResumenSemanalWa {
  const c = args.calculo;
  const top = c.top10.slice(0, 5);
  const topTxt =
    top.length > 0 ? top.map((v) => `${v.nombre} x${v.unidades}`).join(", ") : "sin top";
  const lineaVentas =
    c.unidades > 0
      ? `Vendiste ${c.unidades} u. por ${formatear_pesos(c.ventasCentavos)}. Top: ${topTxt}.`
      : `Esta semana no hay ventas registradas. Igual te dejo el estado para que no te quedes sin stock.`;
  const lineaFaltantes = `Faltantes: ${c.faltantes} (${c.sinStock} sin stock).`;
  const prov =
    c.pedidoPorProveedor.length > 0
      ? `Pedido viernes: ${c.pedidoPorProveedor.map((p) => `${p.proveedor} ${p.unidades} u.`).join(" · ")}`
      : `Pedido viernes: sin sugerencias.`;
  const texto =
    `${args.nombreComercio} · semana ${args.semanaISO}\n${lineaVentas}\n${lineaFaltantes}\n${prov}`;
  return {
    plantilla: PLANTILLA_RESUMEN_SEMANAL,
    texto,
    botones: [
      { id: "ver_pedido", titulo: "Ver pedido" },
      { id: "programar_lunes", titulo: "Programar lunes" },
      { id: "resumen_completo", titulo: "Resumen completo" },
    ],
    idempotencyKey: clave_semanal_wa(args.tenantId, args.semanaISO),
  };
}

// B9.3: Ver pedido sugerido abre borradores (el adaptador resuelve la URL
// con los borradores ya armados por proveedor desde calcular_semanal).
export function url_pedido_sugerido(baseWeb: string, tenantId: string, semanaISO: string): string {
  return `${baseWeb}/pedidos?tenant=${encodeURIComponent(tenantId)}&semana=${encodeURIComponent(semanaISO)}`;
}

// --- B9.4 Programar lunes con recálculo vivo ---

export interface SnapshotLunes {
  readonly tenantId: string;
  readonly semanaISO: string;
  readonly lunesFecha: string;
  readonly unidades: number;
  readonly ventasCentavos: string;
  readonly faltantes: number;
  readonly hash: string;
  readonly programadoEnMs: number;
}

export function hash_calculo(c: CalculoSemanal): string {
  const base = [
    c.unidades,
    c.ventasCentavos.toString(),
    c.faltantes,
    c.sinStock,
    c.top10.map((v) => `${v.sku}:${v.unidades}`).join(","),
    c.pedidoPorProveedor.map((p) => `${p.proveedor}:${p.unidades}`).join(","),
  ].join("|");
  let h = 5381;
  for (let i = 0; i < base.length; i++) h = ((h << 5) + h + base.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

export type TiendaLunes = Map<string, SnapshotLunes>;

function clave_lunes(tenantId: string, semanaISO: string): string {
  return `lunes:${tenantId}:${semanaISO}`;
}

export function programar_lunes(
  tienda: TiendaLunes,
  args: { tenantId: string; semanaISO: string; lunesFecha: string; calculo: CalculoSemanal; ahoraMs: number },
): { status: 201; snapshot: SnapshotLunes } | { status: 409; snapshot: SnapshotLunes } {
  const key = clave_lunes(args.tenantId, args.semanaISO);
  const previo = tienda.get(key);
  if (previo) return { status: 409, snapshot: previo };
  const snapshot: SnapshotLunes = {
    tenantId: args.tenantId,
    semanaISO: args.semanaISO,
    lunesFecha: args.lunesFecha,
    unidades: args.calculo.unidades,
    ventasCentavos: args.calculo.ventasCentavos.toString(),
    faltantes: args.calculo.faltantes,
    hash: hash_calculo(args.calculo),
    programadoEnMs: args.ahoraMs,
  };
  tienda.set(key, snapshot);
  return { status: 201, snapshot };
}

// Recálculo vivo del lunes: si el cálculo actual difiere del snapshot
// programado, el bot pide reconfirmar en vez de mandar directo.
export type RecalculoLunes =
  | { readonly igual: true; readonly snapshot: SnapshotLunes }
  | { readonly igual: false; readonly snapshot: SnapshotLunes; readonly textoReconfirmar: string };

export function recalcular_lunes(
  tienda: TiendaLunes,
  args: { tenantId: string; semanaISO: string; calculoActual: CalculoSemanal },
): RecalculoLunes | null {
  const snap = tienda.get(clave_lunes(args.tenantId, args.semanaISO));
  if (!snap) return null;
  if (hash_calculo(args.calculoActual) === snap.hash) return { igual: true, snapshot: snap };
  const c = args.calculoActual;
  const textoReconfirmar =
    `El pedido del lunes cambió desde el viernes ` +
    `(${snap.unidades} u. → ${c.unidades} u., faltantes ${snap.faltantes} → ${c.faltantes}). ` +
    `¿Lo mandamos igual? Respondé SI para confirmar o NO para ver el nuevo pedido.`;
  return { igual: false, snapshot: snap, textoReconfirmar };
}

// B9.5: recordatorio lunes 10h (hora configurable).
export function recordatorio_lunes(args: {
  nombreComercio: string;
  lunesFecha: string;
  snapshot: SnapshotLunes;
}): string {
  return (
    `${args.nombreComercio}: hoy ${args.lunesFecha} tenés el pedido del lunes programado ` +
    `(${args.snapshot.unidades} u., ${args.snapshot.faltantes} faltantes). ` +
    `Respondé SI para mandarlo o VER para revisar borradores.`
  );
}

// B9.7: día/hora configurables. Compara en la zona del comercio.
export function es_momento_envio(ahora: Date, config: ConfigSemanal): boolean {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: config.zona,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const partes = fmt.formatToParts(ahora);
  const dia = partes.find((p) => p.type === "weekday")?.value ?? "";
  const hora = partes.find((p) => p.type === "hour")?.value ?? "";
  const minuto = partes.find((p) => p.type === "minute")?.value ?? "";
  const dias: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const num = dias[dia] ?? -1;
  return num === config.diaEnvio && `${hora}:${minuto}` === config.horaEnvio;
}
