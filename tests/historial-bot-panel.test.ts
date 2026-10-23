import { describe, expect, it } from "vitest";
import { ALTO_FILA_PX, OVERSCAN, ventanaVisible } from "../src/lib/historial-bot-panel.js";

describe("ventanaVisible", () => {
  it("recorta con overscan y alto fijo", () => {
    const v = ventanaVisible({ total: 100, scrollTop: ALTO_FILA_PX * 10, altoVista: ALTO_FILA_PX * 3 });
    expect(v.desde).toBe(10 - OVERSCAN);
    expect(v.offsetY).toBe(v.desde * ALTO_FILA_PX);
    expect(v.altoTotal).toBe(100 * ALTO_FILA_PX);
    expect(v.hasta).toBeGreaterThan(v.desde);
  });
});
