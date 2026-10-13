// Track 3 — Bot WA B7: armado y ajuste del pedido (F5 + B7.1-B7.9).
//
// Núcleo puro: sin IO, sin red, sin reloj propio (los "ahora" entran por
// parámetro). ESM con extensión .js en los imports. Dinero siempre bigint
// centavos. Todo inmutable: se devuelven valores nuevos congelados.
//
// Respeta F5: un pedido por proveedor (Borrador.proveedor único, nunca se
// mezclan proveedores en resolver_conflicto_version), cantidad sugerida
// hasta stock objetivo (sugerir_cantidad), unidad de pedido
// (unidad/caja/monto) y total estimado solo con permiso ver_costos
// (armar_resumen_borrador oculta todo "$"/"Total" si !puedeVerCostos,
// salvo el eco del monto que el propio usuario dictó).
//
// Límites Meta: 3 botones de 20 chars, listas de 10 filas (títulos 24).
// Ventana 24h (B7.9): el borrador persiste aunque se cierre la ventana;
// fuera de ella solo sale plantilla (ver decidir_modo en envio.ts).

import { truncar_titulo } from "./envio.js";

export type UnidadPedido = "unidad" | "caja" | "monto";
export type OrigenBorrador = "semanal" | "urgente";

export interface LineaPedido {
  readonly sku: string;
  readonly nombre: string;
  readonly stock: number;
  readonly unidad: UnidadPedido;
  /** Unidades si unidad==="unidad", cajas si "caja", centavos si "monto". */
  readonly cantidad: number;
  readonly unidadesPorCaja: number;
  /** Costo por unidad suelta, bigint centavos. */
  readonly costoCentavos: bigint;
}

export interface Borrador {
  /** F5: un pedido por proveedor, no hay líneas de otro proveedor acá. */
  readonly proveedor: string;
  readonly lineas: ReadonlyArray<LineaPedido>;
  /** Versión optimista: cada cambio suma 1 (B7.7). */
  readonly version: number;
  readonly origen: OrigenBorrador;
}

export const VENTANA_BORRADOR_MS = 86_400_000 as const;
export const MAX_FILAS_LISTA = 10 as const;
export const MAX_BOTONES = 3 as const;

// ---------------------------------------------------------------------------
// B7.1: cantidad sugerida hasta stock objetivo (F5)
// ---------------------------------------------------------------------------

export function sugerir_cantidad(opts: {
  stock: number;
  objetivo: number;
  unidad: UnidadPedido;
  unidadesPorCaja: number;
}): number {
  const faltante = Math.max(0, Math.floor(opts.objetivo) - Math.floor(opts.stock));
  if (opts.unidad === "unidad") return faltante;
  if (opts.unidad === "caja") {
    const upc = opts.unidadesPorCaja > 0 ? Math.floor(opts.unidadesPorCaja) : 1;
    if (faltante <= 0) return 0;
    return Math.ceil(faltante / upc);
  }
  // Por monto no hay sugerencia: el monto se carga a mano, che.
  return 0;
}

// ---------------------------------------------------------------------------
// Totales (bigint) + formato rioplatense $20.000 / $20.000,50
// ---------------------------------------------------------------------------

export function total_linea(l: LineaPedido): bigint {
  if (l.unidad === "monto") return BigInt(Math.max(0, Math.round(l.cantidad)));
  const unidades =
    l.unidad === "caja" ? Math.max(0, Math.round(l.cantidad)) * Math.max(1, Math.round(l.unidadesPorCaja)) : Math.max(0, Math.round(l.cantidad));
  return BigInt(unidades) * l.costoCentavos;
}

export function total_borrador(b: Borrador): bigint {
  let total = 0n;
  for (const l of b.lineas) {
    if (l.cantidad > 0) total += total_linea(l);
  }
  return total;
}

