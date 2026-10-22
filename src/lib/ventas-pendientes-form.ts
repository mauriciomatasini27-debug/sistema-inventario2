import { formatearPesos, mensajePesos, parsearPesos, pesosParaInput } from "./pesos.js";
import type { Medio } from "./validation.js";

export const MEDIOS: readonly Medio[] = [
  "Efectivo",
  "Debito",
  "Mercado Pago",
  "QR",
  "Transferencia",
];

export const MAX_LINEAS = 50;
export const MAX_PAGOS = 5;
export const TOPE_CENTAVOS = 999_999_999;

export interface LineaBorrador {
  id: string;
  origen: number | null;
  product_id: string;
  nombre: string | null;
  qtyTexto: string;
  precioTexto: string;
}

export interface PagoBorrador {
  id: string;
  origen: number | null;
  medio: Medio;
  montoTexto: string;
}

export interface BorradorVenta {
  lineas: LineaBorrador[];
  pagos: PagoBorrador[];
  sinPagos: boolean;
  medio: Medio;
}

export interface ErroresLinea {
  product_id?: string;
  nombre?: string;
  qty?: string;
  precio?: string;
}

export interface ErroresBorrador {
  lineas: Record<string, ErroresLinea>;
  pagos: Record<string, { monto?: string }>;
  general: string[];
}

interface LineaPayload extends Record<string, unknown> {
  product_id: string;
  qty: number;
  precio_centavos: number;
}

interface PagoPayload extends Record<string, unknown> {
  medio: Medio;
  monto_centavos: number;
}

interface PrecioValido {
  ok: true;
  centavos: number;
}

interface PrecioInvalido {
  ok: false;
  mensaje: string;
}

function esObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}

function esEntero(valor: unknown): valor is number {
  return typeof valor === "number" && Number.isInteger(valor);
}

function esMedio(valor: unknown): valor is Medio {
  return typeof valor === "string" && (MEDIOS as readonly string[]).includes(valor);
}

function esLineaValida(valor: unknown): valor is LineaPayload {
  if (!esObjeto(valor)) return false;
  const productId = valor["product_id"];
  const qty = valor["qty"];
  const precio = valor["precio_centavos"];
  return (
    typeof productId === "string" &&
    productId.length >= 1 &&
    productId.length <= 64 &&
    esEntero(qty) &&
    qty >= 1 &&
    qty <= 999 &&
    esEntero(precio) &&
    precio >= 0 &&
    precio <= TOPE_CENTAVOS
  );
}

function esPagoValido(valor: unknown): valor is PagoPayload {
  if (!esObjeto(valor)) return false;
  const medio = valor["medio"];
  const monto = valor["monto_centavos"];
  return esMedio(medio) && esEntero(monto) && monto > 0;
}

function nombreDeLinea(linea: Record<string, unknown>): string | null {
  const alta = linea["alta"];
  if (!esObjeto(alta)) return null;
  const nombre = alta["nombre"];
  return typeof nombre === "string" && nombre.trim().length > 0 ? nombre : null;
}

function lineaVacia(id: string): LineaBorrador {
  return {
    id,
    origen: null,
    product_id: "",
    nombre: null,
    qtyTexto: "",
    precioTexto: "",
  };
}

function cantidadValida(texto: string): number | null {
  const limpio = texto.trim();
  if (!/^\d+$/.test(limpio)) return null;
  const numero = Number(limpio);
  return Number.isSafeInteger(numero) && numero >= 1 && numero <= 999 ? numero : null;
}

function excedeTope(texto: string): boolean {
  let limpio = texto.trim();
  if (limpio.startsWith("$")) limpio = limpio.slice(1).trimStart();
  if (limpio === "" || !/^[0-9.,]+$/.test(limpio)) return false;

  const comas = limpio.split(",").length - 1;
  if (comas > 1) return false;

  let entero = limpio;
  let decimales = "";
  if (comas === 1) {
    const partes = limpio.split(",");
    const parteEntera = partes[0];
    const parteDecimal = partes[1];
    if (parteEntera === undefined || parteDecimal === undefined) return false;
    if (!/^\d+$/.test(parteDecimal) || parteDecimal.length > 2) return false;
    entero = parteEntera;
    decimales = parteDecimal;
  } else {
    const puntos = limpio.split(".").length - 1;
    if (puntos === 1) {
      const partes = limpio.split(".");
      const parteEntera = partes[0];
      const parteDecimal = partes[1];
      if (
        parteEntera !== undefined &&
        parteDecimal !== undefined &&
        /^\d+$/.test(parteEntera) &&
        /^\d{1,2}$/.test(parteDecimal)
      ) {
        entero = parteEntera;
        decimales = parteDecimal;
      }
    }
  }

  if (entero.includes(".")) {
    const grupos = entero.split(".");
    const primero = grupos[0];
    if (primero === undefined || !/^\d{1,3}$/.test(primero)) return false;
    for (const grupo of grupos.slice(1)) {
      if (!/^\d{3}$/.test(grupo)) return false;
    }
    entero = grupos.join("");
  } else if (!/^\d+$/.test(entero)) {
    return false;
  }

  return BigInt(entero + decimales.padEnd(2, "0")) > BigInt(TOPE_CENTAVOS);
}

