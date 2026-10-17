import { useSyncExternalStore, type ReactNode } from "react";
import NumberFlow from "@number-flow/react";
import {
  TableVirtuoso,
  type ContextProp,
  type ItemProps,
  type TableComponents,
  type TableProps,
} from "react-virtuoso";
import {
  FORMATO_PRECIO,
  LOCALE_PRECIO,
  leerCatalogo,
  leerSkuSeleccionado,
  pesosDesdeCentavos,
  skuNormalizado,
  suscribirCatalogo,
  suscribirSkuSeleccionado,
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
  skuSeleccionado: string | null;
}

const VACIO: ProductoCatalogo[] = [];
const sinItemsEnServidor = () => VACIO;
const sinSeleccionEnServidor = () => null;

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
      <td className="tnum cantidad">{p.min_stock ?? "—"}</td>
      <td className="tnum cantidad">{p.reorder_qty ?? "—"}</td>
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

function FilaCatalogo({ item, context, children, ...resto }: ItemProps<ProductoCatalogo> & ContextProp<ContextoTabla>) {
  const seleccionada = context.skuSeleccionado !== null && skuNormalizado(item.sku) === context.skuSeleccionado;
  return (
    <tr {...resto} data-seleccionada={seleccionada ? "true" : undefined} aria-current={seleccionada ? "true" : undefined}>
      {children}
    </tr>
  );
}

const COMPONENTS: TableComponents<ProductoCatalogo, ContextoTabla> = { Table: TablaHtml, TableRow: FilaCatalogo };

export default function TablaCatalogo({ columnas, etiqueta }: Props) {
  const items = useSyncExternalStore(suscribirCatalogo, leerCatalogo, sinItemsEnServidor);
  const skuSeleccionado = useSyncExternalStore(suscribirSkuSeleccionado, leerSkuSeleccionado, sinSeleccionEnServidor);

  return (
    <>
      <TableVirtuoso
        data={items}
        useWindowScroll
        increaseViewportBy={200}
        defaultItemHeight={38}
        computeItemKey={(_, item) => item.sku}
        context={{ etiqueta, filas: items.length, columnas, skuSeleccionado }}
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
        .tabla-catalogo { width: 100%; table-layout: fixed; border-collapse: collapse; font-size: .875rem; }
        /* thead th / tbody td para ganarle a las reglas genéricas de tabla de PanelShell (13px, padding 8px 6px). */
        .tabla-catalogo thead th, .tabla-catalogo tbody td { font-size: .875rem; padding: .45rem .375rem; border-bottom: 1px solid var(--tema-linea); overflow-wrap: anywhere; vertical-align: middle; }
        .tabla-catalogo thead th { position: sticky; top: 0; z-index: 1; background: var(--tema-fondo); text-align: start; color: var(--tema-texto-suave); font-weight: 600; border-bottom: 2px solid var(--tema-borde-encabezado); }
        .tabla-catalogo td.nombre { min-width: 0; overflow-wrap: anywhere; }
        .tabla-catalogo td.precio { min-width: 5rem; }
        .tabla-catalogo .tnum { font-variant-numeric: tabular-nums; }
        .tabla-catalogo tbody td { color: var(--tema-texto); }
        .tabla-catalogo tbody td.sku, .tabla-catalogo tbody td.cantidad { font-weight: 500; color: var(--tema-enfasis); }
        .tabla-catalogo tbody tr { background: transparent; }
        .tabla-catalogo tbody tr:hover { background: var(--tema-fila-hover); }
        .tabla-catalogo tbody tr[data-seleccionada="true"] { background: var(--tema-fila-seleccionada); }
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
