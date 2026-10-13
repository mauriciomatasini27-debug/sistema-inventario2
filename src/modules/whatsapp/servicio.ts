import {
  decidir_respuesta,
  detectar_intencion,
  extraer_termino,
  formatear_stock,
  type Candidato,
  type Intencion,
} from "./consulta.js";
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
}

const SIN_TILDES = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

// Búsqueda en memoria con la misma forma que la futura `buscar_pg_trgm`
// (pg_trgm + unaccent + product_aliases, documentada y fuera del slice).
export function buscar_en_catalogo(catalogo: ReadonlyArray<ItemVivo>, termino: string, limite = 10): Candidato[] {
  const t = SIN_TILDES(termino).trim();
  if (!t) return [];
  const out: Candidato[] = [];
  for (const item of catalogo) {
    const nombre = SIN_TILDES(item.nombre);
    let score = 0;
    if (nombre === t) score = 1;
    else if (nombre.startsWith(t)) score = 0.9;
    else if (nombre.includes(t)) score = 0.7;
    else {
      const porPalabra = nombre.split(/\s+/).some((p) => p.startsWith(t));
      if (porPalabra) score = 0.6;
    }
    if (score === 0 && item.alias) {
      const hit = item.alias.some((a) => {
        const n = SIN_TILDES(a);
        return n === t || n.includes(t) || t.includes(n);
      });
      if (hit) score = 0.85;
    }
    if (score > 0) out.push({ sku: item.sku, nombre: item.nombre, score });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, limite);
}

export type Atencion =
  | { readonly kind: "respuesta"; readonly texto: string }
  | { readonly kind: "desambiguar"; readonly opciones: Candidato[]; readonly texto: string };

export function atender_consulta(opts: {
  ctx: ContextoBot;
  texto: string;
  catalogo: ReadonlyArray<ItemVivo>;
  comercio: string;
  permisos?: ReadonlyArray<string> | undefined;
}): Atencion {
  const intencion: Intencion = detectar_intencion(opts.texto);
  if (intencion === "alertas") return atender_alertas(opts.catalogo, opts.comercio);
  if (intencion !== "stock" && intencion !== "precio") {
    return { kind: "respuesta", texto: `Puedo consultar stock y precios de ${opts.comercio}. Probá "cuántos Milka tengo".` };
  }
  const termino = extraer_termino(opts.texto);
  const candidatos = buscar_en_catalogo(opts.catalogo, termino);
  const d = decidir_respuesta(candidatos);
  if (d.kind === "sin_resultados") {
    return { kind: "respuesta", texto: `No encontré "${termino}" en ${opts.comercio}.` };
  }
  if (d.kind === "desambiguar") {
    const lineas = d.opciones.map((o) => {
      const item = opts.catalogo.find((i) => i.sku === o.sku);
      const stock = item ? ` — ${item.stock} u.` : "";
      return `${o.nombre}${stock}`;
    });
    return {
      kind: "desambiguar",
      opciones: d.opciones,
      texto: `Encontré ${d.opciones.length} productos. ¿Cuál querés ver?\n${lineas.join("\n")}\n[${opts.comercio}]`,
    };
  }
  const item = opts.catalogo.find((i) => i.sku === d.sku);
  if (!item) return { kind: "respuesta", texto: `No encontré "${termino}" en ${opts.comercio}.` };
  const veCosto = autorizar_operacion(opts.ctx, "ver_costos", opts.permisos).ok && item.costoCentavos != null;
  const base = formatear_stock({
    nombre: item.nombre,
    stock: item.stock,
    umbral: item.umbral,
    precioCentavos: item.precioCentavos,
    comercio: opts.comercio,
  });
  const extra = [
    item.proveedor ? ` Proveedor: ${item.proveedor}.` : "",
    veCosto ? ` Costo $${Number(item.costoCentavos) / 100}.` : "",
  ].join("");
  return { kind: "respuesta", texto: `${base}${extra}` };
}

function atender_alertas(catalogo: ReadonlyArray<ItemVivo>, comercio: string): Atencion {
  const bajas = catalogo.filter((i) => i.stock <= i.umbral).slice(0, 10);
  if (bajas.length === 0) return { kind: "respuesta", texto: `Sin alertas en ${comercio}.` };
  const lineas = bajas.map((i) => `${i.nombre} — ${i.stock} u. (umbral ${i.umbral})`);
  return { kind: "respuesta", texto: `Stock bajo en ${comercio}:\n${lineas.join("\n")}` };
}
