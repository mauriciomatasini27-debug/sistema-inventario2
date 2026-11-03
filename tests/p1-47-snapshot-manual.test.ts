import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { cuerpoSnapshotManual, leerEfectoSnapshot } from "../src/lib/reportes-snapshot.js";

const PAGINA = "src/pages/panel/reportes.astro";

describe("P1-47 snapshot manual", () => {
  it("el POST usa el mismo desde y hasta, con origen manual", () => {
    expect(cuerpoSnapshotManual("2026-10-06", "2026-11-02")).toEqual({
      desde: "2026-10-06",
      hasta: "2026-11-02",
      origen: "manual",
    });
  });

  it("201 y 409 recargan, y el 409 no lee el cuerpo ni cae como corte", async () => {
    const creado = await leerEfectoSnapshot({ status: 201, json: async () => ({}) });
    expect(creado).toEqual({ tipo: "recargar" });

    let leyo = false;
    const duplicado = await leerEfectoSnapshot({
      status: 409,
      json: async () => {
        leyo = true;
        throw new Error("cuerpo");
      },
    });
    expect(duplicado).toEqual({ tipo: "recargar" });
    expect(leyo).toBe(false);
  });

  it("422 y 503 dejan el texto del API para el estado de la sección", async () => {
    const ventana = await leerEfectoSnapshot({
      status: 422,
      json: async () => ({ error: { formErrors: [], fieldErrors: { desde: ["x"] } } }),
    });
    expect(ventana).toEqual({ tipo: "mostrar", texto: "revisá desde" });

    const base = await leerEfectoSnapshot({
      status: 503,
      json: async () => ({ error: "base_no_disponible" }),
    });
    expect(base).toEqual({ tipo: "mostrar", texto: "base_no_disponible" });
  });

  it("la sección de snapshot postea y vuelve a cargar en recargar", () => {
    const src = readFileSync(PAGINA, "utf8");
    expect(src).toContain('id="snapshot-generar"');
    expect(src).toContain("Generar snapshot");
    expect(src).toMatch(/fetch\("\/api\/analytics\/snapshots",\s*\{\s*method:\s*"POST"/);
    expect(src).toContain("cuerpoSnapshotManual(desde, hasta)");
    expect(src).toContain("leerEfectoSnapshot");
    expect(src).toMatch(/efecto\.tipo === "recargar"[\s\S]*cargarSnapshot\(\)/);
  });
});
