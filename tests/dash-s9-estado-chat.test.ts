import { describe, expect, it } from "vitest";
import {
  MENSAJE_SERVIDOR,
  MENSAJE_SIN_CONEXION,
  MENSAJE_TIMEOUT,
  transicion,
  vistaChat,
  type EstadoChat,
  type RespuestaChat,
} from "../src/lib/asistente-chat.js";

const RESPUESTA: RespuestaChat = {
  texto: "Hay $ 2.500,00 en caja.",
  rechazada: false,
  cifras: [{ etiqueta: "Total en caja", valor: "$ 2.500,00" }],
  reporte: { href: "/panel/caja", etiqueta: "caja" },
};

const PREGUNTA = "¿Cuánto hay en caja?";

function enviando(pregunta = PREGUNTA): EstadoChat {
  return transicion({ tipo: "inactivo" }, { tipo: "enviar", pregunta });
}

describe("DASH-S9 máquina de estados del chat", () => {
  it("inactivo + enviar pasa a enviando con la pregunta recortada", () => {
    expect(transicion({ tipo: "inactivo" }, { tipo: "enviar", pregunta: `  ${PREGUNTA}  ` })).toEqual({
      tipo: "enviando",
      pregunta: PREGUNTA,
    });
  });

  it("inactivo ignora una pregunta vacía", () => {
    const estado: EstadoChat = { tipo: "inactivo" };
    expect(transicion(estado, { tipo: "enviar", pregunta: "   " })).toBe(estado);
  });

  it("enviando ignora un segundo envío (doble envío)", () => {
    const estado = enviando();
    expect(transicion(estado, { tipo: "enviar", pregunta: "otra" })).toBe(estado);
    expect(estado).toEqual({ tipo: "enviando", pregunta: PREGUNTA });
  });

  it("respuesta_ok lleva a respondiendo con la respuesta", () => {
    const estado = transicion(enviando(), { tipo: "respuesta_ok", respuesta: RESPUESTA });
    expect(estado).toEqual({ tipo: "respondiendo", pregunta: PREGUNTA, respuesta: RESPUESTA });
  });

  it("respondiendo permite enviar otra pregunta", () => {
    const respondiendo = transicion(enviando(), { tipo: "respuesta_ok", respuesta: RESPUESTA });
    expect(transicion(respondiendo, { tipo: "enviar", pregunta: "¿Quién me debe más?" })).toEqual({
      tipo: "enviando",
      pregunta: "¿Quién me debe más?",
    });
  });

  it("error de red guarda la pregunta y un mensaje reintentable", () => {
    expect(transicion(enviando(), { tipo: "error_red" })).toEqual({
      tipo: "error",
      pregunta: PREGUNTA,
      mensaje: MENSAJE_SIN_CONEXION,
      reintentable: true,
    });
  });

  it("timeout guarda su mensaje reintentable", () => {
    expect(transicion(enviando(), { tipo: "timeout" })).toEqual({
      tipo: "error",
      pregunta: PREGUNTA,
      mensaje: MENSAJE_TIMEOUT,
      reintentable: true,
    });
  });

  it("error del servidor guarda su mensaje reintentable", () => {
    expect(transicion(enviando(), { tipo: "error_servidor" })).toEqual({
      tipo: "error",
      pregunta: PREGUNTA,
      mensaje: MENSAJE_SERVIDOR,
      reintentable: true,
    });
  });

  it("no_configurado es un error no reintentable con su explicación", () => {
    expect(
      transicion(enviando(), {
        tipo: "no_configurado",
        mensaje: "El asistente IA todavía no está configurado.",
      }),
    ).toEqual({
      tipo: "error",
      pregunta: PREGUNTA,
      mensaje: "El asistente IA todavía no está configurado.",
      reintentable: false,
    });
  });

  it("reintentar desde un error reintentable vuelve a enviando con la misma pregunta", () => {
    const error = transicion(enviando(), { tipo: "error_red" });
    expect(transicion(error, { tipo: "reintentar" })).toEqual({ tipo: "enviando", pregunta: PREGUNTA });
  });

  it("reintentar desde un error no reintentable se ignora", () => {
    const error = transicion(enviando(), { tipo: "no_configurado", mensaje: "No configurado." });
    expect(transicion(error, { tipo: "reintentar" })).toBe(error);
  });

  it("respuesta_sin_cupo es terminal en la sesión de la página", () => {
    const sinCupo = transicion(enviando(), {
      tipo: "respuesta_sin_cupo",
      mensaje: "Llegaste al cupo del mes. Se reinicia el 1/11.",
      reinicia_el: "2026-11-01",
    });
    expect(sinCupo).toEqual({
      tipo: "sin_cupo",
      mensaje: "Llegaste al cupo del mes. Se reinicia el 1/11.",
      reinicia_el: "2026-11-01",
    });
    expect(transicion(sinCupo, { tipo: "enviar", pregunta: PREGUNTA })).toBe(sinCupo);
    expect(transicion(sinCupo, { tipo: "reintentar" })).toBe(sinCupo);
    expect(transicion(sinCupo, { tipo: "respuesta_ok", respuesta: RESPUESTA })).toBe(sinCupo);
  });

  it("cupo_agotado al abrir lleva a sin_cupo con la fecha de reinicio", () => {
    expect(
      transicion(
        { tipo: "inactivo" },
        { tipo: "cupo_agotado", mensaje: "Llegaste al cupo del mes. Se reinicia el 1/11.", reinicia_el: "2026-11-01" },
      ),
    ).toEqual({
      tipo: "sin_cupo",
      mensaje: "Llegaste al cupo del mes. Se reinicia el 1/11.",
      reinicia_el: "2026-11-01",
    });
  });

  it("los eventos que no aplican dejan el estado igual", () => {
    const inactivo: EstadoChat = { tipo: "inactivo" };
    for (const evento of [
      { tipo: "respuesta_ok", respuesta: RESPUESTA },
      { tipo: "error_red" },
      { tipo: "timeout" },
      { tipo: "error_servidor" },
      { tipo: "no_configurado", mensaje: "x" },
      { tipo: "reintentar" },
    ] as const) {
      expect(transicion(inactivo, evento)).toBe(inactivo);
    }

    const respondiendo = transicion(enviando(), { tipo: "respuesta_ok", respuesta: RESPUESTA });
    for (const evento of [{ tipo: "error_red" }, { tipo: "timeout" }, { tipo: "reintentar" }] as const) {
      expect(transicion(respondiendo, evento)).toBe(respondiendo);
    }
  });
});

