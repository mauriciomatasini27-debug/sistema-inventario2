import { describe, expect, it, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import {
  PLANES_EJEMPLO,
  TARIFA_META_USD_FIJADA_EN_PRODUCTO,
  costoContabilidadBotConsultaUsdCentavos,
} from "../src/modules/planes/catalogo.js";
import { costoUsoFeatureCentavos, olvidarPlanesEnMemoria, registrarUso } from "../src/lib/repos/planes.js";

describe("TARIFA-META planes", () => {
  beforeEach(() => {
    delete process.env.TENANT_MODE;
    delete process.env.TENANT_DATABASE_URL;
    olvidarPlanesEnMemoria();
  });

  it("no fija 0.0260 USD como tarifa Meta en el catálogo de planes", () => {
    expect(TARIFA_META_USD_FIJADA_EN_PRODUCTO).toBe(false);
    expect(costoContabilidadBotConsultaUsdCentavos()).toBe(0n);
    const fuente = readFileSync("src/modules/planes/catalogo.ts", "utf8");
    expect(fuente.includes("0.0260")).toBe(false);
    expect(fuente.includes("0.026")).toBe(false);
  });

  it("mantiene precios públicos de referencia del catálogo ejemplo", () => {
    expect(PLANES_EJEMPLO.map((p) => p.precioMensualUSD)).toEqual([15, 35, 59]);
    for (const p of PLANES_EJEMPLO) expect(p.ejemplo).toBe(true);
  });

  it("registrarUso de bot_consulta no imputa costo Meta hasta tarifa contractual", async () => {
    expect(costoUsoFeatureCentavos("bot_consulta", 26n)).toBe(0n);
    const tenant = `tarifa-${Date.now().toString(36)}`;
    const v = await registrarUso({
      tenantId: tenant,
      mes: "2026-10",
      feature: "bot_consulta",
      cantidad: 5,
      costoCentavos: 26n,
    });
    expect(v.costoCentavos).toBe(0n);
  });
});
