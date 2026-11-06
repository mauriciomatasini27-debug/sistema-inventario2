import { describe, expect, it } from "vitest";
import {
  CLAVE_CATALOGO,
  agregarProvisorio,
  claveCatalogo,
  debeDescargar,
  leerCatalogoLocal,
  type StorageCatalogo,
} from "../src/offline/catalogo-local.js";

const EPOCH = "1970-01-01T00:00:00.000Z";
const AHORA = new Date("2026-10-20T12:00:00.000Z");
const T1 = "tenant-a";
const T2 = "tenant-b";

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
    keys: () => [...mapa.keys()],
  };
}

function k(tenant: string): string {
  const c = claveCatalogo(tenant);
  if (!c) throw new Error("clave de tenant inválida");
  return c;
}

function snapshotJson(): string {
  return JSON.stringify({
    version: 2,
    descargadoEl: "2026-10-20T11:00:00.000Z",
    productos: { "yerba-1": { stock: 3, precioCentavos: 1234 } },
    codigos: { "7790001": "yerba-1" },
  });
}

describe("STOCK-S1 agregarProvisorio: snapshot local por tenant", () => {
  it("sin snapshot crea uno con epoch, stock 0 y el precio de la línea", () => {
    const storage = storageMemoria();
    const snapshot = agregarProvisorio(storage, T1, "nuevo-1", 7000);

    expect(snapshot).toEqual({
      version: 2,
      descargadoEl: EPOCH,
      productos: { "nuevo-1": { stock: 0, precioCentavos: 7000 } },
      codigos: {},
    });
    expect(leerCatalogoLocal(storage, T1)).toEqual(snapshot);
    expect(debeDescargar(snapshot, AHORA, true)).toBe(true);
    expect(storage.getItem(CLAVE_CATALOGO)).toBeNull();
  });

  it("con snapshot agrega el SKU y conserva productos y fecha de descarga", () => {
    const storage = storageMemoria({ [k(T1)]: snapshotJson() });
    const snapshot = agregarProvisorio(storage, T1, "nuevo-1", 7000);

    expect(snapshot).toEqual({
      version: 2,
      descargadoEl: "2026-10-20T11:00:00.000Z",
      productos: {
        "yerba-1": { stock: 3, precioCentavos: 1234 },
        "nuevo-1": { stock: 0, precioCentavos: 7000 },
      },
      codigos: { "7790001": "yerba-1" },
    });
    expect(snapshot.codigos["nuevo-1"]).toBeUndefined();
    expect(leerCatalogoLocal(storage, T1)).toEqual(snapshot);
  });

  it("no pisa un SKU que ya existe en el snapshot", () => {
    const storage = storageMemoria({ [k(T1)]: snapshotJson() });
    const snapshot = agregarProvisorio(storage, T1, "yerba-1", 9999);

    expect(snapshot.productos["yerba-1"]).toEqual({ stock: 3, precioCentavos: 1234 });
    expect(leerCatalogoLocal(storage, T1)?.productos["yerba-1"]).toEqual({ stock: 3, precioCentavos: 1234 });
  });

  it("repetir el alta del mismo SKU no cambia el snapshot", () => {
    const storage = storageMemoria();
    const primera = agregarProvisorio(storage, T1, "nuevo-1", 7000);
    const segunda = agregarProvisorio(storage, T1, "nuevo-1", 9999);

    expect(segunda).toEqual(primera);
    expect(segunda.productos["nuevo-1"]?.precioCentavos).toBe(7000);
  });

  it("aislamiento A/B: el alta de un tenant no toca el snapshot del otro", () => {
    const storage = storageMemoria({ [k(T1)]: snapshotJson() });
    agregarProvisorio(storage, T2, "nuevo-2", 5000);

    expect(leerCatalogoLocal(storage, T1)?.productos["nuevo-2"]).toBeUndefined();
    expect(leerCatalogoLocal(storage, T2)?.productos["nuevo-2"]).toEqual({ stock: 0, precioCentavos: 5000 });
    expect(storage.getItem(CLAVE_CATALOGO)).toBeNull();
  });

  it("un snapshot v1 no se mezcla con el alta provisorio", () => {
    const storage = storageMemoria({
      [k(T1)]: JSON.stringify({
        version: 1,
        descargadoEl: "2026-10-20T11:00:00.000Z",
        productos: { "yerba-1": { stock: 3, precioCentavos: 1234 } },
      }),
    });
    const snapshot = agregarProvisorio(storage, T1, "nuevo-1", 7000);

    expect(snapshot.version).toBe(2);
    expect(snapshot.productos["yerba-1"]).toBeUndefined();
    expect(snapshot.productos["nuevo-1"]).toEqual({ stock: 0, precioCentavos: 7000 });
    expect(snapshot.codigos).toEqual({});
  });

  it("sin tenant no escribe nada", () => {
    const storage = storageMemoria();
    const snapshot = agregarProvisorio(storage, null, "nuevo-1", 7000);

    expect(snapshot.descargadoEl).toBe(EPOCH);
    expect(storage.getItem(k(T1))).toBeNull();
    expect(storage.getItem(CLAVE_CATALOGO)).toBeNull();
  });
});
