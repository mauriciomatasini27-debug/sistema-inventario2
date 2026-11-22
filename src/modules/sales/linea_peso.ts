import { esCantidadValida, MAX_GRAMOS } from "../../lib/cantidades.js";
import { formatearPesos } from "../../lib/pesos.js";

export { esCantidadValida, MAX_GRAMOS } from "../../lib/cantidades.js";

export type MotivoPeso = "vacio" | "cero" | "negativo" | "decimales" | "invalido" | "excede_maximo";

export type ResultadoGramos =
  | { readonly ok: true; readonly gramos: number }
  | { readonly ok: false; readonly motivo: MotivoPeso };

function digitosDelEntero(texto: string): string | null {
  if (/^\d+$/.test(texto)) return texto;
  const grupos = texto.split(".");
  // P10-94 [tenant]: 1000 kg = 1_000_000 g es válido, así que la parte entera admite 4 dígitos.
  if (grupos[0] === undefined || !/^\d{1,4}$/.test(grupos[0])) return null;
  for (const grupo of grupos.slice(1)) {
    if (!/^\d{3}$/.test(grupo)) return null;
  }
  return grupos.join("");
}

function separar(texto: string, indice: number): [string, string] {
  return [texto.slice(0, indice), texto.slice(indice + 1)];
}

export function convertirKgAGramos(texto: string): ResultadoGramos {
  let limpio = texto.trim().replace(/[\u00a0\u202f]/g, "");
  if (limpio.startsWith("$")) limpio = limpio.slice(1).trimStart();
  if (limpio === "") return { ok: false, motivo: "vacio" };
  if (limpio.startsWith("-")) return { ok: false, motivo: "negativo" };
  if (!/^[0-9.,]+$/.test(limpio)) return { ok: false, motivo: "invalido" };

  const coma = limpio.lastIndexOf(",");
  const punto = limpio.lastIndexOf(".");
  let entero: string;
  let decimales: string;
  if (coma >= 0 && punto >= 0) {
    const usaComa = coma > punto;
    [entero, decimales] = separar(limpio, usaComa ? coma : punto);
    if (entero.includes(usaComa ? "," : ".")) return { ok: false, motivo: "invalido" };
  } else if (coma >= 0) {
    [entero, decimales] = separar(limpio, coma);
  } else if (punto >= 0) {
    [entero, decimales] = separar(limpio, punto);
  } else {
    entero = limpio;
    decimales = "";
  }

  if (decimales.length > 3) return { ok: false, motivo: "decimales" };
  if (decimales !== "" && !/^\d+$/.test(decimales)) return { ok: false, motivo: "invalido" };
  const digitos = digitosDelEntero(entero);
  if (digitos === null) return { ok: false, motivo: "invalido" };

  const gramos = Number(digitos) * 1000 + Number(decimales.padEnd(3, "0"));
  if (!Number.isSafeInteger(gramos)) return { ok: false, motivo: "excede_maximo" };
  if (gramos === 0) return { ok: false, motivo: "cero" };
  if (gramos > MAX_GRAMOS) return { ok: false, motivo: "excede_maximo" };
  return { ok: true, gramos };
}

export function subtotalPorPeso(gramos: number | bigint, centavosPorKg: number | bigint): bigint {
  return (BigInt(gramos) * BigInt(centavosPorKg) + 500n) / 1000n;
}

export function subtotalLinea(cantidad: number, precioCentavos: number | bigint, porPeso: boolean | undefined): bigint {
  return porPeso === true ? subtotalPorPeso(cantidad, precioCentavos) : BigInt(cantidad) * BigInt(precioCentavos);
}

export function formatearKilogramos(gramos: number): string {
  return `${Math.floor(gramos / 1000)},${String(gramos % 1000).padStart(3, "0")}`;
}

export function descripcionLineaPeso(gramos: number, centavosPorKg: number): string {
  return `${formatearKilogramos(gramos)} kg × ${formatearPesos(centavosPorKg)}/kg = ${formatearPesos(subtotalPorPeso(gramos, centavosPorKg))}`;
}

export function mensajeErrorPeso(motivo: MotivoPeso): string {
  switch (motivo) {
    case "vacio":
      return "Escribí el peso en kilogramos";
    case "cero":
      return "El peso tiene que ser mayor a cero";
    case "negativo":
      return "El peso no puede ser negativo";
    case "decimales":
      return "Usá hasta 3 decimales para el peso (ej. 1,250)";
    case "invalido":
      return "Peso inválido, ej. 1,250 kg";
    case "excede_maximo":
      return `El peso no puede superar los ${formatearKilogramos(MAX_GRAMOS)} kg`;
  }
}
