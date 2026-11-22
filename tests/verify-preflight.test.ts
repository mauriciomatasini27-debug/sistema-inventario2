import { describe, expect, it } from "vitest";
import {
  archivosPropios,
  clasificarFallosArch,
  estadoArch,
  estadoMigraciones,
} from "../scripts/verify-preflight-lib.mjs";

const journal = (n: number) => Array.from({ length: n }, (_, i) => ({ idx: i + 1, tag: `000${i + 1}`, when: 0 }));

describe("verify-preflight: archivos en el diff", () => {
  it("incluye archivos del diff entre commits", () => {
    expect(archivosPropios("src/pages/venta.astro\n", "", "")).toEqual(["src/pages/venta.astro"]);
  });

  it("dedupe y normaliza barras", () => {
    expect(
      archivosPropios("src/pages/venta.astro\n", "src\\pages\\venta.astro\n", "tests/nuevo.test.ts\n"),
    ).toEqual(["src/pages/venta.astro", "tests/nuevo.test.ts"]);
  });
});

describe("verify-preflight: atribución de fallos de arch", () => {
  it("un archivo ausente del diff se marca preexistente", () => {
    const salida = '  "src/pages/api/admin/tenants/plan.ts -> /api/admin/tenants/plan",';
    expect(clasificarFallosArch(salida, ["src/pages/venta.astro"])).toEqual([
      {
        archivo: "src/pages/api/admin/tenants/plan.ts",
        ruta: "/api/admin/tenants/plan",
        origen: "preexistente",
      },
    ]);
  });

  it("un archivo presente en el diff se marca mio", () => {
    const salida = ["  - []", '  + "src/pages/api/admin/tenants/plan.ts -> /api/admin/tenants/plan",'].join("\n");
    expect(clasificarFallosArch(salida, ["src/pages/api/admin/tenants/plan.ts"])).toEqual([
      {
        archivo: "src/pages/api/admin/tenants/plan.ts",
        ruta: "/api/admin/tenants/plan",
        origen: "mio",
      },
    ]);
  });
});

describe("verify-preflight: estado del check:arch", () => {
  const falloPreexistente = { archivo: "src/pages/api/x.ts", ruta: "/api/x", origen: "preexistente" as const };

  it("arch en verde no ensucia el entorno", () => {
    expect(estadoArch(0, [])).toEqual({ estado: "ok", sucio: false });
  });

  it("arch en rojo sin fallos atribuibles deja el entorno indeterminado", () => {
    expect(estadoArch(1, [])).toEqual({ estado: "indeterminado", sucio: true });
  });

  it("arch en rojo por archivo propio no ensucia el entorno", () => {
    expect(estadoArch(1, [{ ...falloPreexistente, origen: "mio" }])).toEqual({
      estado: "con-fallos-propios",
      sucio: false,
    });
  });

  it("arch en rojo por archivo ajeno ensucia el entorno", () => {
    expect(estadoArch(1, [falloPreexistente])).toEqual({ estado: "preexistente", sucio: true });
  });
});

describe("verify-preflight: alineación de migraciones", () => {
  it("DB con mas migraciones que el journal se marca desalineada y dice como realinear", () => {
    const estado = estadoMigraciones(57, journal(55));
    expect(estado).toMatchObject({
      ok: false,
      aplicadas: 57,
      journal: 55,
      motivo: "desalineada",
      detalle: "La DB tiene 57 migraciones y el journal solo 55.",
    });
    expect(estado.remediacion).toContain("PGDATA_LOCAL");
    expect(estado.remediacion).toContain("drizzle.__drizzle_migrations");
  });

  it("DB y journal iguales se marca alineada sin remediacion", () => {
    expect(estadoMigraciones(55, journal(55))).toEqual({
      ok: true,
      aplicadas: 55,
      journal: 55,
      motivo: "alineada",
      detalle: "",
      remediacion: "",
    });
  });

  it("journal con mas entradas que la DB se marca pendiente y sugiere migrar", () => {
    const estado = estadoMigraciones(54, journal(55));
    expect(estado).toMatchObject({
      ok: false,
      aplicadas: 54,
      journal: 55,
      motivo: "pendiente",
      detalle: "1 migraciones pendientes",
    });
    expect(estado.remediacion).toContain("db:migrate");
  });
});
