import { useSyncExternalStore, type ReactNode } from "react";
import NumberFlow from "@number-flow/react";
import { TableVirtuoso, type ContextProp, type TableComponents, type TableProps } from "react-virtuoso";
import {
  FORMATO_PRECIO,
  LOCALE_PRECIO,
  leerCatalogo,
  pesosDesdeCentavos,
  suscribirCatalogo,
  type ProductoCatalogo,
} from "../../lib/catalogo-panel.js";

type Columnas = "precios" | "stock";

interface Props {
  columnas: Columnas;
  etiqueta: string;
}

interface ContextoTabla {
  etiqueta: string;
  filas: number;
  columnas: Columnas;
}

const VACIO: ProductoCatalogo[] = [];
const sinItemsEnServidor = () => VACIO;

const ENCABEZADOS: Record<Columnas, readonly string[]> = {
  precios: ["SKU", "Nombre", "Precio"],
  stock: ["SKU", "Nombre", "Precio", "Mínimo", "A reponer"],
};

function CeldaPrecio({ centavos }: { centavos: number | string }) {
  return (
    <td className="tnum precio">
      <NumberFlow
        value={pesosDesdeCentavos(centavos)}
        locales={LOCALE_PRECIO}
        format={FORMATO_PRECIO}
        respectMotionPreference
      />
    </td>
  );
}

const CELDAS: Record<Columnas, (p: ProductoCatalogo) => ReactNode> = {
  precios: (p) => (
    <>
      <td className="sku">{p.sku}</td>
      <td className="nombre">{p.nombre}</td>
      <CeldaPrecio centavos={p.precioCentavos} />
    </>
  ),
  stock: (p) => (
    <>
      <td className="sku">{p.sku}</td>
      <td className="nombre">{p.nombre}</td>
      <CeldaPrecio centavos={p.precioCentavos} />
      <td className="tnum">{p.min_stock ?? "—"}</td>
      <td className="tnum">{p.reorder_qty ?? "—"}</td>
    </>
  ),
};

function TablaHtml({ children, style, context }: TableProps & ContextProp<ContextoTabla>) {
  return (
    <table
      className={`tabla-catalogo tabla-catalogo--${context.columnas}`}
      style={style}
      aria-label={context.etiqueta}
      aria-rowcount={context.filas}
    >
      {children}
    </table>
  );
}

const COMPONENTS: TableComponents<ProductoCatalogo, ContextoTabla> = { Table: TablaHtml };

export default function TablaCatalogo({ columnas, etiqueta }: Props) {
  const items = useSyncExternalStore(suscribirCatalogo, leerCatalogo, sinItemsEnServidor);

  return (
    <>
      <TableVirtuoso
        data={items}
        useWindowScroll
        increaseViewportBy={200}
        defaultItemHeight={38}
        computeItemKey={(_, item) => item.sku}
        context={{ etiqueta, filas: items.length, columnas }}
        components={COMPONENTS}
        fixedHeaderContent={() => (
          <tr>
            {ENCABEZADOS[columnas].map((titulo) => (
              <th key={titulo} scope="col">
                {titulo}
              </th>
            ))}
          </tr>
        )}
        itemContent={(_, item) => CELDAS[columnas](item)}
      />
      <style>{`
        .tabla-catalogo { width: 100%; table-layout: fixed; border-collapse: collapse; font-size: 13px; }
        .tabla-catalogo th, .tabla-catalogo td { padding: 8px 6px; border-bottom: 1px solid var(--color-linen); overflow-wrap: anywhere; }
        .tabla-catalogo thead th { position: sticky; top: 0; z-index: 1; background: var(--color-star-white); text-align: start; color: var(--color-ash); font-weight: 500; }
        .tabla-catalogo td.nombre { min-width: 0; overflow-wrap: anywhere; }
        .tabla-catalogo td.precio { min-width: 5rem; }
        .tabla-catalogo .tnum { font-variant-numeric: tabular-nums; }
        .tabla-catalogo--precios th:nth-child(1) { width: 30%; }
        .tabla-catalogo--precios th:nth-child(2) { width: 40%; }
        .tabla-catalogo--precios th:nth-child(3) { width: 30%; }
        .tabla-catalogo--stock th:nth-child(1) { width: 20%; }
        .tabla-catalogo--stock th:nth-child(2) { width: 26%; }
        .tabla-catalogo--stock th:nth-child(3) { width: 30%; }
        .tabla-catalogo--stock th:nth-child(4) { width: 12%; }
        .tabla-catalogo--stock th:nth-child(5) { width: 12%; }
      `}</style>
    </>
  );
}
