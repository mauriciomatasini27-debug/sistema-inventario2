import { describe, expect, it } from "vitest";
import { ratchet } from "./ratchets.js";

describe("ratchet (trinquete de arquitectura)", () => {
  it("pasa cuando actual iguala al baseline", () => {
    expect(ratchet("falso", 3, 3)).toBe(3);
  });

  it("falla cuando actual supera al baseline y lista cada ocurrencia", () => {
    let mensaje = "";
    try {
      ratchet("falso", 4, 3, ["src/a.ts:1", "src/a.ts:2", "src/b.ts:5", "src/c.ts:9"]);
    } catch (e) {
      mensaje = (e as Error).message;
    }
    expect(mensaje).toContain("falso");
    expect(mensaje).toContain("3");
    expect(mensaje).toContain("4");
    expect(mensaje).toContain("src/a.ts:1");
    expect(mensaje).toContain("src/c.ts:9");
  });

  it("falla cuando actual baja del baseline y pide actualizar baselines.json", () => {
    let mensaje = "";
    try {
      ratchet("falso", 2, 3);
    } catch (e) {
      mensaje = (e as Error).message;
    }
    expect(mensaje).toContain("bajó de 3 a 2");
    expect(mensaje).toContain("actualizá tests/arch/baselines.json a 2");
  });
});
