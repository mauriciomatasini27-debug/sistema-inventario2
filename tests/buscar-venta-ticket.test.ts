import { describe, expect, it } from "vitest";
import { hitsCatalogoLocal, unirHits, type SnapshotBusqueda } from "../src/modules/sales/buscar_venta_ticket.js";

const snapshot = (): SnapshotBusqueda => ({
  productos: {
    "CAFE-001": { stock: 4, precioCentavos: 850000 },
    "AGUA-1": { stock: 0, precioCentavos: 50000 },
    "PAN-9": { stock: 2, precioCentavos: 120000 },
  },
  codigos: { "779123": "CAFE-001", "779999": "AGUA-1" },
});

describe("buscar ticket: consulta vacía", () => {
  it("no lista el catálogo", () => {
    expect(hitsCatalogoLocal(snapshot(), "")).toEqual([]);
    expect(hitsCatalogoLocal(snapshot(), "   ")).toEqual([]);
    expect(unirHits("", hitsCatalogoLocal(snapshot(), "cafe"), [{ sku: "CAFE-001", nombre: "Café", precioCentavos: 1 }])).toEqual([]);
  });

  it("sin snapshot tampoco inventa filas", () => {
    expect(hitsCatalogoLocal(null, "cafe")).toEqual([]);
  });
});

describe("buscar ticket: coincidencias reales", () => {
  it("un nombre o sku parcial no trae el resto del comercio", () => {
    const hits = hitsCatalogoLocal(snapshot(), "cafe");
    expect(hits.map((h) => h.sku)).toEqual(["CAFE-001"]);
    expect(hits[0]?.precioCentavos).toBe(850000);
  });

  it("un código parcial resuelve al sku y deja afuera los otros códigos", () => {
    expect(hitsCatalogoLocal(snapshot(), "779123").map((h) => h.sku)).toEqual(["CAFE-001"]);
    expect(hitsCatalogoLocal(snapshot(), "779").map((h) => h.sku).sort()).toEqual(["AGUA-1", "CAFE-001"]);
  });

  it("el stock en cero sigue en la lista", () => {
    const hit = hitsCatalogoLocal(snapshot(), "agua")[0];
    expect(hit?.sku).toBe("AGUA-1");
    expect(hit?.stock).toBe(0);
  });

  it("une el nombre de la ficha y conserva el precio local", () => {
    const locales = hitsCatalogoLocal(snapshot(), "cafe");
    const hits = unirHits("cafe", locales, [
      { sku: "CAFE-001", nombre: "Café en grano", precioCentavos: 1 },
      { sku: "OTRO", nombre: "Otro producto", precioCentavos: 10 },
      { sku: "TE-2", nombre: "Té", precioCentavos: 300 },
    ]);
    expect(hits.map((h) => h.sku)).toEqual(["CAFE-001"]);
    expect(hits[0]).toMatchObject({ nombre: "Café en grano", precioCentavos: 850000, stock: 4 });
  });

  it("una ficha por nombre entra solo si el texto coincide", () => {
    const hits = unirHits("alfaj", [], [{ sku: "ALF-1", nombre: "Alfajor", precioCentavos: 90000 }]);
    expect(hits).toEqual([{ sku: "ALF-1", nombre: "Alfajor", precioCentavos: 90000, stock: null }]);
    expect(unirHits("zzz", [], [{ sku: "ALF-1", nombre: "Alfajor", precioCentavos: 90000 }])).toEqual([]);
  });
});
