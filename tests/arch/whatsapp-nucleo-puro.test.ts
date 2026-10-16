import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, "..", "..");

// AT1 (PRD-BOT-02, ADR-0042): el núcleo puro del bot no importa adaptadores
// de transporte. Toda entrada/salida pasa por WhatsAppTransport.
const NUCLEO = [
  "src/modules/whatsapp/consulta.ts",
  "src/modules/whatsapp/router.ts",
  "src/modules/whatsapp/servicio.ts",
  "src/modules/whatsapp/resolucion.ts",
  "src/modules/whatsapp/vincular.ts",
];

const ADAPTADORES = ["cliente-cloud", "transport", "TransporteFake", "crearTransporteCloud"];

describe("BOT2-S5/AT1 núcleo del bot sin imports de transporte", () => {
  for (const archivo of NUCLEO) {
    it(`${archivo} no importa adaptadores`, () => {
      const texto = readFileSync(join(RAIZ, archivo), "utf8");
      for (const a of ADAPTADORES) {
        expect(texto, `${archivo} menciona ${a}`).not.toContain(a);
      }
    });
  }

  it("el webhook sale solo vía WhatsAppTransport", () => {
    const texto = readFileSync(join(RAIZ, "src/pages/api/whatsapp/webhook.ts"), "utf8");
    expect(texto).toContain("transport.js");
  });
});