export function formatear_pesos(centavos: bigint): string {
  const neg = centavos < 0n;
  const abs = neg ? -centavos : centavos;
  const pesos = abs / 100n;
  const resto = abs % 100n;
  const entero = pesos.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const dec = resto === 0n ? "" : `,${resto.toString().padStart(2, "0")}`;
  return `${neg ? "-" : ""}$${entero}${dec}`;
}

// ---------------------------------------------------------------------------
// B7.1: resumen del borrador (0 excluye, total solo con permiso)
// ---------------------------------------------------------------------------

function detalle_cantidad(l: LineaPedido): string {
  if (l.unidad === "caja") {
    const cajas = Math.round(l.cantidad);
    const unidades = cajas * Math.max(1, Math.round(l.unidadesPorCaja));
    return `${cajas} ${cajas === 1 ? "caja" : "cajas"} (${unidades}u)`;
  }
  if (l.unidad === "monto") {
    return `${formatear_pesos(BigInt(Math.max(0, Math.round(l.cantidad))))} (por monto)`;
  }
  return `${Math.round(l.cantidad)}u`;
}

export function linea_a_texto(l: LineaPedido, puedeVerCostos: boolean): string {
  const base = `${l.nombre} — ${detalle_cantidad(l)} — stock ${Math.round(l.stock)}`;
  if (!puedeVerCostos) return base;
  return `${base} — ${formatear_pesos(total_linea(l))}`;
}

export function armar_resumen_borrador(
  borrador: Borrador,
  opts: { puedeVerCostos: boolean; pagina?: number | undefined; porPagina?: number | undefined },
): string {
  // Cantidad 0 no se muestra: equivale a línea sacada.
  const visibles = borrador.lineas.filter((l) => l.cantidad > 0);
  if (visibles.length === 0) {
    return `El borrador para ${borrador.proveedor} está vacío. Agregá productos para armarlo.`;
  }
  const pag = paginar_lineas(visibles, opts.pagina ?? 1, opts.porPagina ?? MAX_FILAS_LISTA);
  const cuerpo = pag.lineas.map((l) => `• ${linea_a_texto(l, opts.puedeVerCostos)}`).join("\n");
  const total =
    opts.puedeVerCostos && total_borrador(borrador) > 0n
      ? `\nTotal estimado: ${formatear_pesos(total_borrador(borrador))}`
      : "";
  const paginaTxt = pag.totalPaginas > 1 ? `\nPágina ${pag.pagina}/${pag.totalPaginas}` : "";
  return `Pedido a ${borrador.proveedor} (borrador ${borrador.origen}):\n${cuerpo}${total}${paginaTxt}\nRespondé Confirmar, Cambiar o Cancelar.`;
}

// ---------------------------------------------------------------------------
// B7.3: parseo del cambio ("4", "4 cajas", "$20.000", "0"/"sacar")
// ---------------------------------------------------------------------------

export type CambioParseado =
  | { readonly kind: "cantidad"; readonly cantidad: number; readonly unidad: UnidadPedido | null }
  | { readonly kind: "monto"; readonly montoCentavos: bigint }
  | { readonly kind: "sacar" }
  | { readonly kind: "invalido" };

const SIN_TILDES = (s: string): string => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

function parsear_monto_centavos(t: string): bigint | null {
  const conMarca = /\$|pesos?|plata|monto/.test(t) || /\d\.\d{3}/.test(t);
  if (!conMarca) return null;
  const m = t.match(/(\d[\d.]*)(?:,(\d{1,2}))?/);
  if (!m) return null;
  const pesos = BigInt((m[1] ?? "0").replace(/\./g, "") || "0");
  const cent = BigInt((m[2] ?? "0").padEnd(2, "0") || "0");
  return pesos * 100n + cent;
}

