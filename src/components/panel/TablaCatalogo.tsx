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
  etiquetaPrecioCatalogo,
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
  stock: ["Código de producto", "Nombre", "Precio", "Stock disponible", "Mínimo"],
};

function CeldaPrecio({ centavos, porPeso }: { centavos: number | string; porPeso?: boolean | undefined }) {
  return (
    <td className="tnum precio" aria-label={etiquetaPrecioCatalogo({ precioCentavos: centavos, porPeso })}>
      <NumberFlow
        value={pesosDesdeCentavos(centavos)}
        locales={LOCALE_PRECIO}
        format={FORMATO_PRECIO}
        respectMotionPreference
        transformTiming={{ duration: 240, easing: "ease-out" }}
        opacityTiming={{ duration: 160 }}
      />
      <span className="por-peso-unidad">{porPeso ? " / kg" : " / unidad"}</span>
      {porPeso ? <span className="por-peso-marca">Por peso</span> : null}
    </td>
  );
}

const CELDAS: Record<Columnas, (p: ProductoCatalogo) => ReactNode> = {
  precios: (p) => (
    <>
      <td className="sku">{p.sku}</td>
      <td className="nombre">{p.nombre}</td>
      <CeldaPrecio centavos={p.precioCentavos} porPeso={p.porPeso} />
    </>
  ),
  stock: (p) => (
    <>
      <td className="sku">{p.sku}</td>
      <td className="nombre">{p.nombre}</td>
      <CeldaPrecio centavos={p.precioCentavos} porPeso={p.porPeso} />
      <td
        className="tnum cantidad"
        title={p.stock_disponible === null || p.stock_disponible === undefined ? "Sin Stock disponible verificable" : undefined}
      >
        {p.stock_disponible ?? "—"}
      </td>
      <td
        className="tnum cantidad"
        title={p.min_stock === null || p.min_stock === undefined ? "Sin mínimo cargado: la alerta usa rotación de 7 días" : undefined}
      >
        {p.min_stock ?? "—"}
      </td>
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
      {/* TB-AUDIT-MOBILE: en 360px cinco columnas fijas rompían “A reponer”; scroll horizontal conserva lectura. */}
      <div className="tabla-catalogo-scroll" aria-label={`${etiqueta}: deslizá si no entra la tabla`}>
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
      </div>
      <style>{`
        .tabla-catalogo-scroll { max-width: 100%; overflow-x: auto; -webkit-overflow-scrolling: touch; }
        .tabla-catalogo { width: 100%; table-layout: fixed; border-collapse: collapse; font-size: .875rem; }
        /* thead th / tbody td para ganarle a las reglas genéricas de tabla de PanelShell (13px, padding 8px 6px). */
        .tabla-catalogo thead th, .tabla-catalogo tbody td { font-size: .875rem; padding: .45rem .375rem; border-bottom: 1px solid var(--tema-linea); overflow-wrap: anywhere; vertical-align: middle; }
        .tabla-catalogo thead th { position: sticky; top: 0; z-index: 1; background: var(--tema-fondo); text-align: start; color: var(--tema-texto-suave); font-weight: 600; border-bottom: 2px solid var(--tema-borde-encabezado); }
        .tabla-catalogo td.nombre { min-width: 0; overflow-wrap: anywhere; }
        .tabla-catalogo td.precio { min-width: 5rem; }
        .tabla-catalogo .por-peso-unidad { color: var(--tema-texto-suave); }
        .tabla-catalogo .por-peso-marca { display: block; color: var(--tema-acento); font-size: .75rem; }
        .tabla-catalogo .tnum { font-variant-numeric: tabular-nums; }
        .tabla-catalogo tbody td { color: var(--tema-texto); }
        .tabla-catalogo tbody td.sku, .tabla-catalogo tbody td.cantidad { font-weight: 500; color: var(--tema-enfasis); }
        .tabla-catalogo tbody tr { background: transparent; }
        .tabla-catalogo tbody tr:hover { background: var(--tema-fila-hover); }
        .tabla-catalogo tbody tr[data-seleccionada="true"] { background: var(--tema-fila-seleccionada); }
        .tabla-catalogo--precios th:nth-child(1) { width: 30%; }
        .tabla-catalogo--precios th:nth-child(2) { width: 40%; }
        .tabla-catalogo--precios th:nth-child(3) { width: 30%; }
        .tabla-catalogo--stock th:nth-child(1) { width: 18%; }
        .tabla-catalogo--stock th:nth-child(2) { width: 26%; }
        .tabla-catalogo--stock th:nth-child(3) { width: 28%; }
        .tabla-catalogo--stock th:nth-child(4) { width: 16%; }
        .tabla-catalogo--stock th:nth-child(5) { width: 12%; }
        @media (max-width: 899px) {
          .tabla-catalogo--stock { table-layout: auto; min-width: 22rem; width: max-content; max-width: none; }
          .tabla-catalogo--stock thead th { white-space: nowrap; }
        }
      `}</style>
    </>
  );
}
