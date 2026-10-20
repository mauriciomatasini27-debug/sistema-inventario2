import { describe, expect, it } from "vitest";
import {
  CLAVE_CATALOGO,
  debeDescargar,
  descargarCatalogo,
  leerCatalogoLocal,
  precioLocal,
  type RespuestaCatalogo,
  type StorageCatalogo,
} from "../src/offline/catalogo-local.js";
import { revocarDispositivo } from "../src/offline/dispositivo.js";

const AHORA = new Date("2026-10-20T12:00:00.000Z");

function storageMemoria(inicial: Record<string, string> = {}): StorageCatalogo & { mapa: Map<string, string> } {
  const mapa = new Map(Object.entries(inicial));
  return {
    mapa,
    getItem: (clave) => mapa.get(clave) ?? null,
    setItem: (clave, valor) => {
      mapa.set(clave, valor);
    },
    removeItem: (clave) => {
      mapa.delete(clave);
    },
  };
}

function respuesta(status: number, cuerpo: unknown, ok = status >= 200 && status < 300): RespuestaCatalogo {
  return { ok, status, json: async () => cuerpo };
}

function snapshotJson(descargadoEl = AHORA.toISOString()): string {
  return JSON.stringify({
    version: 1,
    descargadoEl,
    productos: { "yerba-1": { stock: 3, precioCentavos: 1234 } },
  });
}

