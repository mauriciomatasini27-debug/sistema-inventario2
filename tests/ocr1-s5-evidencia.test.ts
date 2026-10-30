import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";

// OCR1-S5: el slice en repo se cierra con estos tests (sin E2E Meta/Gmail real).
const EVIDENCIA = [
  "tests/ocr1-s5-whatsapp-borrador.test.ts",
  "tests/ocr1-s5-botones.test.ts",
  "tests/ocr-edicion-texto.test.ts",
] as const;

describe("OCR1-S5 evidencia en repo", () => {
  it("los tests del canal WhatsApp existen", () => {
    for (const ruta of EVIDENCIA) {
      expect(existsSync(ruta), ruta).toBe(true);
    }
  });
});
