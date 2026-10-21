export type MotivoPesos = "vacio" | "invalido" | "negativo" | "decimales";

export type ResultadoPesos =
  | { readonly ok: true; readonly centavos: number }
  | { readonly ok: false; readonly motivo: MotivoPesos };

const TOPE_CENTAVOS = 999_999_999;

function agruparEntero(texto: string): string | null {
  if (!texto.includes(".")) return /^\d+$/.test(texto) ? texto : null;
  const grupos = texto.split(".");
  const primero = grupos[0];
  if (primero === undefined || !/^\d{1,3}$/.test(primero)) return null;
  for (const grupo of grupos.slice(1)) {
    if (!/^\d{3}$/.test(grupo)) return null;
  }
  return grupos.join("");
}

function conTope(digitosCentavos: string): ResultadoPesos {
  const centavos = Number(digitosCentavos);
  if (!Number.isSafeInteger(centavos) || centavos > TOPE_CENTAVOS) {
    return { ok: false, motivo: "invalido" };
  }
  return { ok: true, centavos };
}

export function parsearPesos(texto: string): ResultadoPesos {
  let limpio = texto.trim();
  if (limpio === "") return { ok: false, motivo: "vacio" };
  if (limpio.startsWith("$")) limpio = limpio.slice(1).trimStart();
  if (limpio.startsWith("-")) return { ok: false, motivo: "negativo" };
  if (!/^[0-9.,]+$/.test(limpio)) return { ok: false, motivo: "invalido" };

  const comas = limpio.split(",").length - 1;
  if (comas > 1) return { ok: false, motivo: "invalido" };

  if (comas === 1) {
    const [entero, decimales] = limpio.split(",");
    if (entero === undefined || decimales === undefined || decimales === "") {
      return { ok: false, motivo: "invalido" };
    }
    if (!/^\d+$/.test(decimales)) return { ok: false, motivo: "invalido" };
    if (decimales.length > 2) return { ok: false, motivo: "decimales" };
    const digitos = agruparEntero(entero);
    if (digitos === null) return { ok: false, motivo: "invalido" };
    return conTope(digitos + decimales.padEnd(2, "0"));
  }

  if (limpio.includes(".")) {
    const puntos = limpio.split(".").length - 1;
    if (puntos === 1) {
      const [entero, decimales] = limpio.split(".");
      if (entero === undefined || decimales === undefined) return { ok: false, motivo: "invalido" };
      if (decimales.length === 1 || decimales.length === 2) {
        if (!/^\d+$/.test(entero) || !/^\d{1,2}$/.test(decimales)) {
          return { ok: false, motivo: "invalido" };
        }
        return conTope(entero + decimales.padEnd(2, "0"));
      }
    }
    const digitos = agruparEntero(limpio);
    if (digitos === null) return { ok: false, motivo: "invalido" };
    return conTope(digitos + "00");
  }

  return conTope(limpio + "00");
}

const MONEDA = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" });

function normalizarEspacios(texto: string): string {
  return texto.replace(/[\u00a0\u202f]/g, " ");
}

export function formatearPesos(centavos: number | bigint | string): string {
  const numero = Number(centavos);
  const valor = Number.isFinite(numero) ? numero / 100 : 0;
  return normalizarEspacios(MONEDA.format(valor));
}

export function pesosParaInput(centavos: number | bigint | string | null): string {
  if (centavos === null) return "";
  const numero = Number(centavos);
  if (!Number.isFinite(numero)) return "";
  return (numero / 100).toFixed(2).replace(".", ",");
}

export function mensajePesos(motivo: MotivoPesos): string {
  switch (motivo) {
    case "vacio":
      return "Escribí un monto";
    case "negativo":
      return "El monto no puede ser negativo";
    case "decimales":
      return "Usá hasta 2 decimales, con coma (ej. 1.234,50)";
    case "invalido":
      return "Monto inválido, ej. 1.234,50";
  }
}
