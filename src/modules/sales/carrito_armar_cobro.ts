// P1-56: el primer precio y el alta ya cargado no se pisan. Si el re-scan
// ganara, el lector cambiaría el precio que el cajero dejó en la fila.

import { descripcionLineaPeso, esCantidadValida, subtotalLinea } from "./linea_peso.js";

export type LineaCarrito = {
  readonly product_id: string;
  readonly qty: number;
  readonly precio_centavos: number;
  readonly porPeso?: boolean | undefined;
  readonly alta?: { readonly nombre: string };
};

export type CodigoCarrito =
  | "sin_lineas"
  | "demasiadas_lineas"
  | "qty_invalida"
  | "precio_invalido"
  | "sku_invalido"
  | "nombre_invalido";

export type LineaPayloadVenta = {
  readonly product_id: string;
  readonly qty: number;
  readonly precio_centavos: number;
  readonly por_peso?: true | undefined;
  readonly alta?: { readonly nombre: string };
};

export type PayloadVentaMostrador = {
  readonly lineas: readonly LineaPayloadVenta[];
  readonly medio: string;
  readonly device_code: string;
  readonly seq_local: number;
  readonly client_occurred_at: string;
  readonly offline: boolean;
};

export type TicketBase = {
  readonly total: string;
  readonly medio: string;
  readonly lineas: readonly {
    readonly sku: string;
    readonly cantidad: number;
    readonly precio: string;
    readonly porPeso?: boolean | undefined;
    readonly subtotal?: string | undefined;
    readonly descripcion?: string | undefined;
  }[];
  readonly provisorio: string;
};

export type ResultadoFusion =
  | { readonly ok: true; readonly carrito: readonly LineaCarrito[] }
  | { readonly ok: false; readonly codigo: CodigoCarrito };

export type ResultadoCobro =
  | { readonly ok: true; readonly payload: PayloadVentaMostrador; readonly ticketBase: TicketBase }
  | { readonly ok: false; readonly codigo: CodigoCarrito };

const MAX_LINEAS = 50;
const MAX_PRECIO = 999_999_999;
const MAX_SKU = 64;
const MAX_NOMBRE = 120;

function codigoLinea(linea: LineaCarrito): CodigoCarrito | null {
  if (typeof linea.product_id !== "string" || linea.product_id.length < 1 || linea.product_id.length > MAX_SKU) {
    return "sku_invalido";
  }
  if (linea.porPeso !== undefined && typeof linea.porPeso !== "boolean") return "qty_invalida";
  if (!esCantidadValida(linea.qty, linea.porPeso)) return "qty_invalida";
  if (!Number.isInteger(linea.precio_centavos) || linea.precio_centavos < 0 || linea.precio_centavos > MAX_PRECIO) {
    return "precio_invalido";
  }
  if (linea.alta !== undefined) {
    const nombre = linea.alta.nombre;
    if (typeof nombre !== "string" || nombre.trim().length < 1 || nombre.trim().length > MAX_NOMBRE) {
      return "nombre_invalido";
    }
  }
  return null;
}

function normalizar(linea: LineaCarrito): LineaCarrito {
  const base = {
    product_id: linea.product_id,
    qty: linea.qty,
    precio_centavos: linea.precio_centavos,
    ...(linea.porPeso === true ? { porPeso: true } : {}),
  };
  if (!linea.alta) return base;
  return { ...base, alta: { nombre: linea.alta.nombre.trim() } };
}

export function fusionarLinea(carrito: readonly LineaCarrito[], linea: LineaCarrito): ResultadoFusion {
  const codigo = codigoLinea(linea);
  if (codigo) return { ok: false, codigo };
  const entrada = normalizar(linea);
  const idx = carrito.findIndex((l) => l.product_id === entrada.product_id);
  if (idx === -1) {
    if (carrito.length >= MAX_LINEAS) return { ok: false, codigo: "demasiadas_lineas" };
    return { ok: true, carrito: [...carrito, entrada] };
  }
  const previa = carrito[idx];
  if (!previa) return { ok: false, codigo: "sku_invalido" };
  if ((previa.porPeso ?? false) !== (entrada.porPeso ?? false)) return { ok: false, codigo: "qty_invalida" };
  const qty = previa.qty + entrada.qty;
  if (!esCantidadValida(qty, previa.porPeso)) return { ok: false, codigo: "qty_invalida" };
  const alta = previa.alta ?? entrada.alta;
  const porPeso = previa.porPeso === true ? { porPeso: true } : {};
  const fusionada: LineaCarrito = alta
    ? { product_id: previa.product_id, qty, precio_centavos: previa.precio_centavos, ...porPeso, alta }
    : { product_id: previa.product_id, qty, precio_centavos: previa.precio_centavos, ...porPeso };
  return { ok: true, carrito: carrito.map((l, i) => (i === idx ? fusionada : l)) };
}

export function armarCobroDesdeCarrito(input: {
  readonly carrito: readonly LineaCarrito[];
  readonly medio: string;
  readonly device_code: string;
  readonly seq_local: number;
  readonly offline: boolean;
  readonly occurredAtIso: string;
}): ResultadoCobro {
  if (input.carrito.length < 1) return { ok: false, codigo: "sin_lineas" };
  if (input.carrito.length > MAX_LINEAS) return { ok: false, codigo: "demasiadas_lineas" };
  const lineas: LineaPayloadVenta[] = [];
  const vista: {
    sku: string;
    cantidad: number;
    precio: string;
    porPeso?: boolean | undefined;
    subtotal?: string | undefined;
    descripcion?: string | undefined;
  }[] = [];
  let total = 0;
  for (const cruda of input.carrito) {
    const codigo = codigoLinea(cruda);
    if (codigo) return { ok: false, codigo };
    const linea = normalizar(cruda);
    const base = {
      product_id: linea.product_id,
      qty: linea.qty,
      precio_centavos: linea.precio_centavos,
      ...(linea.porPeso === true ? { por_peso: true as const } : {}),
    };
    lineas.push(linea.alta ? { ...base, alta: linea.alta } : base);
    const subtotal = subtotalLinea(linea.qty, linea.precio_centavos, linea.porPeso);
    total += Number(subtotal);
    vista.push({
      sku: linea.product_id,
      cantidad: linea.qty,
      precio: String(linea.precio_centavos),
      ...(linea.porPeso === true
        ? {
            porPeso: true,
            subtotal: subtotal.toString(),
            descripcion: descripcionLineaPeso(linea.qty, linea.precio_centavos),
          }
        : {}),
    });
  }
  return {
    ok: true,
    payload: {
      lineas,
      medio: input.medio,
      device_code: input.device_code,
      seq_local: input.seq_local,
      client_occurred_at: input.occurredAtIso,
      offline: input.offline,
    },
    ticketBase: {
      total: String(total),
      medio: input.medio,
      lineas: vista,
      provisorio: input.device_code + "-" + input.seq_local,
    },
  };
}
