import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// TB-165 [tenant]: la ruta de estado resuelve el WhatsApp vinculado a través
// de control.ts, sin conocer la colección del store ni su forma interna.
const fuente = readFileSync("src/pages/api/onboarding/estado.ts", "utf8");

describe("api/onboarding/estado no accede a colecciones del store", () => {
  it("resuelve el WhatsApp vinculado con un helper de control", () => {
    expect(fuente).not.toContain("vincularCodes");
    expect(fuente).toContain("numeroWhatsappVinculado");
  });
});
