import { describe, expect, it } from "vitest";
import { calcular_ttfv, comercio_activado, embudo_por_etapa } from "../src/modules/onboarding/metricas.js";
import { registrar_progreso } from "../src/modules/onboarding/video.js";
import { vacios_para_permisos } from "../src/modules/onboarding/estados-vacios.js";

describe("métricas ON12 más video ON6 más vacíos ON9", () => {
  it("ttfv mediana y p75", () => {
    const r = calcular_ttfv([2, 4, 5, 15]);
    expect(r.mediana).toBe(5);
    expect(r.p75).toBe(15);
    expect(calcular_ttfv([])).toEqual({ mediana: null, p75: null });
  });

  it("activación en borde 7 días", () => {
    expect(comercio_activado({ productos: 10, conUmbral: 1, usoReal: true, diasDesdeAlta: 7 })).toBe(true);
    expect(comercio_activado({ productos: 10, conUmbral: 1, usoReal: true, diasDesdeAlta: 8 })).toBe(false);
    expect(comercio_activado({ productos: 9, conUmbral: 5, usoReal: true, diasDesdeAlta: 3 })).toBe(false);
  });

  it("embudo cuenta por etapa en orden", () => {
    const e = embudo_por_etapa({ a: 3, b: 1 }, ["a", "b", "c"]);
    expect(e).toEqual([
      { evento: "a", total: 3 },
      { evento: "b", total: 1 },
      { evento: "c", total: 0 },
    ]);
  });

  it("video inicio mitad fin", () => {
    const s0 = { videoProgreso: 0, videoVisto: false };
    expect(registrar_progreso(s0, { progreso: 5, tipo: "inicio" }).videoVisto).toBe(false);
    expect(registrar_progreso(s0, { progreso: 100, tipo: "fin" })).toEqual({ videoProgreso: 100, videoVisto: true });
  });

  it("vacíos filtran permiso de caja para empleado", () => {
    const dueno = vacios_para_permisos(["ver_saldos_caja"]);
    const empleado = vacios_para_permisos([]);
    expect(dueno.some((v) => v.pantalla === "caja")).toBe(true);
    expect(empleado.some((v) => v.pantalla === "caja")).toBe(false);
  });
});
