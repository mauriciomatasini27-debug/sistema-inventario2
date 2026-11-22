// WA-BOTONES-1: los botones de la alerta de stock bajo se reconocen tanto por
// id (mensaje interactivo, dentro de la ventana de 24 h) como por etiqueta
// (quick reply de plantilla, que llega como type "button" y sin payload).
import { describe, expect, it } from "vitest";
import { parsear_boton_alerta, texto_de_boton_alerta } from "../src/modules/whatsapp/boton-alerta.js";
import { normalizarBotonEntrada } from "../src/modules/whatsapp/transport.js";

function sobreBoton(payload: Record<string, unknown>): Record<string, unknown> {
  return {
    entry: [{ changes: [{ value: { messages: [{ from: "5493513592875", id: "wamid.1", timestamp: "1763800000", ...payload }] } }] }],
  };
}

describe("parsear_boton_alerta", () => {
  it("reconoce los ids que arma alertas.ts", () => {
    expect(parsear_boton_alerta("ver_pedir")).toBe("ver_pedir");
    expect(parsear_boton_alerta("guardar_viernes")).toBe("guardar_viernes");
    expect(parsear_boton_alerta("pausar_avisos")).toBe("pausar_avisos");
  });

  it("reconoce las etiquetas del quick reply de plantilla", () => {
    expect(parsear_boton_alerta("Ver y pedir")).toBe("ver_pedir");
    expect(parsear_boton_alerta("Guardar p/ viernes")).toBe("guardar_viernes");
    expect(parsear_boton_alerta("Guardar viernes")).toBe("guardar_viernes");
    expect(parsear_boton_alerta("Pausar avisos")).toBe("pausar_avisos");
  });

  it("no se rompe con mayúsculas, acentos ni espacios de más", () => {
    expect(parsear_boton_alerta("  PAUSAR   AVISOS ")).toBe("pausar_avisos");
    expect(parsear_boton_alerta("Ver y pedír")).toBe("ver_pedir");
  });

  it("devuelve null con cualquier otra cosa", () => {
    expect(parsear_boton_alerta("Confirmar")).toBeNull();
    expect(parsear_boton_alerta("")).toBeNull();
    expect(parsear_boton_alerta(null)).toBeNull();
    expect(parsear_boton_alerta("acc:reponer:SKU-1")).toBeNull();
  });
});

describe("texto_de_boton_alerta", () => {
  it("traduce cada botón al comando de texto que ya sabe atender el bot", () => {
    expect(texto_de_boton_alerta("ver_pedir")).toBe("que me falta");
    expect(texto_de_boton_alerta("guardar_viernes")).toBe("guardalo para el viernes");
    expect(texto_de_boton_alerta("pausar_avisos")).toBe("pausar avisos");
  });

  it("no inventa texto para cualquier otro botón", () => {
    expect(texto_de_boton_alerta(null)).toBe("");
  });
});

describe("normalizarBotonEntrada", () => {
  it("lee el id de un botón interactivo", () => {
    const r = normalizarBotonEntrada(sobreBoton({ type: "interactive", interactive: { button_reply: { id: "acc:reponer:SKU-1" } } }));
    expect(r?.botonId).toBe("acc:reponer:SKU-1");
  });

  it("lee el texto de un quick reply de plantilla, que no trae payload", () => {
    const r = normalizarBotonEntrada(sobreBoton({ type: "button", button: { text: "Ver y pedir" } }));
    expect(r?.botonId).toBe("Ver y pedir");
    expect(r?.remitenteE164).toBe("+5493513592875");
  });

  it("prefiere el payload si Meta lo manda", () => {
    const r = normalizarBotonEntrada(sobreBoton({ type: "button", button: { text: "Ver y pedir", payload: "ver_pedir" } }));
    expect(r?.botonId).toBe("ver_pedir");
  });

  it("ignora un mensaje de texto", () => {
    expect(normalizarBotonEntrada(sobreBoton({ type: "text", text: { body: "hola" } }))).toBeNull();
  });
});
