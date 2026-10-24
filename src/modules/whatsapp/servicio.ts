import {
  detectar_intencion,
  formatear_stock,
  type Candidato,
} from "./consulta.js";
import type { ResolucionNombre, FichaProducto } from "../../lib/repos/busqueda-nombre.js";
import type { Resolucion } from "./resolucion.js";

// Capa servicio slice C (PRD Bot 6.2/B1.7, Flujo 2/9): contexto interno de
// corta duración + autorización + atención de consulta en vivo. Núcleo puro:
// el adaptador (ruta) arma snapshots desde control/store/Drizzle y el
// servicio nunca toca IO ni credenciales de base.

// PRD 6.2: el bot actúa en nombre del usuario vinculado con un contexto de
// corta duración (user_id, tenant_id, rol). Nunca recibe credenciales.
export const CONTEXTO_TTL_MS = 60000 as const;

export interface ContextoBot {
  readonly userId: string;
  readonly tenantId: string;
  readonly rol: "dueno" | "empleado";
  readonly expiraEnMs: number;
  readonly soloLectura: boolean;
}

export type Operacion = "consultar_stock" | "ver_costos" | "pedir" | "ver_alertas";

export type Autorizacion =
  | { readonly ok: true }
  | { readonly ok: false; readonly motivo: "sin_permiso" | "solo_lectura" | "no_resuelto" };

export function emitir_contexto(
  r: Extract<Resolucion, { ok: true }>,
  ahoraMs: number,
  ttlMs: number = CONTEXTO_TTL_MS,
): ContextoBot {
  return { userId: r.googleSub, tenantId: r.tenantId, rol: r.rol, expiraEnMs: ahoraMs + ttlMs, soloLectura: r.soloLectura };
}

// B1.7: el backend aplica permisos en cada operación; el bot solo oculta
// opciones. consultar/ver_alertas siempre; ver_costos dueño o permiso
// `ver_costos`; pedir dueño y comercio no suspendido (B1.10).
export function autorizar_operacion(
  ctx: ContextoBot | null,
  op: Operacion,
  permisos: ReadonlyArray<string> = [],
  ahoraMs: number = 0,
): Autorizacion {
  if (!ctx) return { ok: false, motivo: "no_resuelto" };
  if (ahoraMs > ctx.expiraEnMs) return { ok: false, motivo: "no_resuelto" };
  if (op === "consultar_stock" || op === "ver_alertas") return { ok: true };
  if (op === "ver_costos") {
    if (ctx.rol === "dueno" || permisos.includes("ver_costos")) return { ok: true };
    return { ok: false, motivo: "sin_permiso" };
  }
  if (ctx.soloLectura) return { ok: false, motivo: "solo_lectura" };
  if (ctx.rol !== "dueno") return { ok: false, motivo: "sin_permiso" };
  return { ok: true };
}

export interface ItemVivo {
  readonly sku: string;
  readonly nombre: string;
  readonly stock: number;
  readonly umbral: number;
  readonly precioCentavos: bigint;
  readonly costoCentavos?: bigint | undefined;
  readonly proveedor?: string | null | undefined;
  readonly alias?: ReadonlyArray<string> | undefined;
  // ALR-S1: cantidad a reponer (products.reorder_qty); ausente = sin valor.
  readonly reorderQty?: number | null | undefined;
}

export type Atencion =
  | { readonly kind: "respuesta"; readonly texto: string }
  | { readonly kind: "desambiguar"; readonly opciones: Candidato[]; readonly texto: string };

// BOT2-S2: la respuesta a "2" elige el segundo de la última lista numerada.
export function resolver_seleccion(texto: string, opciones: ReadonlyArray<string>): string | null {
  if (!/^\d+$/.test(texto.trim())) return null;
  const n = Number(texto.trim());
  if (n < 1 || n > Math.min(opciones.length, 5)) return null;
  return opciones[n - 1] ?? null;
}

export function redactarFicha(opts: {
  ctx: ContextoBot;
  ficha: FichaProducto;
  comercio: string;
  permisos?: ReadonlyArray<string> | undefined;
}): string {
  const veCosto = autorizar_operacion(opts.ctx, "ver_costos", opts.permisos ?? []).ok && opts.ficha.costoCentavos != null;
  const base = formatear_stock({
    nombre: opts.ficha.nombre,
    stock: opts.ficha.stock,
    umbral: opts.ficha.umbral,
    precioCentavos: opts.ficha.precioCentavos,
    comercio: opts.comercio,
  });
  const extra = [
    opts.ficha.proveedor ? ` Proveedor: ${opts.ficha.proveedor}.` : "",
    veCosto ? ` Costo $${Number(opts.ficha.costoCentavos) / 100}.` : "",
  ].join("");
  return `${base}${extra}`;
}

export function redactarConsulta(opts: {
  ctx: ContextoBot;
  resolucion: ResolucionNombre;
  termino: string;
  comercio: string;
  permisos?: ReadonlyArray<string> | undefined;
}): Atencion {
  const { resolucion, termino, comercio } = opts;
  if (resolucion.kind === "sin_resultados") {
    const pista = resolucion.sugerencia ? ` ¿Quisiste decir "${resolucion.sugerencia.nombre}"?` : "";
    return { kind: "respuesta", texto: `No encontré "${termino}" en ${comercio}.${pista}` };
  }
  if (resolucion.kind === "precisar") {
    return {
      kind: "respuesta",
      texto: `Encontré ${resolucion.total} productos para "${termino}" en ${comercio}. Precisá un poco más (marca o tamaño).`,
    };
  }
  if (resolucion.kind === "desambiguar") {
    const lineas = resolucion.opciones.map((o, i) => `${i + 1}) ${o.nombre} — ${o.stock} u.`);
    return {
      kind: "desambiguar",
      opciones: resolucion.opciones.map((o) => ({ sku: o.sku, nombre: o.nombre, score: 0 })),
      texto: `Encontré ${resolucion.opciones.length} productos. ¿Cuál querés ver?\n${lineas.join("\n")}\nRespondé con el número (1-${resolucion.opciones.length}).\n[${comercio}]`,
    };
  }
  return { kind: "respuesta", texto: redactarFicha({ ctx: opts.ctx, ficha: resolucion.ficha, comercio, permisos: opts.permisos }) };
}

export function atender_alertas(catalogo: ReadonlyArray<ItemVivo>, comercio: string): Atencion {
  const bajas = catalogo.filter((i) => i.stock <= i.umbral).slice(0, 10);
  if (bajas.length === 0) return { kind: "respuesta", texto: `Sin alertas en ${comercio}.` };
  const lineas = bajas.map((i) => `${i.nombre} — ${i.stock} u. (umbral ${i.umbral})`);
  return { kind: "respuesta", texto: `Stock bajo en ${comercio}:\n${lineas.join("\n")}` };
}