export function parsear_cambio_cantidad(texto: string): CambioParseado {
  const t = SIN_TILDES(texto).trim();
  if (!t) return { kind: "invalido" };
  // Sacar: "0", "sacar", "sacalo", "quitar", "eliminar", "borrar", "nada".
  if (/^(0+|cero|nada|ninguno|no(\s+quiero)?)$/.test(t) || /sac|quit|elimin|borr|tach|fuera/.test(t)) {
    return { kind: "sacar" };
  }
  const monto = parsear_monto_centavos(t);
  if (monto !== null) {
    if (monto <= 0n) return { kind: "sacar" };
    return { kind: "monto", montoCentavos: monto };
  }
  const mCaja = t.match(/(\d+)\s*(cajas?|cja?s?|bultos?|packs?|x\b)/);
  if (mCaja?.[1] !== undefined) {
    const n = Number.parseInt(mCaja[1], 10);
    if (!Number.isSafeInteger(n) || n < 0) return { kind: "invalido" };
    if (n === 0) return { kind: "sacar" };
    return { kind: "cantidad", cantidad: n, unidad: "caja" };
  }
  const mUnidad = t.match(/(\d+)\s*(u\.?|unidades?|uds?|sueltos?|paquetes?)/);
  if (mUnidad?.[1] !== undefined) {
    const n = Number.parseInt(mUnidad[1], 10);
    if (!Number.isSafeInteger(n) || n < 0) return { kind: "invalido" };
    if (n === 0) return { kind: "sacar" };
    return { kind: "cantidad", cantidad: n, unidad: "unidad" };
  }
  const mSolo = t.match(/(\d+)/);
  if (mSolo?.[1] !== undefined) {
    const n = Number.parseInt(mSolo[1], 10);
    if (!Number.isSafeInteger(n) || n < 0) return { kind: "invalido" };
    if (n === 0) return { kind: "sacar" };
    return { kind: "cantidad", cantidad: n, unidad: null };
  }
  return { kind: "invalido" };
}

// ---------------------------------------------------------------------------
// B7.3/B7.4: aplicar cambio a una línea (sacar elimina, 0 excluye)
// ---------------------------------------------------------------------------

export function aplicar_cambio(borrador: Borrador, sku: string, cambio: CambioParseado): Borrador {
  if (cambio.kind === "invalido") return borrador;
  const idx = borrador.lineas.findIndex((l) => l.sku === sku);
  if (idx < 0) return borrador;
  const actual = borrador.lineas[idx];
  if (!actual) return borrador;
  if (cambio.kind === "sacar") {
    return Object.freeze({
      ...borrador,
      lineas: Object.freeze(borrador.lineas.filter((l) => l.sku !== sku)),
      version: borrador.version + 1,
    });
  }
  if (cambio.kind === "monto") {
    if (cambio.montoCentavos <= 0n) {
      return Object.freeze({
        ...borrador,
        lineas: Object.freeze(borrador.lineas.filter((l) => l.sku !== sku)),
        version: borrador.version + 1,
      });
    }
    const nueva: LineaPedido = Object.freeze({
      ...actual,
      unidad: "monto",
      cantidad: Number(cambio.montoCentavos),
    });
    const lineas = borrador.lineas.map((l) => (l.sku === sku ? nueva : l));
    return Object.freeze({ ...borrador, lineas: Object.freeze(lineas), version: borrador.version + 1 });
  }
  // kind === "cantidad": 0 ya viene como "sacar" del parser, doble seguro acá.
  if (!Number.isSafeInteger(cambio.cantidad) || cambio.cantidad <= 0) {
    return Object.freeze({
      ...borrador,
      lineas: Object.freeze(borrador.lineas.filter((l) => l.sku !== sku)),
      version: borrador.version + 1,
    });
  }
  const unidad: UnidadPedido =
    cambio.unidad ?? (actual.unidad === "monto" ? "unidad" : actual.unidad);
  const nueva: LineaPedido = Object.freeze({ ...actual, unidad, cantidad: cambio.cantidad });
  const lineas = borrador.lineas.map((l) => (l.sku === sku ? nueva : l));
  return Object.freeze({ ...borrador, lineas: Object.freeze(lineas), version: borrador.version + 1 });
}

