import { describe, expect, it } from "vitest";
import {
  CLAVE_CATALOGO,
  agregarProvisorio,
  debeDescargar,
  leerCatalogoLocal,
  type StorageCatalogo,
} from "../src/offline/catalogo-local.js";

const EPOCH = "1970-01-01T00:00:00.000Z";
const AHORA = new Date("2026-10-20T12:00:00.000Z");

function storageMemoria(inicial: Record<string, string> = {}): StorageCatalogo {
  const mapa = new Map(Object.entries(inicial));
  return {
    getItem: (clave) => mapa.get(clave) ?? null,
    setItem: (clave, valor) => {
      mapa.set(clave, valor);
    },
    removeItem: (clave) => {
      mapa.delete(clave);
    },
  };
}

function snapshotJson(): string {
  return JSON.stringify({
    version: 1,
    descargadoEl: "2026-10-20T11:00:00.000Z",
    productos: { "yerba-1": { stock: 3, precioCentavos: 1234 } },
  });
}

describe("STOCK-S1 agregarProvisorio: snapshot local de offline:catalogo", () => {
  it("sin snapshot crea uno con epoch, stock 0 y el precio de la línea", () => {
    const storage = storageMemoria();
    const snapshot = agregarProvisorio(storage, "nuevo-1", 7000);

    expect(snapshot).toEqual({
      version: 1,
      descargadoEl: EPOCH,
      productos: { "nuevo-1": { stock: 0, precioCentavos: 7000 } },
    });
    expect(leerCatalogoLocal(storage)).toEqual(snapshot);
    expect(debeDescargar(snapshot, AHORA, true)).toBe(true);
  });

  it("con snapshot agrega el SKU y conserva productos y fecha de descarga", () => {
    const storage = storageMemoria({ [CLAVE_CATALOGO]: snapshotJson() });
    const snapshot = agregarProvisorio(storage, "nuevo-1", 7000);

    expect(snapshot).toEqual({
      version: 1,
      descargadoEl: "2026-10-20T11:00:00.000Z",
      productos: {
        "yerba-1": { stock: 3, precioCentavos: 1234 },
        "nuevo-1": { stock: 0, precioCentavos: 7000 },
      },
    });
    expect(leerCatalogoLocal(storage)).toEqual(snapshot);
  });

  it("no pisa un SKU que ya existe en el snapshot", () => {
    const storage = storageMemoria({ [CLAVE_CATALOGO]: snapshotJson() });
    const snapshot = agregarProvisorio(storage, "yerba-1", 9999);

    expect(snapshot.productos["yerba-1"]).toEqual({ stock: 3, precioCentavos: 1234 });
    expect(leerCatalogoLocal(storage)?.productos["yerba-1"]).toEqual({ stock: 3, precioCentavos: 1234 });
  });

  it("repetir el alta del mismo SKU no cambia el snapshot", () => {
    const storage = storageMemoria();
    const primera = agregarProvisorio(storage, "nuevo-1", 7000);
    const segunda = agregarProvisorio(storage, "nuevo-1", 9999);

    expect(segunda).toEqual(primera);
    expect(segunda.productos["nuevo-1"]?.precioCentavos).toBe(7000);
  });
});
