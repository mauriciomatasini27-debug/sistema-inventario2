import { describe, expect, it } from "vitest";
import { builder_alerta_stock_bajo } from "../src/modules/whatsapp/alertas.js";
import { PLANTILLA_ALERTA_STOCK_BAJO } from "../src/modules/whatsapp/envio.js";

describe("WA-PAYLOAD: builder alerta_stock_bajo", () => {
  it("arma tres variables y botones de la plantilla Meta", () => {
    const b = builder_alerta_stock_bajo({
      comercio: "Kiosco La Esquina",
      alertas: [
        { urgente: true },
        { urgente: false },
        { urgente: true },
      ],
    });
    expect(b.plantilla).toBe(PLANTILLA_ALERTA_STOCK_BAJO);
    expect(b.variables).toEqual({ comercio: "Kiosco La Esquina", cantidad: 3, urgentes: 2 });
    expect(b.cuerpo).toContain("Kiosco La Esquina");
    expect(b.cuerpo).toContain("3 productos");
    expect(b.cuerpo).toContain("2 urgentes");
    expect(b.payload.type).toBe("interactive");
    const titulos = b.payload.interactive.action.buttons.map((x) => x.reply.title);
    expect(titulos).toEqual(["Ver y pedir", "Guardar p/ viernes", "Pausar avisos"]);
    const ids = b.payload.interactive.action.buttons.map((x) => x.reply.id);
    expect(ids).toEqual(["ver_pedir", "guardar_viernes", "pausar_avisos"]);
  });

  it("sin alertas no inventa vencimiento ni otras plantillas", () => {
    const b = builder_alerta_stock_bajo({ comercio: "Kiosco", alertas: [] });
    expect(b.plantilla).toBe("alerta_stock_bajo");
    expect(b.variables.cantidad).toBe(0);
    expect(b.payload.interactive.action.buttons).toHaveLength(3);
  });
});