// ---------------------------------------------------------------------------
// B7.5: agregar línea (misma unidad suma, distinta unidad reemplaza)
// ---------------------------------------------------------------------------

export function agregar_linea(borrador: Borrador, linea: LineaPedido): Borrador {
  if (!linea.sku.trim() || !linea.nombre.trim()) return borrador;
  if (!Number.isSafeInteger(linea.cantidad) || linea.cantidad <= 0) return borrador;
  if (!Number.isSafeInteger(linea.unidadesPorCaja) || linea.unidadesPorCaja < 1) return borrador;
  if (linea.costoCentavos < 0n) return borrador;
  const previa = borrador.lineas.find((l) => l.sku === linea.sku);
  if (!previa) {
    return Object.freeze({
      ...borrador,
      lineas: Object.freeze([...borrador.lineas, Object.freeze({ ...linea })]),
      version: borrador.version + 1,
    });
  }
  // Por monto no se suma: última escritura gana.
  const combinada: LineaPedido =
    previa.unidad === linea.unidad && linea.unidad !== "monto"
      ? Object.freeze({ ...previa, cantidad: previa.cantidad + linea.cantidad })
      : Object.freeze({ ...linea });
  const lineas = borrador.lineas.map((l) => (l.sku === linea.sku ? combinada : l));
  return Object.freeze({ ...borrador, lineas: Object.freeze(lineas), version: borrador.version + 1 });
}

// ---------------------------------------------------------------------------
// B7.2: paginado de líneas (listas Meta: hasta 10)
// ---------------------------------------------------------------------------

export interface PaginaLineas {
  readonly lineas: ReadonlyArray<LineaPedido>;
  readonly pagina: number;
  readonly totalPaginas: number;
  readonly total: number;
}

export function paginar_lineas(
  lineas: ReadonlyArray<LineaPedido>,
  pagina = 1,
  porPagina: number = MAX_FILAS_LISTA,
): PaginaLineas {
  const pp = Math.min(MAX_FILAS_LISTA, Math.max(1, Math.floor(porPagina)));
  const totalPaginas = Math.max(1, Math.ceil(lineas.length / pp));
  const p = Math.min(totalPaginas, Math.max(1, Math.floor(pagina)));
  const inicio = (p - 1) * pp;
  return {
    lineas: Object.freeze(lineas.slice(inicio, inicio + pp)),
    pagina: p,
    totalPaginas,
    total: lineas.length,
  };
}

// ---------------------------------------------------------------------------
// B7.7: conflicto de versión — última escritura gana por línea
// ---------------------------------------------------------------------------

export function resolver_conflicto_version(actual: Borrador, entrante: Borrador): Borrador {
  // F5: un pedido por proveedor, los borradores no se mezclan.
  if (actual.proveedor !== entrante.proveedor) return actual;
  const porSku = new Map<string, LineaPedido>();
  for (const l of actual.lineas) porSku.set(l.sku, l);
  // La entrante es la última escritura: pisa línea por línea y aporta nuevas.
  for (const l of entrante.lineas) porSku.set(l.sku, l);
  return Object.freeze({
    proveedor: actual.proveedor,
    lineas: Object.freeze([...porSku.values()]),
    version: Math.max(actual.version, entrante.version) + 1,
    origen: entrante.origen,
  });
}

// ---------------------------------------------------------------------------
// B7.2: botones Confirmar/Cambiar/Cancelar (3 x 20) + filas de lista (10)
// ---------------------------------------------------------------------------

export interface OpcionBoton {
  readonly id: string;
  readonly titulo: string;
}

