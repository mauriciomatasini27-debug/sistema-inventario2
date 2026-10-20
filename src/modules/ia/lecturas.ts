import { coincideDifuso, normalizarBusqueda } from "../inventario/busqueda.js";
import { fichaProducto } from "../pricing/precios.js";

export interface LineaVentaTop {
  readonly sku: string;
  readonly nombre: string;
  readonly cantidad: number;
  readonly totalCentavos: bigint;
}

export interface DevolucionTop {
  readonly sku: string;
  readonly cantidad: number;
}

export interface TopProducto {
  readonly sku: string;
  readonly nombre: string;
  readonly cantidad: number;
  readonly totalCentavos: string;
}

export function calcularTopProductos(
  ventas: readonly LineaVentaTop[],
  devoluciones: readonly DevolucionTop[],
  limite: number,
): TopProducto[] {
  const porSku = new Map<string, { sku: string; nombre: string; cantidad: number; totalCentavos: bigint }>();
  for (const venta of ventas) {
    const acumulado = porSku.get(venta.sku);
    if (acumulado) {
      acumulado.cantidad += venta.cantidad;
      acumulado.totalCentavos += venta.totalCentavos;
      if (acumulado.nombre === "" && venta.nombre !== "") acumulado.nombre = venta.nombre;
    } else {
      porSku.set(venta.sku, {
        sku: venta.sku,
        nombre: venta.nombre,
        cantidad: venta.cantidad,
        totalCentavos: venta.totalCentavos,
      });
    }
  }
  for (const devolucion of devoluciones) {
    const acumulado = porSku.get(devolucion.sku);
    if (acumulado) acumulado.cantidad -= devolucion.cantidad;
  }
  return [...porSku.values()]
    .filter((p) => p.cantidad > 0)
    .sort((a, b) => {
      if (a.cantidad !== b.cantidad) return b.cantidad - a.cantidad;
      return a.sku < b.sku ? -1 : a.sku > b.sku ? 1 : 0;
    })
    .slice(0, limite)
    .map((p) => ({
      sku: p.sku,
      nombre: p.nombre,
      cantidad: p.cantidad,
      totalCentavos: p.totalCentavos.toString(),
    }));
}

export interface ProductoCatalogoCosto {
  readonly sku: string;
  readonly nombre: string;
  readonly precioCentavos: bigint;
  readonly costoCentavos: bigint | null;
}

export interface MargenProducto {
  readonly sku: string;
  readonly nombre: string;
  readonly precioCentavos: string;
  readonly costoCentavos: string | null;
  readonly margenCentavos: string | null;
  readonly margenPorcentaje: number | null;
}

export function margenDeProducto(producto: ProductoCatalogoCosto): MargenProducto {
  if (producto.costoCentavos === null) {
    return {
      sku: producto.sku,
      nombre: producto.nombre,
      precioCentavos: producto.precioCentavos.toString(),
      costoCentavos: null,
      margenCentavos: null,
      margenPorcentaje: null,
    };
  }
  const ficha = fichaProducto({
    costoCentavos: producto.costoCentavos,
    precioCentavos: producto.precioCentavos,
  });
  return {
    sku: producto.sku,
    nombre: producto.nombre,
    precioCentavos: producto.precioCentavos.toString(),
    costoCentavos: producto.costoCentavos.toString(),
    margenCentavos: ficha.gananciaCentavos.toString(),
    margenPorcentaje: ficha.margenBp === null ? null : ficha.margenBp / 100,
  };
}

export function buscarProductoPorTexto(
  catalogo: readonly ProductoCatalogoCosto[],
  texto: string,
): ProductoCatalogoCosto | null {
  const buscado = normalizarBusqueda(texto);
  const exacto = catalogo.find((p) => normalizarBusqueda(p.sku) === buscado);
  if (exacto) return exacto;
  return catalogo.find((p) => coincideDifuso([p.sku, p.nombre], texto)) ?? null;
}

export function productosMenorMargen(
  catalogo: readonly ProductoCatalogoCosto[],
  limite = 5,
): MargenProducto[] {
  return catalogo
    .map(margenDeProducto)
    .filter((p) => p.margenPorcentaje !== null)
    .sort((a, b) => {
      if (a.margenPorcentaje !== b.margenPorcentaje) {
        return (a.margenPorcentaje ?? 0) - (b.margenPorcentaje ?? 0);
      }
      return a.sku < b.sku ? -1 : a.sku > b.sku ? 1 : 0;
    })
    .slice(0, limite);
}

export interface ProductoStock {
  readonly sku: string;
  readonly nombre: string;
  readonly stock: number;
}

export interface MovimientoRotacion {
  readonly sku: string;
  readonly tipo: "venta" | "devolucion";
  readonly cantidad: number;
  readonly ocurridoEn: string | null;
}

export interface RotacionProducto {
  readonly sku: string;
  readonly nombre: string;
  readonly stock: number;
  readonly unidadesVendidas: number;
  readonly ultimaVentaEl: string | null;
}

export function calcularRotacionLenta(
  catalogo: readonly ProductoStock[],
  movimientos: readonly MovimientoRotacion[],
  limite = 10,
): RotacionProducto[] {
  const porSku = new Map<string, { vendidas: number; ultima: string | null }>();
  for (const movimiento of movimientos) {
    const acumulado = porSku.get(movimiento.sku) ?? { vendidas: 0, ultima: null };
    acumulado.vendidas += movimiento.tipo === "venta" ? movimiento.cantidad : -movimiento.cantidad;
    if (
      movimiento.tipo === "venta" &&
      movimiento.ocurridoEn !== null &&
      (acumulado.ultima === null || movimiento.ocurridoEn > acumulado.ultima)
    ) {
      acumulado.ultima = movimiento.ocurridoEn;
    }
    porSku.set(movimiento.sku, acumulado);
  }
  return catalogo
    .filter((p) => p.stock > 0)
    .map((p) => {
      const acumulado = porSku.get(p.sku);
      return {
        sku: p.sku,
        nombre: p.nombre,
        stock: p.stock,
        unidadesVendidas: acumulado?.vendidas ?? 0,
        ultimaVentaEl: acumulado?.ultima ?? null,
      };
    })
    .sort((a, b) => {
      if (a.unidadesVendidas !== b.unidadesVendidas) return a.unidadesVendidas - b.unidadesVendidas;
      if (a.stock !== b.stock) return b.stock - a.stock;
      return a.sku < b.sku ? -1 : a.sku > b.sku ? 1 : 0;
    })
    .slice(0, limite);
}
