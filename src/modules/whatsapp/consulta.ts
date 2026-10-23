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
