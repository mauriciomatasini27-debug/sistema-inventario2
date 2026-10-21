export type ErroresCampo = Record<string, string>;

export type Regla =
  | { tipo: "requerido" }
  | { tipo: "entero_min"; min: number }
  | { tipo: "cuit" }
  | { tipo: "email" }
  | { tipo: "telefono" }
  | { tipo: "fecha" }
  | { tipo: "monto" }
  | { tipo: "porcentaje" };

export const REQUERIDO: Regla = { tipo: "requerido" };
export const CUIT: Regla = { tipo: "cuit" };
export const EMAIL: Regla = { tipo: "email" };
export const TELEFONO: Regla = { tipo: "telefono" };
export const FECHA: Regla = { tipo: "fecha" };
export const MONTO: Regla = { tipo: "monto" };
export const PORCENTAJE: Regla = { tipo: "porcentaje" };

export function enteroMin(min: number): Regla {
  return { tipo: "entero_min", min };
}

const ETIQUETAS_CAMPO: Readonly<Record<string, string>> = {
  cuit: "el CUIT",
  supplier_cuit: "el CUIT",
  nombre: "el nombre",
  nombre_comercio: "el nombre del comercio",
  rubro: "el rubro",
  email: "el email",
  telefono: "el teléfono",
  numero: "el celular",
  monto: "el monto",
  monto_centavos: "el monto",
  costo_centavos: "el costo",
  precio_centavos: "el precio",
  cantidad: "la cantidad",
  qty: "la cantidad",
  sku: "el SKU",
  cliente: "el cliente",
  customer_id: "el cliente",
  fecha: "la fecha",
  vence_el: "la fecha de vencimiento",
  porcentaje: "el porcentaje",
  min_stock: "el stock mínimo",
  reorder_qty: "la cantidad a reponer",
  bill_id: "la factura",
};

export function etiquetaDe(campo: string): string {
  return ETIQUETAS_CAMPO[campo] ?? campo.replace(/_/g, " ");
}

export function mensajeCampo(campo: string, regla: Regla): string {
  switch (regla.tipo) {
    case "requerido":
      return `Poné ${etiquetaDe(campo)}.`;
    case "entero_min":
      return regla.min > 0
        ? `Poné un número entero de ${regla.min} para arriba.`
        : "Poné un número entero desde 0.";
    case "cuit":
      return "Escribí el CUIT con 11 dígitos, sin guiones ni espacios.";
    case "email":
      return "Escribí un email válido, con arroba y dominio.";
    case "telefono":
      return "Escribí el celular con código de área, por ejemplo 11 5555-1234.";
    case "fecha":
      return "Elegí una fecha válida, por ejemplo 2026-10-17.";
    case "monto":
      return "Poné un monto mayor a 0.";
    case "porcentaje":
      return "Poné un porcentaje mayor a 0, por ejemplo 10.";
  }
}

const RX_FALTANTE = /received undefined|required|requerid/i;
const RX_CUIT = /cuit/i;
const RX_EMAIL = /email|correo/i;
const RX_TELEFONO = /telefono|celular|whatsapp|tel[eé]fono/i;
const RX_FECHA = /fecha|venc|date|datetime/i;
const RX_PORCENTAJE = /porcentaje/i;
const RX_MONTO = /monto|importe|precio|costo|centavos|saldo|total/i;
const RX_MONTO_POSITIVO = /to be >0|greater than 0|positiv/i;
const RX_ENTERO_NOMBRE = /cantidad|qty|stock|reorder|dias|d[ií]as|entero/i;
const RX_ENTERO_MENSAJE = /expected int|integer|to be >=0(?:\D|$)/i;
const RX_MINIMO = /to be >=(\d+(?:\.\d+)?)/i;
const RX_TEXTO_CORTO = /to have >=/i;

export function reglaDeCampo(campo: string, mensajeZod = ""): Regla | null {
  if (RX_FALTANTE.test(mensajeZod)) return { tipo: "requerido" };
  if (RX_CUIT.test(campo) || RX_CUIT.test(mensajeZod)) return { tipo: "cuit" };
  if (RX_EMAIL.test(campo) || RX_EMAIL.test(mensajeZod)) return { tipo: "email" };
  if (RX_TELEFONO.test(campo) || RX_TELEFONO.test(mensajeZod)) return { tipo: "telefono" };
  if (RX_FECHA.test(campo) || RX_FECHA.test(mensajeZod)) return { tipo: "fecha" };
  if (RX_PORCENTAJE.test(campo)) return { tipo: "porcentaje" };
  const minimo = RX_MINIMO.exec(mensajeZod);
  if (minimo) {
    const n = Number(minimo[1]);
    return Number.isInteger(n) ? { tipo: "entero_min", min: n } : { tipo: "monto" };
  }
  if (RX_ENTERO_NOMBRE.test(campo) || RX_ENTERO_MENSAJE.test(mensajeZod)) return { tipo: "entero_min", min: 1 };
  if (RX_MONTO.test(campo) || RX_MONTO_POSITIVO.test(mensajeZod)) return { tipo: "monto" };
  if (RX_TEXTO_CORTO.test(mensajeZod)) return { tipo: "requerido" };
  return null;
}

function esObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === "object" && valor !== null;
}

function extraerFieldErrors(error: unknown): Record<string, unknown> {
  let raiz: unknown = error;
  if (esObjeto(raiz) && "error" in raiz) raiz = raiz.error;
  if (!esObjeto(raiz)) return {};
  const fieldErrors = raiz.fieldErrors;
  return esObjeto(fieldErrors) ? fieldErrors : {};
}

export function erroresDesdeZod(error: unknown, etiquetas: Readonly<Record<string, string>> = {}): ErroresCampo {
  const salida: ErroresCampo = {};
  for (const [campo, valor] of Object.entries(extraerFieldErrors(error))) {
    const mensajes = Array.isArray(valor)
      ? valor.filter((m): m is string => typeof m === "string" && m.length > 0)
      : typeof valor === "string" && valor.length > 0
        ? [valor]
        : [];
    const regla = reglaDeCampo(campo, mensajes[0] ?? "");
    salida[campo] = regla ? mensajeCampo(campo, regla) : `Revisá ${etiquetas[campo] ?? etiquetaDe(campo)}.`;
  }
  return salida;
}
