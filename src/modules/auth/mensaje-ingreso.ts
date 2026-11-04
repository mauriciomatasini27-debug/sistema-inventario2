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
