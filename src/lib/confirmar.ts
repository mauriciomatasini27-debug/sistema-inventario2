export interface OpcionesTextoConfirmar {
  titulo: string;
  mensaje: string;
  accion?: string;
  nombreRequerido?: string;
}

export interface TextosConfirmar {
  titulo: string;
  mensaje: string;
  accion: string;
  nombreRequerido: string | null;
  ayudaNombre: string;
}

export function normalizarNombre(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

export function puedeConfirmar(tipeado: string, esperado: string): boolean {
  const objetivo = normalizarNombre(esperado);
  if (objetivo === "") return true;
  return normalizarNombre(tipeado) === objetivo;
}

export function textosConfirmar(opciones: OpcionesTextoConfirmar): TextosConfirmar {
  const requerido = (opciones.nombreRequerido ?? "").trim();
  const nombreRequerido = requerido === "" ? null : requerido;
  return {
    titulo: opciones.titulo,
    mensaje: opciones.mensaje,
    accion: (opciones.accion ?? "").trim() || "Confirmar",
    nombreRequerido,
    ayudaNombre: nombreRequerido === null ? "" : "Escribí “" + nombreRequerido + "” para confirmar.",
  };
}
