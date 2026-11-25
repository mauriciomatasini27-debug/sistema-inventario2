// PROTOTIPO — calculadora Costo + Porcentaje de recargo → Precio de venta.
// Espejo en números (no bigint) de src/modules/pricing/precios.ts
// (precioDesdeMarkup) + src/modules/pricing/redondeo.ts. Código de un solo
// uso: sirve para validar la interacción, NO es el cálculo real de producción.

// Paso de redondeo en centavos: $1 / $10 / $50 / $100 (defecto $10), techo.
export const PASOS = [
  { etiqueta: "$1", centavos: 100 },
  { etiqueta: "$10", centavos: 1000 },
  { etiqueta: "$50", centavos: 5000 },
  { etiqueta: "$100", centavos: 10000 },
];

export const PASO_DEFECTO = 1000;
export const MARKUP_DEFECTO = 30; // % de fábrica (rango 0,01–1000).

// Techo al paso (dirección "arriba"): el kiosco nunca cobra de menos.
export function redondearArriba(centavos, paso) {
  if (!Number.isFinite(centavos) || centavos < 0) return 0;
  const resto = centavos % paso;
  if (resto === 0) return centavos;
  return centavos + (paso - resto);
}

// costo × (1 + markup/100), mitad-arriba, redondeado arriba al paso.
export function precioDesdeCosto(costoCentavos, markupPct, pasoCentavos) {
  const bp = Math.round(markupPct * 100); // 30,5% → 3050 bp
  const bruto = Math.floor((costoCentavos * (10000 + bp) + 5000) / 10000);
  return redondearArriba(bruto, pasoCentavos);
}

// Porcentaje derivado (para mostrar el recargo/margen de un precio manual).
export function markupDesdeCostoYPrecio(costoCentavos, precioCentavos) {
  if (!costoCentavos || costoCentavos <= 0) return null;
  return Math.round(((precioCentavos - costoCentavos) / costoCentavos) * 100);
}

export function formatearPesos(centavos) {
  const n = Math.round(Number(centavos) || 0);
  return "$" + (n / 100).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// "1.234,50" (coma decimal) como usa el input de pesos del repo.
export function pesosParaInput(centavos) {
  const n = Math.round(Number(centavos) || 0);
  return (n / 100).toFixed(2).replace(".", ",");
}

// Convierte un texto tipo "1.234,50" a centavos enteros. null si no es válido.
export function parsearPesos(texto) {
  const limpio = String(texto ?? "").trim().replace(/\./g, "").replace(",", ".");
  if (limpio === "") return null;
  const n = Number(limpio);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}
