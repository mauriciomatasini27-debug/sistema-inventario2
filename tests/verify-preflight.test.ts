import { describe, expect, it } from "vitest";
import { clasificarArch, estadoMigraciones } from "../scripts/verify-preflight-lib.mjs";

const journal = (n: number) => Array.from({ length: n }, (_, i) => ({ idx: i + 1, tag: `000${i + 1}`, when: 0 }));

describe("verify-preflight: atribución de fallos de arch", () => {
  it("un archivo ausente del diff se marca preexistente", () => {
    const salida = '  "src/pages/api/admin/tenants/plan.ts -> /api/admin/tenants/plan",';
    expect(clasificarArch(salida, ["src/pages/venta.astro"])).toEqual([
      {
        archivo: "src/pages/api/admin/tenants/plan.ts",
        ruta: "/api/admin/tenants/plan",
        origen: "preexistente",
      },
    ]);
  });

  it("un archivo presente en el diff se marca mio", () => {
    const salida = ["  - []", '  + "src/pages/api/admin/tenants/plan.ts -> /api/admin/tenants/plan",'].join("\n");
    expect(clasificarArch(salida, ["src/pages/api/admin/tenants/plan.ts"])).toEqual([
      {
        archivo: "src/pages/api/admin/tenants/plan.ts",
        ruta: "/api/admin/tenants/plan",
        origen: "mio",
      },
    ]);
  });
});

describe("verify-preflight: alineación de migraciones", () => {
  it("DB con mas migraciones que el journal se marca desalineada", () => {
    expect(estadoMigraciones(57, journal(55))).toEqual({
      ok: false,
      aplicadas: 57,
      journal: 55,
      motivo: "desalineada",
      detalle: "La DB tiene 57 migraciones y el journal solo 55.",
    });
  });

  it("DB y journal iguales se marca alineada", () => {
    expect(estadoMigraciones(55, journal(55))).toEqual({
      ok: true,
      aplicadas: 55,
      journal: 55,
      motivo: "alineada",
      detalle: "",
    });
  });

  it("journal con mas entradas que la DB se marca pendiente", () => {
    expect(estadoMigraciones(54, journal(55))).toEqual({
      ok: false,
      aplicadas: 54,
      journal: 55,
      motivo: "pendiente",
      detalle: "1 migraciones pendientes",
    });
  });
});
