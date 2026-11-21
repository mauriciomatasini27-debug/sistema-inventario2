// P1-55: la landing lee ingreso/mensaje del callback; sin esto el fallo
// parece un "a veces no funciona" mudo.
export function mensajeIngresoLanding(search: URLSearchParams): string | null {
  const ingreso = search.get("ingreso");
  if (ingreso !== "error" && ingreso !== "cancelado") return null;
  const crudo = search.get("mensaje");
  if (!crudo) {
    return ingreso === "cancelado"
      ? "Cancelaste el ingreso con Google."
      : "No se pudo completar el ingreso. Volvé a intentarlo.";
  }
  try {
    return decodeURIComponent(crudo);
  } catch {
    return crudo;
  }
}

// Abuso o tipo desconocido: neutro, sin mencionar pagos.
export const MENSAJE_LOGIN_SUSPENDIDO_NEUTRO = "Tu cuenta está suspendida. Escribinos para más información.";

// CP-S5: texto que ve el Dueño o empleado de un comercio suspendido al entrar.
export const MENSAJE_LOGIN_SUSPENDIDO =
  "Tu cuenta está suspendida por falta de pago. Escribinos para regularizarla.";
