import { describe, expect, it } from "vitest";
import { horaVisible, horasMatutinas, valorPausaAR } from "../src/lib/destinatarios-panel.js";

describe("destinatarios-panel horas", () => {
  it("ofrece 06:00 a 11:00 cada 30 minutos", () => {
    const h = horasMatutinas();
    expect(h[0]).toBe("06:00");
    expect(h).toContain("08:00");
    expect(h.at(-1)).toBe("11:00");
  });

  it("la pausa del input se ve en hora de Buenos Aires", () => {
    expect(valorPausaAR(Date.parse("2026-10-23T14:00:00Z"))).toBe("2026-10-23T11:00");
  });

  it("horaVisible antepone un valor fuera del select", () => {
    const op = horasMatutinas();
    const v = horaVisible("07:15", op);
    expect(v[0]).toBe("07:15");
    expect(v).toContain("08:00");
  });
});