describe("PWA-S2 descarga proactiva del catálogo", () => {
  it("descarga OK guarda snapshot y descarta filas inválidas", async () => {
    const storage = storageMemoria();
    const r = await descargarCatalogo({
      fetch: async () =>
        respuesta(200, {
          catalogo: {
            stock: { "yerba-1": 5, "": 2, neg: -1, frac: 1.5, "sin-precio": 3 },
            prices: { "yerba-1": 1234, "": 10, neg: 10, frac: 10 },
          },
        }),
      storage,
      ahora: () => AHORA,
    });

    expect(r).toEqual({
      ok: true,
      snapshot: {
        version: 1,
        descargadoEl: "2026-10-20T12:00:00.000Z",
        productos: { "yerba-1": { stock: 5, precioCentavos: 1234 } },
      },
    });
    expect(JSON.parse(storage.getItem(CLAVE_CATALOGO) ?? "null")).toEqual(r.ok ? r.snapshot : null);
  });

  it("red caída no pisa el snapshot anterior y devuelve sin_red", async () => {
    const storage = storageMemoria({ [CLAVE_CATALOGO]: snapshotJson("2026-10-01T10:00:00.000Z") });
    const r = await descargarCatalogo({
      fetch: async () => {
        throw new Error("offline");
      },
      storage,
      ahora: () => AHORA,
    });
    expect(r).toEqual({ ok: false, motivo: "sin_red" });
    expect(JSON.parse(storage.getItem(CLAVE_CATALOGO) ?? "null").descargadoEl).toBe("2026-10-01T10:00:00.000Z");
  });

  it("HTTP 500 no pisa el snapshot anterior", async () => {
    const storage = storageMemoria({ [CLAVE_CATALOGO]: snapshotJson("2026-10-01T10:00:00.000Z") });
    const r = await descargarCatalogo({
      fetch: async () => respuesta(500, { error: "boom" }),
      storage,
      ahora: () => AHORA,
    });
    expect(r).toEqual({ ok: false, motivo: "http_500" });
    expect(JSON.parse(storage.getItem(CLAVE_CATALOGO) ?? "null").descargadoEl).toBe("2026-10-01T10:00:00.000Z");
  });

  it("la copia cacheada del SW (sin red real) no se toma como catálogo nuevo", async () => {
    const storage = storageMemoria({ [CLAVE_CATALOGO]: snapshotJson("2026-10-01T10:00:00.000Z") });
    const r = await descargarCatalogo({
      fetch: async () => ({
        ...respuesta(200, { catalogo: { stock: { "yerba-1": 9 }, prices: { "yerba-1": 999 } } }),
        desdeCache: true,
      }),
      storage,
      ahora: () => AHORA,
    });
    expect(r).toEqual({ ok: false, motivo: "desde_cache" });
    expect(JSON.parse(storage.getItem(CLAVE_CATALOGO) ?? "null").descargadoEl).toBe("2026-10-01T10:00:00.000Z");
  });

  it("json() que explota no pisa el snapshot anterior", async () => {
    const storage = storageMemoria({ [CLAVE_CATALOGO]: snapshotJson("2026-10-01T10:00:00.000Z") });
    const r = await descargarCatalogo({
      fetch: async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError("Unexpected token"); } }),
      storage,
      ahora: () => AHORA,
    });
    expect(r).toEqual({ ok: false, motivo: "respuesta_invalida" });
    expect(JSON.parse(storage.getItem(CLAVE_CATALOGO) ?? "null").descargadoEl).toBe("2026-10-01T10:00:00.000Z");
  });

  it("JSON inválido no pisa el snapshot anterior", async () => {
    const storage = storageMemoria({ [CLAVE_CATALOGO]: snapshotJson("2026-10-01T10:00:00.000Z") });
    const roto = await descargarCatalogo({
      fetch: async () => respuesta(200, { catalogo: { stock: "no", prices: {} } }),
      storage,
      ahora: () => AHORA,
    });
    expect(roto).toEqual({ ok: false, motivo: "respuesta_invalida" });
    expect(JSON.parse(storage.getItem(CLAVE_CATALOGO) ?? "null").descargadoEl).toBe("2026-10-01T10:00:00.000Z");
  });

  it("debeDescargar a los 14:59 no refresca y a los 15:00 sí", () => {
    const snapshot = {
      version: 1 as const,
      descargadoEl: AHORA.toISOString(),
      productos: {},
    };
    expect(debeDescargar(snapshot, new Date(AHORA.getTime() + 14 * 60_000 + 59_000), true)).toBe(false);
    expect(debeDescargar(snapshot, new Date(AHORA.getTime() + 15 * 60_000), true)).toBe(true);
    expect(debeDescargar(null, AHORA, true)).toBe(true);
    expect(debeDescargar(null, AHORA, false)).toBe(false);
    expect(debeDescargar(snapshot, new Date(AHORA.getTime() + 60 * 60_000), false)).toBe(false);
  });

  it("precioLocal devuelve null sin sku y lee el snapshot guardado", () => {
    const storage = storageMemoria({ [CLAVE_CATALOGO]: snapshotJson() });
    const snapshot = leerCatalogoLocal(storage);
    expect(snapshot).not.toBeNull();
    expect(precioLocal(snapshot, "yerba-1")).toBe(1234);
    expect(precioLocal(snapshot, "otro")).toBeNull();
    expect(precioLocal(null, "yerba-1")).toBeNull();
  });

  it("snapshot corrupto o de otra versión devuelve null", () => {
    expect(leerCatalogoLocal(storageMemoria({ [CLAVE_CATALOGO]: "{no-json" }))).toBeNull();
    expect(leerCatalogoLocal(storageMemoria({ [CLAVE_CATALOGO]: JSON.stringify({ version: 2, productos: {} }) }))).toBeNull();
    expect(
      leerCatalogoLocal(
        storageMemoria({
          [CLAVE_CATALOGO]: JSON.stringify({ version: 1, descargadoEl: AHORA.toISOString(), productos: { x: { stock: -1, precioCentavos: 2 } } }),
        }),
      ),
    ).toBeNull();
  });

  it("revocarDispositivo borra la clave del catálogo", async () => {
    const storage = storageMemoria({ [CLAVE_CATALOGO]: snapshotJson() });
    const r = await revocarDispositivo("revocado", storage);
    expect(r.borrado).toBe(true);
    expect(storage.getItem(CLAVE_CATALOGO)).toBeNull();
  });
});
