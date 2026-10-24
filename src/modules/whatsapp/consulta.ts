// Núcleo puro consulta stock en texto libre (PRD Bot Flujo 2, B4-B6 slice).
// Capa 1 reglas: normalización + palabras clave. Capa 2 (LLM) queda fuera
// del slice — cuando reglas no alcanzan se pide aclaración.
// La búsqueda difusa real (pg_trgm + product_aliases) vive en el adaptador;
// acá solo intención + término + decisión directo vs desambiguar.

export type Intencion = "stock" | "precio" | "alertas" | "ninguna";

export const normalizar = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const SIN_TILDES = normalizar;

export function detectar_intencion(texto: string): Intencion {
  const t = ` ${SIN_TILDES(texto)} `;
  if (/(cuantos|cuantas|me quedan|hay|stock|queda|quedan|se esta acabando|faltante)/.test(t)) return "stock";
  if (/(precio|a cuanto|cuanto sale|cuanto cuesta|costo|margen)/.test(t)) return "precio";
  if (/(que me falta|faltan|alerta|bajo stock|acabando)/.test(t)) return "alertas";
  return "ninguna";
}

export function extraer_termino(texto: string): string {
  return SIN_TILDES(texto)
    .replace(/cuantos|cuantas|me quedan|me queda|hay|a cuanto|precio|del|de|la|el|tengo|tienen|tenes|stock|queda|quedan|consultar|buscar/gi, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export interface Candidato {
  readonly sku: string;
  readonly nombre: string;
  readonly score: number;
}

// Margen entre 1° y 2° candidato: si es chico se desambigua (Flujo 2).
// BOT2-S2: 2 a 5 candidatos van a lista numerada; más de 5 piden precisar;
// sin candidatos sobre el umbral se devuelve la sugerencia más cercana.
export const MAX_OPCIONES_DESAMBIGUAR = 5 as const;

export function decidir_respuesta(
  candidatos: ReadonlyArray<Candidato>,
  umbral = 0.3,
  margen = 0.08,
):
  | { kind: "directo"; sku: string }
  | { kind: "desambiguar"; opciones: Candidato[] }
  | { kind: "precisar"; total: number }
  | { kind: "sin_resultados"; sugerencia?: Candidato | undefined } {
  const top = [...candidatos].sort((a, b) => b.score - a.score).slice(0, 10);
  if (top.length === 0) return { kind: "sin_resultados" };
  const sobre = top.filter((c) => c.score >= umbral);
  if (sobre.length === 0) return { kind: "sin_resultados", sugerencia: top[0] };
  if (sobre.length > MAX_OPCIONES_DESAMBIGUAR) return { kind: "precisar", total: sobre.length };
  const primero = sobre[0]!;
  if (sobre.length === 1) return { kind: "directo", sku: primero.sku };
  const segundo = sobre[1]!;
  if (primero.score - segundo.score >= margen) {
    return { kind: "directo", sku: primero.sku };
  }
  return { kind: "desambiguar", opciones: sobre.slice(0, MAX_OPCIONES_DESAMBIGUAR) };
}

export function formatear_stock(opts: {
  nombre: string;
  stock: number;
  umbral: number;
  precioCentavos: bigint;
  puedeVerCosto?: false;
  comercio: string;
}): string {
  const sin = opts.stock <= 0 ? "sin stock" : `${opts.stock} u.`;
  return `${opts.nombre}: ${sin} (umbral ${opts.umbral}). Precio $${Number(opts.precioCentavos) / 100}. [${opts.comercio}]`;
}

// BOT2-S4: "detalle" es un pedido aparte del saldo. Puede ir solo (sigue al
// último producto) o junto al término ("detalle de la leche").
export function es_pedido_detalle(texto: string): boolean {
  return /\bdetalle\b/.test(` ${normalizar(texto)} `);
}

export function consulta_con_detalle(texto: string): { detalle: true; texto: string } | null {
  if (!es_pedido_detalle(texto)) return null;
  const sin = normalizar(texto).replace(/\bver\s+detalle\b/g, " ").replace(/\bdetalle\b/g, " ");
  const termino = extraer_termino(sin);
  return { detalle: true, texto: termino ? `stock ${termino}` : "" };
}

export interface LoteCrudo {
  readonly id: string;
  readonly tenantId: string;
  readonly sku: string;
  readonly venceEl: string | null;
  readonly cantidad: number;
}

function fecha_de(venceEl: string | null): string | null {
  if (!venceEl || venceEl.trim() === "") return null;
  return venceEl;
}

function fecha_visible(venceEl: string | null): string {
  const fecha = fecha_de(venceEl);
  if (!fecha) return "sin vencimiento";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(fecha);
  if (!m) return fecha;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

// BOT2-S4: FEFO es vence_el ascendente y sin fecha al final. El filtro de
// tenant y de sku vive acá para que un lote ajeno no se cuele aunque el
// lector haya mezclado filas.
export function preparar_detalle_lotes(opts: {
  tenantId: string;
  sku: string;
  lotes: ReadonlyArray<LoteCrudo>;
}): LoteCrudo[] {
  const sku = opts.sku.trim().toUpperCase();
  return opts.lotes
    .filter((l) => l.tenantId === opts.tenantId && l.sku.trim().toUpperCase() === sku && l.cantidad > 0)
    .sort((a, b) => {
      const fa = fecha_de(a.venceEl);
      const fb = fecha_de(b.venceEl);
      if (fa === fb) return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
      if (!fa) return 1;
      if (!fb) return -1;
      return fa < fb ? -1 : 1;
    });
}

// BOT2-S4: sin controla_vencimiento no hay líneas de lote. Con el flag, cada
// línea lleva fecha y cantidad restante, en el orden que devolvió preparar.
export function armarRespuestaDetalle(opts: {
  tenantId: string;
  sku: string;
  nombre: string;
  comercio: string;
  controlaVencimiento: boolean;
  lotes: ReadonlyArray<LoteCrudo>;
}): string | null {
  if (!opts.controlaVencimiento) return null;
  const lineas = preparar_detalle_lotes(opts).map((l) => `${fecha_visible(l.venceEl)} — ${l.cantidad} u.`);
  const cuerpo = lineas.length > 0 ? lineas.join("\n") : "sin lotes con stock.";
  return `${opts.nombre}: lotes por vencimiento\n${cuerpo}\n[${opts.comercio}]`;
}