export function botones_borrador(): ReadonlyArray<OpcionBoton> {
  const botones: ReadonlyArray<OpcionBoton> = [
    { id: "pedido:confirmar", titulo: "Confirmar" },
    { id: "pedido:cambiar", titulo: "Cambiar" },
    { id: "pedido:cancelar", titulo: "Cancelar" },
  ];
  return botones.slice(0, MAX_BOTONES).map((b) => ({ ...b, titulo: truncar_titulo(b.titulo, 20) }));
}

export interface FilaLinea {
  readonly id: string;
  readonly titulo: string;
  readonly descripcion?: string | undefined;
}

export function filas_lineas_borrador(borrador: Borrador, pagina = 1): ReadonlyArray<FilaLinea> {
  const pag = paginar_lineas(
    borrador.lineas.filter((l) => l.cantidad > 0),
    pagina,
    MAX_FILAS_LISTA,
  );
  return Object.freeze(
    pag.lineas.map((l) => ({
      id: `linea:${l.sku}`,
      titulo: truncar_titulo(l.nombre, 24),
      descripcion: detalle_cantidad(l),
    })),
  );
}

// ---------------------------------------------------------------------------
// B7.3: steppers por unidad de pedido
// ---------------------------------------------------------------------------

export function botones_stepper(linea: LineaPedido): ReadonlyArray<OpcionBoton> {
  const base = `pedido:${linea.sku}`;
  if (linea.unidad === "caja") {
    return [
      { id: `${base}:menos`, titulo: "-1" },
      { id: `${base}:mas`, titulo: "+1" },
      { id: `${base}:otra`, titulo: "Otra" },
    ];
  }
  if (linea.unidad === "unidad") {
    return [
      { id: `${base}:menos5`, titulo: "-5" },
      { id: `${base}:mas5`, titulo: "+5" },
      { id: `${base}:otra`, titulo: "Otra" },
    ];
  }
  return [{ id: `${base}:otra`, titulo: "Otro monto" }];
}

/** Aplica un paso del stepper; llegar a 0 saca la línea. Por monto no hay paso. */
export function aplicar_paso(
  borrador: Borrador,
  sku: string,
  sentido: "menos" | "mas",
): Borrador {
  const linea = borrador.lineas.find((l) => l.sku === sku);
  if (!linea) return borrador;
  if (linea.unidad === "monto") return borrador;
  const delta = linea.unidad === "caja" ? 1 : 5;
  const nueva = linea.cantidad + (sentido === "mas" ? delta : -delta);
  if (nueva <= 0) return aplicar_cambio(borrador, sku, { kind: "sacar" });
  return aplicar_cambio(borrador, sku, { kind: "cantidad", cantidad: nueva, unidad: null });
}

// ---------------------------------------------------------------------------
// B7.4: texto libre ("poné 3 cajas de Águila", "sacá el Jorgito")
// ---------------------------------------------------------------------------

export type PedidoLibre =
  | { readonly accion: "fijar"; readonly cantidad: number; readonly unidad: UnidadPedido | null; readonly termino: string }
  | { readonly accion: "agregar"; readonly cantidad: number; readonly unidad: UnidadPedido | null; readonly termino: string }
  | { readonly accion: "fijar_monto"; readonly montoCentavos: bigint; readonly termino: string }
  | { readonly accion: "agregar_monto"; readonly montoCentavos: bigint; readonly termino: string }
  | { readonly accion: "sacar"; readonly termino: string }
  | { readonly accion: "invalido"; readonly termino: string };

const STOPWORDS = new Set([
  "de", "del", "el", "la", "los", "las", "un", "una", "por", "favor",
  "pone", "pon", "poneme", "pedi", "pido", "quiero", "trae", "traeme",
  "cambia", "cambialo", "deja", "agrega", "agregame", "suma", "sumame",
  "anadi", "inclui", "saca", "sacalo", "sacame", "quita", "quitalo",
  "elimina", "borra", "cajas", "caja", "cjas", "bulto", "bultos",
  "pack", "packs", "unidad", "unidades", "uds", "u", "suelto", "sueltos",
  "pesos", "peso", "plata", "monto", "eso", "esto", "mi", "pedido",
]);

