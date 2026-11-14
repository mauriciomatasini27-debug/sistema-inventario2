// STOCK-S19: alta manual desde /panel/stock (nombre, código opcional, SKU interno).

export const MENSAJE_INGRESO_FALLIDO = "Producto creado, pero no se cargó la cantidad.";

export type IntentoAltaFormulario = {
  readonly entropiaSku: string;
  readonly idempotencyKey: string;
  readonly skuSinCodigo: string;
};

export type CuerpoAltaProducto = {
  readonly sku: string;
  readonly nombre: string;
  readonly precio_centavos: number;
  readonly codigo?: string;
  readonly location_id?: string;
};

export function generarSkuInterno(entropia: string): string {
  const limpio = entropia.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 12);
  const sufijo = limpio.length >= 8 ? limpio : limpio + "00000000".slice(limpio.length);
  return `INT-${sufijo.slice(0, 12)}`;
}

export function elegirSkuDesdeCodigo(codigo: string): string {
  return codigo.trim().toUpperCase();
}

export function nuevoIntentoAlta(entropiaSku: string, idempotencyKey: string): IntentoAltaFormulario {
  return {
    entropiaSku,
    idempotencyKey,
    skuSinCodigo: generarSkuInterno(entropiaSku),
  };
}

export function armarAltaProducto(input: {
  nombre: string;
  codigo?: string;
  precioCentavos: number;
  locationId?: string;
  intento: IntentoAltaFormulario;
}): CuerpoAltaProducto {
  const nombre = input.nombre.trim();
  const codigo = input.codigo?.trim();
  const sku = codigo ? elegirSkuDesdeCodigo(codigo) : input.intento.skuSinCodigo;
  return {
    sku,
    nombre,
    precio_centavos: input.precioCentavos,
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