function validarPrecio(texto: string): PrecioValido | PrecioInvalido {
  const parseo = parsearPesos(texto);
  if (parseo.ok) return { ok: true, centavos: parseo.centavos };
  if (excedeTope(texto)) return { ok: false, mensaje: "Usá hasta $ 9.999.999,99." };
  return { ok: false, mensaje: mensajePesos(parseo.motivo) };
}

function centsDeLinea(texto: string, original: unknown): number {
  const parseo = parsearPesos(texto);
  if (parseo.ok) return parseo.centavos;
  if (esObjeto(original)) {
    const precio = original["precio_centavos"];
    if (esEntero(precio) && precio >= 0 && precio <= TOPE_CENTAVOS) return precio;
  }
  return 0;
}

function qtyDeLinea(texto: string, original: unknown): number {
  const cantidad = cantidadValida(texto);
  if (cantidad !== null) return cantidad;
  if (esObjeto(original)) {
    const qty = original["qty"];
    if (esEntero(qty) && qty >= 1 && qty <= 999) return qty;
  }
  return 1;
}

function montoDePago(texto: string, original: unknown): number {
  const parseo = parsearPesos(texto);
  if (parseo.ok) return parseo.centavos;
  if (esObjeto(original)) {
    const monto = original["monto_centavos"];
    if (esEntero(monto) && monto > 0) return monto;
  }
  return 0;
}

export function borradorDePayload(payload: unknown): BorradorVenta {
  const base = esObjeto(payload) ? payload : {};
  const lineas: LineaBorrador[] = [];
  const crudas = base["lineas"];
  if (Array.isArray(crudas)) {
    crudas.forEach((cruda, indice) => {
      if (!esLineaValida(cruda)) return;
      lineas.push({
        id: "linea-" + indice,
        origen: indice,
        product_id: cruda.product_id,
        nombre: nombreDeLinea(cruda),
        qtyTexto: String(cruda.qty),
        precioTexto: pesosParaInput(cruda.precio_centavos),
      });
    });
  }
  if (lineas.length === 0) lineas.push(lineaVacia("nueva-0"));

  const medio = esMedio(base["medio"]) ? base["medio"] : "Efectivo";
  const crudosPagos = base["pagos"];
  if (Array.isArray(crudosPagos) && crudosPagos.length > 0) {
    const pagos = crudosPagos.filter(esPagoValido);
    if (pagos.length === crudosPagos.length) {
      return {
        lineas,
        pagos: pagos.map((pago, indice) => ({
          id: "pago-" + indice,
          origen: indice,
          medio: pago.medio,
          montoTexto: pesosParaInput(pago.monto_centavos),
        })),
        sinPagos: false,
        medio,
      };
    }
  }

  return { lineas, pagos: [], sinPagos: true, medio };
}

export function conLineaNueva(borrador: BorradorVenta, id: string): BorradorVenta {
  if (borrador.lineas.length >= MAX_LINEAS) return borrador;
  return {
    ...borrador,
    lineas: [
      ...borrador.lineas,
      { id, origen: null, product_id: "", nombre: null, qtyTexto: "1", precioTexto: "" },
    ],
  };
}

export function sinLinea(borrador: BorradorVenta, id: string): BorradorVenta {
  if (borrador.lineas.length <= 1) return borrador;
  if (!borrador.lineas.some((linea) => linea.id === id)) return borrador;
  return { ...borrador, lineas: borrador.lineas.filter((linea) => linea.id !== id) };
}

export function conPagoNuevo(borrador: BorradorVenta, id: string): BorradorVenta {
  if (borrador.sinPagos || borrador.pagos.length >= MAX_PAGOS) return borrador;
  return {
    ...borrador,
    pagos: [
      ...borrador.pagos,
      { id, origen: null, medio: "Efectivo", montoTexto: "" },
    ],
  };
}

export function sinPago(borrador: BorradorVenta, id: string): BorradorVenta {
  if (borrador.sinPagos || borrador.pagos.length <= 1) return borrador;
  if (!borrador.pagos.some((pago) => pago.id === id)) return borrador;
  return { ...borrador, pagos: borrador.pagos.filter((pago) => pago.id !== id) };
}