export function parsear_pedido_libre(texto: string): PedidoLibre {
  const t = SIN_TILDES(texto).trim();
  if (!t) return { accion: "invalido", termino: "" };
  const esSacar = /sac|quit|elimin|borr|tach|fuera/.test(t);
  const esAgregar = /agreg|suma|anadi|inclui/.test(t);
  const termino = t
    .replace(/\$|\d[\d.,]*/g, " ")
    .split(/\s+/)
    .map((p) => p.trim())
    .filter((p) => p && !STOPWORDS.has(p))
    .join(" ");
  if (esSacar) return { accion: "sacar", termino };
  const cambio = parsear_cambio_cantidad(texto);
  if (cambio.kind === "sacar") return { accion: "sacar", termino };
  if (cambio.kind === "monto") {
    return esAgregar
      ? { accion: "agregar_monto", montoCentavos: cambio.montoCentavos, termino }
      : { accion: "fijar_monto", montoCentavos: cambio.montoCentavos, termino };
  }
  if (cambio.kind === "cantidad") {
    return esAgregar
      ? { accion: "agregar", cantidad: cambio.cantidad, unidad: cambio.unidad, termino }
      : { accion: "fijar", cantidad: cambio.cantidad, unidad: cambio.unidad, termino };
  }
  return { accion: "invalido", termino };
}

// ---------------------------------------------------------------------------
// B7.5: búsqueda difusa para agregar (misma forma que buscar_en_catalogo)
// ---------------------------------------------------------------------------

export interface CandidatoPedido {
  readonly sku: string;
  readonly nombre: string;
  readonly score: number;
}

export function buscar_para_agregar(
  catalogo: ReadonlyArray<{ sku: string; nombre: string; alias?: ReadonlyArray<string> | undefined }>,
  texto: string,
  limite: number = MAX_FILAS_LISTA,
): CandidatoPedido[] {
  const t = SIN_TILDES(texto).trim();
  if (!t) return [];
  const out: CandidatoPedido[] = [];
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
  return out.sort((a, b) => b.score - a.score).slice(0, Math.min(MAX_FILAS_LISTA, Math.max(1, limite)));
}

// ---------------------------------------------------------------------------
// B7.6: mismo borrador que la web — líneas listas para purchase_orders
// ---------------------------------------------------------------------------

export interface LineaCompra {
  readonly sku: string;
  readonly qty: number;
  readonly costoCentavos: bigint;
}

export function borrador_a_lineas_compra(borrador: Borrador): ReadonlyArray<LineaCompra> {
  const out: LineaCompra[] = [];
  for (const l of borrador.lineas) {
    if (l.cantidad <= 0) continue;
    if (l.unidad === "monto") {
      // El pedido por monto no tiene qty: qty 1 con el monto como costo
      // conserva el total estimado para el backend.
      out.push({ sku: l.sku, qty: 1, costoCentavos: BigInt(Math.max(0, Math.round(l.cantidad))) });
      continue;
    }
    const qty =
      l.unidad === "caja"
        ? Math.round(l.cantidad) * Math.max(1, Math.round(l.unidadesPorCaja))
        : Math.round(l.cantidad);
    if (qty < 1) continue;
    out.push({ sku: l.sku, qty, costoCentavos: l.costoCentavos });
  }
  return Object.freeze(out);
}

// ---------------------------------------------------------------------------
// B7.9: el borrador persiste aunque se cierre la ventana de 24h
// ---------------------------------------------------------------------------

export function borrador_sigue_vigente(
  actualizadoEnMs: number,
  ahoraMs: number,
  ventanaMs: number = VENTANA_BORRADOR_MS,
): boolean {
  if (ahoraMs < actualizadoEnMs) return false;
  return ahoraMs - actualizadoEnMs <= ventanaMs;
}
