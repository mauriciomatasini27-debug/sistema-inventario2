// Búsqueda difusa del catálogo (CAT-S1, PRD-CAT-01). Núcleo puro: sin IO,
// sin Drizzle, sin store. El repo (`src/lib/repos/catalogo.ts`) la usa para
// filtrar por sku/nombre; el cliente muestra iniciales + fotoUrl del listado.

// Por qué NFD: "Café" y "CAFE" deben ser la misma búsqueda en el mostrador.
export function normalizarBusqueda(s: string): string {
  return s
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function palabrasDe(campos: readonly string[]): string[] {
  const out: string[] = [];
  for (const c of campos) {
    for (const w of normalizarBusqueda(c).split(/[\s\-_]+/)) {
      if (w) out.push(w);
    }
  }
  return out;
}

// Por qué corte en distancia 1: un solo typo de tipeo rápido; con 2 el
// mostrador devuelve vecinos que el vendedor no pidió.
function distanciaLevenshtein(a: string, b: string): number {
  const prev: number[] = [];
  for (let j = 0; j <= b.length; j++) prev.push(j);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0] ?? 0;
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j] ?? 0;
      const costo = a[i - 1] === b[j - 1] ? 0 : 1;
      prev[j] = Math.min((prev[j] ?? 0) + 1, (prev[j - 1] ?? 0) + 1, diag + costo);
      diag = tmp;
    }
  }
  return prev[b.length] ?? 0;
}

function coincideToken(palabras: readonly string[], token: string): boolean {
  for (const w of palabras) {
    if (w.includes(token)) return true;
    // Por qué solo tokens largos: con 1-3 letras la distancia 1 iguala
    // casi todo el catálogo y el filtro deja de filtrar.
    if (token.length >= 4) {
      if (distanciaLevenshtein(token, w) <= 1) return true;
      if (distanciaLevenshtein(token, w.slice(0, token.length)) <= 1) return true;
    }
  }
  return false;
}

// Por qué AND de tokens: "mate yerba" pide ambas palabras, en cualquier orden.
export function coincideDifuso(campos: readonly string[], q: string): boolean {
  const norm = normalizarBusqueda(q);
  if (!norm) return true;
  const palabras = palabrasDe(campos);
  return norm.split(" ").every((t) => coincideToken(palabras, t));
}

// Por qué placeholder con iniciales: sin foto el listado muestra texto, no un
// rectángulo vacío; la enie colapsa a ene por la misma normalización de arriba.
export function inicialesProducto(nombre: string): string {
  const norm = normalizarBusqueda(nombre);
  if (!norm) return "?";
  const palabras = norm.split(" ").filter((w) => w.length > 0);
  const primera = palabras[0] ?? "";
  const segunda = palabras[1];
  if (segunda !== undefined) return `${primera[0] ?? ""}${segunda[0] ?? ""}`;
  return primera.slice(0, 2);
}
