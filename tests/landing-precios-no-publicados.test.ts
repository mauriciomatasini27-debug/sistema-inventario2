import { describe, expect, it } from "vitest";
import { business } from "../src/data/business.js";

const MONTOS_NO_PUBLICADOS = ["15", "35", "59", "17", "33", "49"] as const;

describe("precios de la landing", () => {
  it("no publica montos de plan en precioUnico", () => {
    expect(business.planes.length).toBeGreaterThan(0);
    for (const plan of business.planes) {
      for (const monto of MONTOS_NO_PUBLICADOS) {
        expect(plan.precioUnico, plan.nombre).not.toContain(monto);
      }
    }
  });
});
