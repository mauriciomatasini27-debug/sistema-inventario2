import { formatARS } from "../sales/ticket_render.js";
import type { NombreHerramienta } from "./asistente.js";

export interface Cifra {
  readonly etiqueta: string;
  readonly valor: string;
}

type Registro = Record<string, unknown>;

function esRegistro(valor: unknown): valor is Registro {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}

function texto(valor: unknown): string | null {
  return typeof valor === "string" && valor.trim() !== "" ? valor : null;
}

function entero(valor: unknown): number | null {
  return typeof valor === "number" && Number.isSafeInteger(valor) ? valor : null;
}

function centavos(valor: unknown): bigint | null {
  if (typeof valor === "bigint") return valor;
  if (typeof valor === "number" && Number.isSafeInteger(valor)) return BigInt(valor);
  if (typeof valor === "string" && /^-?\d+$/.test(valor.trim())) {
    try {
      return BigInt(valor.trim());
    } catch (error) {
      console.warn("[ia/cifras] centavos inválidos", error);
      return null;
    }
  }
  return null;
}

function moneda(valor: unknown): string | null {
  const numero = centavos(valor);
  return numero === null ? null : formatARS(numero);
}

function agregar(lista: Cifra[], etiqueta: string, valor: string | null): void {
  if (valor !== null) lista.push({ etiqueta, valor });
}

function cifrasCaja(datos: Registro): Cifra[] {
  const cifras: Cifra[] = [];
  agregar(cifras, "Total en caja", moneda(datos["totalCentavos"]));
  const porMedio = datos["porMedio"];
  if (esRegistro(porMedio)) {
    for (const [medio, valor] of Object.entries(porMedio)) {
      agregar(cifras, medio, moneda(valor));
    }
  }
  return cifras;
}

function cifrasVentas(datos: Registro): Cifra[] {
  const cifras: Cifra[] = [];
  agregar(cifras, "Ventas del mes", moneda(datos["ventasMesCentavos"]));
  const tickets = entero(datos["ticketsHoy"]);
  agregar(cifras, "Tickets hoy", tickets === null ? null : String(tickets));
  return cifras;
}

function cifrasDeudores(datos: unknown): Cifra[] {
  if (!Array.isArray(datos)) return [];
  const cifras: Cifra[] = [];
  for (const item of datos) {
    if (!esRegistro(item)) continue;
    const nombre = texto(item["nombre"]);
    const saldo = moneda(item["saldoCentavos"]);
    if (nombre !== null && saldo !== null) cifras.push({ etiqueta: nombre, valor: saldo });
  }
  return cifras;
}

function cifrasStock(datos: unknown): Cifra[] {
  if (!Array.isArray(datos)) return [];
  const cifras: Cifra[] = [];
  for (const item of datos) {
    if (!esRegistro(item)) continue;
    const nombre = texto(item["nombre"]);
    const stock = entero(item["stock"]);
    if (nombre !== null && stock !== null) cifras.push({ etiqueta: nombre, valor: String(stock) });
  }
  return cifras;
}

function cifrasPorVencer(datos: unknown): Cifra[] {
  if (!Array.isArray(datos)) return [];
  const cifras: Cifra[] = [];
  for (const item of datos) {
    if (!esRegistro(item)) continue;
    const sku = texto(item["sku"]);
    const dias = entero(item["dias"]);
    if (sku !== null && dias !== null) cifras.push({ etiqueta: sku, valor: `${dias} días` });
  }
  return cifras;
}

export function cifrasDeHerramienta(
  herramienta: NombreHerramienta,
  datos: unknown,
): Cifra[] {
  switch (herramienta) {
    case "caja_dia":
      return esRegistro(datos) ? cifrasCaja(datos) : [];
    case "ventas_periodo":
      return esRegistro(datos) ? cifrasVentas(datos) : [];
    case "deudores":
      return cifrasDeudores(datos);
    case "stock_bajo":
      return cifrasStock(datos);
    case "por_vencer":
      return cifrasPorVencer(datos);
    default:
      return [];
  }
}