export function validarBorrador(borrador: BorradorVenta): ErroresBorrador {
  const lineas: Record<string, ErroresLinea> = {};
  for (const linea of borrador.lineas) {
    const errores: ErroresLinea = {};
    if (linea.product_id.length < 1 || linea.product_id.length > 64) {
      errores.product_id = "Poné el SKU (1 a 64 caracteres).";
    }
    if (linea.nombre !== null) {
      const nombre = linea.nombre.trim();
      if (nombre.length < 1 || nombre.length > 120) {
        errores.nombre = "El nombre tiene que tener entre 1 y 120 caracteres.";
      }
    }
    if (cantidadValida(linea.qtyTexto) === null) {
      errores.qty = "Poné un entero entre 1 y 999.";
    }
    const precio = validarPrecio(linea.precioTexto);
    if (!precio.ok) errores.precio = precio.mensaje;
    if (Object.keys(errores).length > 0) lineas[linea.id] = errores;
  }

  const pagos: Record<string, { monto?: string }> = {};
  if (!borrador.sinPagos) {
    for (const pago of borrador.pagos) {
      const parseo = parsearPesos(pago.montoTexto);
      if (!parseo.ok) {
        pagos[pago.id] = {
          monto: excedeTope(pago.montoTexto)
            ? "Usá hasta $ 9.999.999,99."
            : mensajePesos(parseo.motivo),
        };
      } else if (parseo.centavos === 0) {
        pagos[pago.id] = { monto: "Poné un monto mayor a cero." };
      }
    }
  }

  const general: string[] = [];
  if (borrador.lineas.length === 0) general.push("La venta necesita al menos una línea.");

  const hayErroresCampo =
    Object.keys(lineas).length > 0 || Object.keys(pagos).length > 0;
  if (!borrador.sinPagos && !hayErroresCampo) {
    const diferencia = diferenciaCentavos(borrador);
    if (diferencia < 0) {
      general.push("Faltan " + formatearPesos(Math.abs(diferencia)) + " en los pagos.");
    } else if (diferencia > 0) {
      general.push("Sobran " + formatearPesos(diferencia) + " en los pagos.");
    }
  }

  return { lineas, pagos, general };
}

export function totalCentavos(borrador: BorradorVenta): number {
  let total = 0;
  for (const linea of borrador.lineas) {
    const qty = cantidadValida(linea.qtyTexto);
    const precio = parsearPesos(linea.precioTexto);
    if (qty === null || !precio.ok) continue;
    total += qty * precio.centavos;
  }
  return total;
}

export function sumaPagosCentavos(borrador: BorradorVenta): number {
  if (borrador.sinPagos) return 0;
  let suma = 0;
  for (const pago of borrador.pagos) {
    const parseo = parsearPesos(pago.montoTexto);
    if (parseo.ok) suma += parseo.centavos;
  }
  return suma;
}

export function diferenciaCentavos(borrador: BorradorVenta): number {
  if (borrador.sinPagos) return 0;
  return sumaPagosCentavos(borrador) - totalCentavos(borrador);
}

export function payloadCorregido(
  payload: unknown,
  borrador: BorradorVenta,
): Record<string, unknown> {
  if (!esObjeto(payload)) return {};

  const lineasOriginales = Array.isArray(payload["lineas"]) ? payload["lineas"] : [];
  const lineas = borrador.lineas.map((linea) => {
    const original =
      linea.origen === null ? null : lineasOriginales[linea.origen];
    const salida: Record<string, unknown> = esObjeto(original) ? { ...original } : {};
    salida["product_id"] = linea.product_id;
    salida["qty"] = qtyDeLinea(linea.qtyTexto, original);
    salida["precio_centavos"] = centsDeLinea(linea.precioTexto, original);
    if (linea.origen === null) {
      delete salida["precio_id"];
      delete salida["alta"];
    }
    if (linea.nombre !== null) {
      const alta = esObjeto(salida["alta"]) ? salida["alta"] : {};
      salida["alta"] = { ...alta, nombre: linea.nombre };
    }
    return salida;
  });

  const corregido: Record<string, unknown> = { ...payload, lineas };
  if (borrador.sinPagos) {
    delete corregido["pagos"];
    corregido["medio"] = borrador.medio;
    return corregido;
  }

  const pagosOriginales = Array.isArray(payload["pagos"]) ? payload["pagos"] : [];
  corregido["pagos"] = borrador.pagos.map((pago) => {
    const original = pago.origen === null ? null : pagosOriginales[pago.origen];
    return {
      medio: pago.medio,
      monto_centavos: montoDePago(pago.montoTexto, original),
    };
  });
  return corregido;
}
