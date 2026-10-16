import { describe, expect, it } from "vitest";
import {
  PLANES_EJEMPLO,
  cambioDePlan,
  cupoRestante,
  planDe,
  resolverCatalogo,
  tieneFeature,
} from "../src/modules/planes/catalogo.js";
import { ProveedorCobroFake } from "../src/modules/planes/proveedor.js";

describe("planes de ejemplo (PRD-PLAN-01, sin migración)", () => {
  it("el catálogo trae Básico/Plus/Pro marcados como ejemplo con precios de referencia", () => {
    expect(PLANES_EJEMPLO.map((p) => p.id)).toEqual(["basico", "plus", "pro"]);
    for (const p of PLANES_EJEMPLO) expect(p.ejemplo).toBe(true);
    expect(PLANES_EJEMPLO.map((p) => p.precioMensualUSD)).toEqual([15, 35, 59]);
  });

  it("planDe resuelve por id y rechaza ids desconocidos", () => {
    expect(planDe(PLANES_EJEMPLO, "plus").nombre).toBe("Plus");
    expect(() => planDe(PLANES_EJEMPLO, "inexistente")).toThrow("plan desconocido");
  });

  it("tieneFeature refleja la tabla del PRD (PLAN-S1)", () => {
    const basico = planDe(PLANES_EJEMPLO, "basico");
    const plus = planDe(PLANES_EJEMPLO, "plus");
    expect(tieneFeature(basico, "asistente_ia")).toBe(false);
    expect(tieneFeature(plus, "asistente_ia")).toBe(true);
    expect(tieneFeature(basico, "bot_consulta")).toBe(true);
    expect(tieneFeature(basico, "alertas_whatsapp")).toBe(false);
    expect(tieneFeature(plus, "alertas_whatsapp")).toBe(true);
  });

  it("Básico tiene cupo de bot 100; Plus/Pro quedan a definir (null)", () => {
    const basico = planDe(PLANES_EJEMPLO, "basico");
    const plus = planDe(PLANES_EJEMPLO, "plus");
    expect(cupoRestante(basico, "bot_consulta", 30)).toBe(70);
    expect(cupoRestante(basico, "bot_consulta", 150)).toBe(0);
    expect(cupoRestante(plus, "bot_consulta", 999)).toBe(null);
    expect(cupoRestante(basico, "asistente_ia", 0)).toBe(null);
  });

  it("el override por env cambia precios sin tocar el default", () => {
    const catalogo = resolverCatalogo({ PLANES_EJEMPLO_JSON: '{"plus":{"precioMensualUSD":40}}' });
    expect(planDe(catalogo, "plus").precioMensualUSD).toBe(40);
    expect(planDe(catalogo, "plus").ejemplo).toBe(true);
    expect(planDe(PLANES_EJEMPLO, "plus").precioMensualUSD).toBe(35);
  });

  it("un JSON inválido en el override se rechaza en el borde", () => {
    expect(() => resolverCatalogo({ PLANES_EJEMPLO_JSON: "no-json" })).toThrow(
      "PLANES_EJEMPLO_JSON inválido",
    );
  });

  it("upgrade Básico→Plus el día 10 de 30: inmediato con prorrateo 20/30 (PLAN-S3)", () => {
    const r = cambioDePlan({ actualId: "basico", destinoId: "plus", diaDelCiclo: 10, diasCiclo: 30 });
    expect(r.efecto).toBe("inmediato");
    if (r.efecto !== "inmediato") throw new Error("se esperaba upgrade inmediato");
    expect(r.montoProrrateoCentavos).toBe(1333n);
  });

  it("downgrade Plus→Básico: sigue Plus hasta fin de período (PLAN-S4)", () => {
    const r = cambioDePlan({ actualId: "plus", destinoId: "basico", diaDelCiclo: 10, diasCiclo: 30 });
    expect(r).toEqual({ efecto: "fin_de_ciclo", planProgramado: "basico" });
  });

  it("pedir el mismo plan no cambia nada", () => {
    expect(
      cambioDePlan({ actualId: "plus", destinoId: "plus", diaDelCiclo: 10, diasCiclo: 30 }),
    ).toEqual({ efecto: "sin_cambio" });
  });

  it("el fake crea, informa estado y cancela sin salir a red", async () => {
    const cobro = new ProveedorCobroFake();
    const sub = await cobro.crearSuscripcion({ tenantId: "t1", planId: "plus" });
    expect(sub.estado).toBe("activa");
    expect((await cobro.estado(sub.id)).planId).toBe("plus");
    await cobro.cancelar(sub.id);
    expect((await cobro.estado(sub.id)).estado).toBe("cancelada");
    await expect(cobro.estado("sub-inexistente")).rejects.toThrow("suscripción desconocida");
  });
});
