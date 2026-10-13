// Núcleo puro RT7: filtrar + ordenar + keyset sobre filas ya calculadas.
// El adaptador pagina en SQL con el mismo predicado; acá queda la forma pura
// testeable (offline y tests la reusan).
import type { FilaRotacion } from "./tipos.js";
import { cmpRanking } from "./selectores.js";

export type OrdenTablero = "neto" | "rotacion" | "cobertura" | "valorizado" | "sinventa";

export interface ConsultaTablero {
  readonly texto?: string | undefined;
  readonly categoria?: string | undefined;
  readonly ubicacion?: string | undefined;
  readonly soloConStock?: boolean | undefined;
  readonly orden: OrdenTablero;
  readonly dir: "asc" | "desc";
  readonly limite: number;
  readonly cursor?: string | null | undefined;
}

function cmpPorOrden(orden: OrdenTablero): (a: FilaRotacion, b: FilaRotacion) => number {
  switch (orden) {
    case "rotacion":
      return (a, b) => {
        const ra = a.rotacion ?? -1;
        const rb = b.rotacion ?? -1;
        if (ra !== rb) return rb - ra;
        return cmpRanking(a, b);
      };
    case "cobertura":
      return (a, b) => {
        const ca = a.coberturaDias ?? Number.POSITIVE_INFINITY;
        const cb = b.coberturaDias ?? Number.POSITIVE_INFINITY;
        if (ca !== cb) return ca - cb;
        return cmpRanking(a, b);
      };
    case "valorizado":
      return (a, b) => {
        if (a.valorizadoCentavos !== b.valorizadoCentavos)
          return a.valorizadoCentavos > b.valorizadoCentavos ? -1 : 1;
        return cmpRanking(a, b);
      };
    case "sinventa":
      return (a, b) => {
        if (a.diasSinVenta !== b.diasSinVenta) return b.diasSinVenta - a.diasSinVenta;
        return cmpRanking(a, b);
      };
    case "neto":
    default:
      return cmpRanking;
  }
}

export function consultar_tablero(
  filas: ReadonlyArray<FilaRotacion>,
  q: ConsultaTablero,
): { readonly items: ReadonlyArray<FilaRotacion>; readonly nextCursor: string | null } {
  const limite = Math.min(Math.max(q.limite, 1), 50);
  const texto = (q.texto ?? "").trim().toLowerCase();
  let vista = filas.filter((f) => {
    if (q.categoria && f.categoria !== q.categoria) return false;
    if (q.ubicacion && f.ubicacion !== q.ubicacion) return false;
    if (q.soloConStock === true && f.stockFinal <= 0) return false;
    if (texto && !f.nombre.toLowerCase().includes(texto) && !f.sku.toLowerCase().includes(texto))
      return false;
    return true;
  });
  const cmp = cmpPorOrden(q.orden);
  vista = [...vista].sort((a, b) => {
    const c = cmp(a, b);
    return q.dir === "asc" ? -c : c;
  });
  let desde = 0;
  if (q.cursor) {
    const idx = vista.findIndex((f) => f.sku === q.cursor);
    desde = idx === -1 ? 0 : idx + 1;
  }
  const items = vista.slice(desde, desde + limite);
  const ultima = items[items.length - 1];
  return {
    items,
    nextCursor: ultima === undefined || items.length < limite ? null : ultima.sku,
  };
}
