import { z } from "zod";

// P3-7d (ADR-0020): filtro por texto y paginado por offset, puros, de los
// listados read-only del panel (proveedores y clientes de fiado). El borde
// valida con Zod; cada repo entrega las filas y acá solo se filtra y se corta.
export const LIMITE_DEFECTO = 20;
export const LIMITE_MAX = 50;
const QUERY_MAX = 120;

export const listaQuerySchema = z.object({
  q: z.string().trim().max(QUERY_MAX).default(""),
  limit: z.coerce.number().int().min(1).max(LIMITE_MAX).default(LIMITE_DEFECTO),
  cursor: z.coerce.number().int().min(0).default(0),
});

export interface ListaParams {
  readonly q: string;
  readonly limit: number;
  readonly cursor: number;
}

export interface PaginaLista<T> {
  readonly items: T[];
  readonly next_cursor: string | null;
}

// Case-insensitive sobre los campos dados; q vacío no filtra. No muta la entrada.
export function filtrarTexto<T>(
  items: ReadonlyArray<T>,
  q: string,
  campos: (item: T) => ReadonlyArray<string | null | undefined>,
): T[] {
  const busqueda = q.trim().toLowerCase();
  if (busqueda === "") return [...items];
  return items.filter((item) =>
    campos(item).some((valor) => valor !== null && valor !== undefined && valor.toLowerCase().includes(busqueda)),
  );
}

// Offset simple: el cursor es la posición del primer ítem. next_cursor es el
// siguiente offset, o null cuando no quedan más filas.
export function paginar<T>(items: ReadonlyArray<T>, opts: { limit: number; cursor: number }): PaginaLista<T> {
  const fin = opts.cursor + opts.limit;
  return {
    items: items.slice(opts.cursor, fin),
    next_cursor: fin < items.length ? String(fin) : null,
  };
}
