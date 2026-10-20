// DASH-S9 (PRD-DASH-01, ADR-0038): máquina de estados del chat del drawer.
// Pura: sin DOM, sin red y sin reloj. El script del drawer es el único que
// traduce fetch, AbortController y aria a estos eventos.

export interface CifraChat {
  readonly etiqueta: string;
  readonly valor: string;
}

export interface ReporteChat {
  readonly href: string;
  readonly etiqueta: string;
}

export interface RespuestaChat {
  readonly texto: string;
  readonly rechazada: boolean;
  readonly fueraDeCatalogo?: boolean | undefined;
  readonly cifras?: ReadonlyArray<CifraChat> | undefined;
  readonly reporte?: ReporteChat | undefined;
}

export type EstadoChat =
  | { readonly tipo: "inactivo" }
  | { readonly tipo: "enviando"; readonly pregunta: string }
  | {
      readonly tipo: "respondiendo";
      readonly pregunta: string;
      readonly respuesta: RespuestaChat;
    }
  | {
      readonly tipo: "error";
      readonly pregunta: string;
      readonly mensaje: string;
      readonly reintentable: boolean;
    }
  | {
      readonly tipo: "sin_cupo";
      readonly mensaje: string;
      readonly reinicia_el: string | null;
    };

export type EventoChat =
  | { readonly tipo: "enviar"; readonly pregunta: string }
  | { readonly tipo: "respuesta_ok"; readonly respuesta: RespuestaChat }
  | {
      readonly tipo: "respuesta_sin_cupo";
      readonly mensaje: string;
      readonly reinicia_el: string | null;
    }
  | {
      readonly tipo: "cupo_agotado";
      readonly mensaje: string;
      readonly reinicia_el: string | null;
    }
  | { readonly tipo: "error_red" }
  | { readonly tipo: "timeout" }
  | { readonly tipo: "error_servidor" }
  | { readonly tipo: "no_configurado"; readonly mensaje: string }
  | { readonly tipo: "fuera_de_plan"; readonly mensaje: string }
  | { readonly tipo: "reintentar" };

export const MENSAJE_SIN_CONEXION = "Sin conexión. Revisá internet y reintentá.";
export const MENSAJE_TIMEOUT = "El asistente no respondió a tiempo.";
export const MENSAJE_SERVIDOR = "El servidor no pudo responder. Reintentá en un rato.";
export const MENSAJE_NO_CONFIGURADO = "El asistente IA todavía no está configurado.";

function error(estado: EstadoChat, mensaje: string, reintentable: boolean): EstadoChat {
  if (estado.tipo !== "enviando") return estado;
  return { tipo: "error", pregunta: estado.pregunta, mensaje, reintentable };
}

export function transicion(estado: EstadoChat, evento: EventoChat): EstadoChat {
  switch (evento.tipo) {
    case "enviar": {
      if (estado.tipo === "enviando" || estado.tipo === "sin_cupo") return estado;
      const pregunta = evento.pregunta.trim();
      if (pregunta === "") return estado;
      return { tipo: "enviando", pregunta };
    }
    case "respuesta_ok": {
      if (estado.tipo !== "enviando") return estado;
      return { tipo: "respondiendo", pregunta: estado.pregunta, respuesta: evento.respuesta };
    }
    case "respuesta_sin_cupo": {
      if (estado.tipo !== "enviando") return estado;
      return { tipo: "sin_cupo", mensaje: evento.mensaje, reinicia_el: evento.reinicia_el };
    }
    case "cupo_agotado": {
      if (estado.tipo === "sin_cupo") return estado;
      return { tipo: "sin_cupo", mensaje: evento.mensaje, reinicia_el: evento.reinicia_el };
    }
    case "error_red":
      return error(estado, MENSAJE_SIN_CONEXION, true);
    case "timeout":
      return error(estado, MENSAJE_TIMEOUT, true);
    case "error_servidor":
      return error(estado, MENSAJE_SERVIDOR, true);
    case "no_configurado":
      return error(estado, evento.mensaje || MENSAJE_NO_CONFIGURADO, false);
    case "fuera_de_plan":
      return error(estado, evento.mensaje, false);
    case "reintentar": {
      if (estado.tipo !== "error" || !estado.reintentable) return estado;
      return { tipo: "enviando", pregunta: estado.pregunta };
    }
  }
}

export interface VistaChat {
  readonly puedeEnviar: boolean;
  readonly mostrarReintentar: boolean;
  readonly mensaje: string;
  readonly ocupado: boolean;
}

export function vistaChat(estado: EstadoChat): VistaChat {
  switch (estado.tipo) {
    case "inactivo":
      return { puedeEnviar: true, mostrarReintentar: false, mensaje: "", ocupado: false };
    case "enviando":
      return { puedeEnviar: false, mostrarReintentar: false, mensaje: "", ocupado: true };
    case "respondiendo":
      return { puedeEnviar: true, mostrarReintentar: false, mensaje: "", ocupado: false };
    case "error":
      return {
        puedeEnviar: true,
        mostrarReintentar: estado.reintentable,
        mensaje: estado.mensaje,
        ocupado: false,
      };
    case "sin_cupo":
      return { puedeEnviar: false, mostrarReintentar: false, mensaje: estado.mensaje, ocupado: false };
  }
}
