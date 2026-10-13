// Núcleo puro consulta stock en texto libre (PRD Bot Flujo 2, B4-B6 slice).
// Capa 1 reglas: normalización + palabras clave. Capa 2 (LLM) queda fuera
// del slice — cuando reglas no alcanzan se pide aclaración.
// La búsqueda difusa real (pg_trgm + product_aliases) vive en el adaptador;
// acá solo intención + término + decisión directo vs desambiguar.

export type Intencion = "stock" | "precio" | "alertas" | "ninguna";

const SIN_TILDES = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

export function detectar_intencion(texto: string): Intencion {
  const t = ` ${SIN_TILDES(texto)} `;
  if (/(cuantos|cuantas|me quedan|hay|stock|queda|quedan|se esta acabando|faltante)/.test(t)) return "stock";
  if (/(precio|a cuanto|cuanto sale|cuanto cuesta|costo|margen)/.test(t)) return "precio";
  if (/(que me falta|faltan|alerta|bajo stock|acabando)/.test(t)) return "alertas";
  return "ninguna";
}

export function extraer_termino(texto: string): string {
  return SIN_TILDES(texto)
    .replace(/cuantos|cuantas|me quedan|me queda|hay|a cuanto|precio|del|de|la|el|tengo|tienen|queda|quedan|hay|consultar|buscar/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export interface Candidato {
  readonly sku: string;
  readonly nombre: string;
  readonly score: number;
}

// Margen entre 1° y 2° candidato: si es chico se desambigua (Flujo 2).
export function decidir_respuesta(candidatos: ReadonlyArray<Candidato>, umbral = 0.3, margen = 0.08): { kind: "directo"; sku: string } | { kind: "desambiguar"; opciones: Candidato[] } | { kind: "sin_resultados" } {
  const top = [...candidatos].sort((a, b) => b.score - a.score).slice(0, 10);
  if (top.length === 0) return { kind: "sin_resultados" };
  const primero = top[0]!;
  if (primero.score < umbral) return { kind: "sin_resultados" };
  const segundo = top[1];
  if (top.length === 1 || !segundo || primero.score - segundo.score >= margen) {
    return { kind: "directo", sku: primero.sku };
  }
  return { kind: "desambiguar", opciones: top };
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