describe("DASH-S9 vista derivada del chat", () => {
  it("inactivo puede enviar y no está ocupado", () => {
    expect(vistaChat({ tipo: "inactivo" })).toEqual({
      puedeEnviar: true,
      mostrarReintentar: false,
      mensaje: "",
      ocupado: false,
    });
  });

  it("enviando no puede enviar, está ocupado y no muestra reintentar", () => {
    expect(vistaChat(enviando())).toEqual({
      puedeEnviar: false,
      mostrarReintentar: false,
      mensaje: "",
      ocupado: true,
    });
  });

  it("respondiendo puede volver a enviar", () => {
    const respondiendo = transicion(enviando(), { tipo: "respuesta_ok", respuesta: RESPUESTA });
    expect(vistaChat(respondiendo)).toEqual({
      puedeEnviar: true,
      mostrarReintentar: false,
      mensaje: "",
      ocupado: false,
    });
  });

  it("error reintentable muestra el mensaje y el botón", () => {
    const error = transicion(enviando(), { tipo: "error_red" });
    expect(vistaChat(error)).toEqual({
      puedeEnviar: true,
      mostrarReintentar: true,
      mensaje: MENSAJE_SIN_CONEXION,
      ocupado: false,
    });
  });

  it("error no reintentable muestra el mensaje sin botón", () => {
    const error = transicion(enviando(), { tipo: "no_configurado", mensaje: "No configurado." });
    expect(vistaChat(error)).toEqual({
      puedeEnviar: true,
      mostrarReintentar: false,
      mensaje: "No configurado.",
      ocupado: false,
    });
  });

  it("sin_cupo no puede enviar ni reintentar y muestra la explicación", () => {
    const sinCupo = transicion(enviando(), {
      tipo: "respuesta_sin_cupo",
      mensaje: "Llegaste al cupo del mes. Se reinicia el 1/11.",
      reinicia_el: "2026-11-01",
    });
    expect(vistaChat(sinCupo)).toEqual({
      puedeEnviar: false,
      mostrarReintentar: false,
      mensaje: "Llegaste al cupo del mes. Se reinicia el 1/11.",
      ocupado: false,
    });
  });
});
