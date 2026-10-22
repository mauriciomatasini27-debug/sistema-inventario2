import type { Medio } from "./validation.js";

export const MEDIOS: readonly Medio[] = [
  "Efectivo",
  "Debito",
  "Mercado Pago",
  "QR",
  "Transferencia",
];

export interface LineaEditable {
  product_id: string;
  qty: number;
  precio_centavos: number;
}

export interface PagoEditable {
  medio: Medio;
  monto_centavos: number;
}

export interface EdicionVenta {
  lineas: LineaEditable[];
  pagos: PagoEditable[];
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

function lineaValida(valor: unknown): valor is LineaEditable {
  if (!esObjeto(valor)) return false;
  const productId = valor["product_id"];
  const qty = valor["qty"];
  const precio = valor["precio_centavos"];
  return (
    typeof productId === "string" &&
    esEntero(qty) &&
    qty >= 1 &&
    esEntero(precio) &&
    precio >= 0
  );
}

function pagoValido(valor: unknown): valor is PagoEditable {
  if (!esObjeto(valor)) return false;
  const medio = valor["medio"];
  const monto = valor["monto_centavos"];
  return esMedio(medio) && esEntero(monto) && monto >= 1;
}

export function totalCentavos(lineas: readonly LineaEditable[]): number {
  return lineas.reduce((total, linea) => total + linea.qty * linea.precio_centavos, 0);
}

export function edicionDePayload(payload: unknown): EdicionVenta {
  if (!esObjeto(payload)) return { lineas: [], pagos: [] };
  const crudas = payload["lineas"];
  if (!Array.isArray(crudas)) return { lineas: [], pagos: [] };
  const lineas = crudas.filter(lineaValida);
  if (lineas.length === 0) return { lineas: [], pagos: [] };

  const crudosPagos = payload["pagos"];
  if (Array.isArray(crudosPagos) && crudosPagos.length > 0) {
    const pagos = crudosPagos.filter(pagoValido);
    if (pagos.length === crudosPagos.length) {
      return {
        lineas,
        pagos: pagos.map((pago) => ({ medio: pago.medio, monto_centavos: pago.monto_centavos })),
      };
    }
  }

  const medio = esMedio(payload["medio"]) ? payload["medio"] : "Efectivo";
  return { lineas, pagos: [{ medio, monto_centavos: totalCentavos(lineas) }] };
}

export function payloadCorregido(
  payload: unknown,
  edicion: EdicionVenta,
): Record<string, unknown> {
  if (!esObjeto(payload)) return {};
  const originales = Array.isArray(payload["lineas"]) ? payload["lineas"] : [];
  const lineas = edicion.lineas.map((linea, indice) => {
    const original = originales[indice];
    return {
      ...(esObjeto(original) ? original : {}),
      product_id: linea.product_id,
      qty: linea.qty,
      precio_centavos: linea.precio_centavos,
    };
  });
  return {
    ...payload,
    lineas,
    pagos: edicion.pagos.map((pago) => ({
      medio: pago.medio,
      monto_centavos: pago.monto_centavos,
    })),
  };
}

export function pagosSuman(edicion: EdicionVenta): boolean {
  if (edicion.pagos.length === 0) return false;
  const suma = edicion.pagos.reduce((total, pago) => total + pago.monto_centavos, 0);
  return suma === totalCentavos(edicion.lineas);
}
