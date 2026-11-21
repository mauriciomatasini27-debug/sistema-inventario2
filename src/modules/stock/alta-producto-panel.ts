// STOCK-S19: alta manual desde /panel/stock (nombre, código opcional, SKU interno).

export type CuerpoAltaProducto = {
  readonly sku: string;
  readonly nombre: string;
  readonly precio_centavos: number;
  readonly por_peso: boolean;
  readonly codigo?: string;
  readonly location_id?: string;
};

export const AVISO_POR_PESO = "Se vende por peso: el precio cargado significa centavos por kilogramo.";

export function avisoPorPeso(porPeso: boolean): string {
  return porPeso ? AVISO_POR_PESO : "";
}

export function generarSkuInterno(entropia: string): string {
  const limpio = entropia.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 12);
  const sufijo = limpio.length >= 8 ? limpio : limpio + "00000000".slice(limpio.length);
  return `INT-${sufijo.slice(0, 12)}`;
}

export function elegirSkuDesdeCodigo(codigo: string): string {
  return codigo.trim().toUpperCase();
}

export function armarAltaProducto(input: {
  nombre: string;
  codigo?: string;
  precioCentavos: number;
  porPeso?: boolean;
  locationId?: string;
  entropiaSku: string;
}): CuerpoAltaProducto {
  const nombre = input.nombre.trim();
  const codigo = input.codigo?.trim();
  const sku = codigo ? elegirSkuDesdeCodigo(codigo) : generarSkuInterno(input.entropiaSku);
  return {
    sku,
    nombre,
    precio_centavos: input.precioCentavos,
    por_peso: input.porPeso ?? false,
    ...(codigo ? { codigo: elegirSkuDesdeCodigo(codigo) } : {}),
    ...(input.locationId ? { location_id: input.locationId } : {}),
  };
}

export type AccionCodigoDuplicado =
  | { readonly tipo: "ninguna" }
  | { readonly tipo: "abrir"; readonly sku: string; readonly mensaje: string };

export function accionSiCodigoDuplicado(
  status: number,
  error: unknown,
  productos: readonly { sku: string }[],
): AccionCodigoDuplicado {
  if (status !== 409) return { tipo: "ninguna" };
  const texto = typeof error === "string" ? error : "";
  if (!/codigo duplicado/i.test(texto)) return { tipo: "ninguna" };
  const sku = productos[0]?.sku?.trim();
  if (!sku) {
    return { tipo: "ninguna" };
  }
  return {
    tipo: "abrir",
    sku,
    mensaje: "Ya tenés un producto con ese código en este comercio.",
  };
}

export function mensajeErrorAlta(status: number, error: unknown): string {
  if (status === 403) return "No tenés permiso para dar de alta productos.";
  if (status === 409) {
    const texto = typeof error === "string" ? error : "";
    if (/codigo duplicado/i.test(texto)) return "Ese código ya está cargado en este comercio.";
    if (/sku duplicado/i.test(texto)) return "Ese SKU ya existe en este comercio.";
    return "Ya existe un producto con esos datos.";
  }
  if (status === 422) return "Revisá los datos del producto.";
  if (status === 503) return "La base no está disponible. Probá de nuevo.";
  return "No se pudo crear el producto.";
}