import { describe, expect, it } from "vitest";
import {
  CLAVE_CATALOGO,
  PREFIJO_CLAVE_CATALOGO,
  VERSION_CATALOGO,
  borrarCatalogosLocales,
  claveCatalogo,
  debeDescargar,
  descargarCatalogo,
  descartarCatalogoLegado,
  leerCatalogoLocal,
  precioLocal,
  type RespuestaCatalogo,
  type StorageCatalogo,
} from "../src/offline/catalogo-local.js";
import { revocarDispositivo } from "../src/offline/dispositivo.js";

const AHORA = new Date("2026-10-20T12:00:00.000Z");
const T1 = "tenant-a";
const T2 = "tenant-b";

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
    keys: () => [...mapa.keys()],
  };
}

function respuesta(status: number, cuerpo: unknown, ok = status >= 200 && status < 300): RespuestaCatalogo {
  return { ok, status, json: async () => cuerpo };
}

function k(tenant: string): string {
  const c = claveCatalogo(tenant);
  if (!c) throw new Error("clave de tenant inválida");
  return c;
}

function snapshotJson(descargadoEl = AHORA.toISOString()): string {
  return JSON.stringify({
    version: 2,
    descargadoEl,
    productos: { "yerba-1": { stock: 3, precioCentavos: 1234 } },
    codigos: { "7790001": "yerba-1" },
  });
}

describe("PWA-S2 descarga proactiva del catálogo por tenant", () => {
  it("descarga OK guarda el snapshot bajo la clave del tenant y descarta filas inválidas", async () => {
    const storage = storageMemoria();
    const r = await descargarCatalogo({
      tenantId: T1,
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
        version: 2,
        descargadoEl: "2026-10-20T12:00:00.000Z",
        productos: { "yerba-1": { stock: 5, precioCentavos: 1234 } },
        codigos: {},
      },
    });
    expect(JSON.parse(storage.getItem(k(T1)) ?? "null")).toEqual(r.ok ? r.snapshot : null);
    expect(storage.getItem(CLAVE_CATALOGO)).toBeNull();
  });

  it("aislamiento A/B: cada tenant tiene su clave y no se pisan", async () => {
    const storage = storageMemoria({
      [k(T1)]: snapshotJson("2026-10-01T10:00:00.000Z"),
    });
    const r = await descargarCatalogo({
      tenantId: T2,
      fetch: async () =>
        respuesta(200, { catalogo: { stock: { "yerba-2": 9 }, prices: { "yerba-2": 999 } } }),
      storage,
      ahora: () => AHORA,
    });

    expect(r.ok).toBe(true);
    expect(JSON.parse(storage.getItem(k(T1)) ?? "null").descargadoEl).toBe("2026-10-01T10:00:00.000Z");
    expect(JSON.parse(storage.getItem(k(T2)) ?? "null").descargadoEl).toBe(AHORA.toISOString());
    expect(leerCatalogoLocal(storage, T1)?.productos["yerba-2"]).toBeUndefined();
    expect(leerCatalogoLocal(storage, T2)?.productos["yerba-1"]).toBeUndefined();
  });

  it("sin tenant no lee ni escribe el catálogo", async () => {
    const storage = storageMemoria({ [CLAVE_CATALOGO]: snapshotJson() });
    const r = await descargarCatalogo({
      tenantId: null,
      fetch: async () => respuesta(200, { catalogo: { stock: { "yerba-1": 1 }, prices: { "yerba-1": 1 } } }),
      storage,
    });
    expect(r).toEqual({ ok: false, motivo: "sin_tenant" });
    expect(storage.getItem(CLAVE_CATALOGO)).toBe(snapshotJson());
    expect(storage.mapa.size).toBe(1);
    expect(leerCatalogoLocal(storage, null)).toBeNull();
  });

  it("red caída no pisa el snapshot anterior del tenant y devuelve sin_red", async () => {
    const storage = storageMemoria({ [k(T1)]: snapshotJson("2026-10-01T10:00:00.000Z") });
    const r = await descargarCatalogo({
      tenantId: T1,
      fetch: async () => {
        throw new Error("offline");
      },
      storage,
      ahora: () => AHORA,
    });
    expect(r).toEqual({ ok: false, motivo: "sin_red" });
    expect(JSON.parse(storage.getItem(k(T1)) ?? "null").descargadoEl).toBe("2026-10-01T10:00:00.000Z");
  });

  it("HTTP 500 no pisa el snapshot anterior", async () => {
    const storage = storageMemoria({ [k(T1)]: snapshotJson("2026-10-01T10:00:00.000Z") });
    const r = await descargarCatalogo({
      tenantId: T1,
      fetch: async () => respuesta(500, { error: "boom" }),
      storage,
      ahora: () => AHORA,
    });
    expect(r).toEqual({ ok: false, motivo: "http_500" });
    expect(JSON.parse(storage.getItem(k(T1)) ?? "null").descargadoEl).toBe("2026-10-01T10:00:00.000Z");
  });

  it("la copia cacheada del SW (sin red real) no se toma como catálogo nuevo", async () => {
    const storage = storageMemoria({ [k(T1)]: snapshotJson("2026-10-01T10:00:00.000Z") });
    const r = await descargarCatalogo({
      tenantId: T1,
      fetch: async () => ({
        ...respuesta(200, { catalogo: { stock: { "yerba-1": 9 }, prices: { "yerba-1": 999 } } }),
        desdeCache: true,
      }),
      storage,
      ahora: () => AHORA,
    });
    expect(r).toEqual({ ok: false, motivo: "desde_cache" });
    expect(JSON.parse(storage.getItem(k(T1)) ?? "null").descargadoEl).toBe("2026-10-01T10:00:00.000Z");
  });

  it("json() que explota no pisa el snapshot anterior", async () => {
    const storage = storageMemoria({ [k(T1)]: snapshotJson("2026-10-01T10:00:00.000Z") });
    const r = await descargarCatalogo({
      tenantId: T1,
      fetch: async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError("Unexpected token"); } }),
      storage,
      ahora: () => AHORA,
    });
    expect(r).toEqual({ ok: false, motivo: "respuesta_invalida" });
    expect(JSON.parse(storage.getItem(k(T1)) ?? "null").descargadoEl).toBe("2026-10-01T10:00:00.000Z");
  });

  it("JSON inválido no pisa el snapshot anterior", async () => {
    const storage = storageMemoria({ [k(T1)]: snapshotJson("2026-10-01T10:00:00.000Z") });
    const roto = await descargarCatalogo({
      tenantId: T1,
      fetch: async () => respuesta(200, { catalogo: { stock: "no", prices: {} } }),
      storage,
      ahora: () => AHORA,
    });
    expect(roto).toEqual({ ok: false, motivo: "respuesta_invalida" });
    expect(JSON.parse(storage.getItem(k(T1)) ?? "null").descargadoEl).toBe("2026-10-01T10:00:00.000Z");
  });

  it("guarda el mapa de códigos y descarta filas que no apuntan a un producto", async () => {
    const storage = storageMemoria();
    const r = await descargarCatalogo({
      tenantId: T1,
      fetch: async () =>
        respuesta(200, {
          catalogo: {
            stock: { YERBA: 2, AZUCAR: 1 },
            prices: { YERBA: 100, AZUCAR: 50 },
            codes: {
              "7790001": "YERBA",
              " abc ": "YERBA",
              "": "YERBA",
              "7790002": "NO-ESTA",
              "7790003": 4,
              "7790004": "",
            },
          },
        }),
      storage,
      ahora: () => AHORA,
    });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.snapshot.codigos).toEqual({ "7790001": "YERBA", ABC: "YERBA" });
    expect(leerCatalogoLocal(storage, T1)?.codigos).toEqual({ "7790001": "YERBA", ABC: "YERBA" });
    expect(precioLocal(r.snapshot, "YERBA")).toBe(100);
  });

  it("codes que no es un objeto no pisa el snapshot anterior", async () => {
    const storage = storageMemoria({ [k(T1)]: snapshotJson("2026-10-01T10:00:00.000Z") });
    const r = await descargarCatalogo({
      tenantId: T1,
      fetch: async () =>
        respuesta(200, { catalogo: { stock: { "yerba-1": 1 }, prices: { "yerba-1": 1 }, codes: "779" } }),
      storage,
      ahora: () => AHORA,
    });
    expect(r).toEqual({ ok: false, motivo: "respuesta_invalida" });
    expect(JSON.parse(storage.getItem(k(T1)) ?? "null").descargadoEl).toBe("2026-10-01T10:00:00.000Z");
  });

  it("debeDescargar a los 14:59 no refresca y a los 15:00 sí", () => {
    const snapshot = {
      version: VERSION_CATALOGO,
      descargadoEl: AHORA.toISOString(),
      productos: {},
      codigos: {},
    };
    expect(debeDescargar(snapshot, new Date(AHORA.getTime() + 14 * 60_000 + 59_000), true)).toBe(false);
    expect(debeDescargar(snapshot, new Date(AHORA.getTime() + 15 * 60_000), true)).toBe(true);
    expect(debeDescargar(null, AHORA, true)).toBe(true);
    expect(debeDescargar(null, AHORA, false)).toBe(false);
    expect(debeDescargar(snapshot, new Date(AHORA.getTime() + 60 * 60_000), false)).toBe(false);
  });

  it("precioLocal devuelve null sin sku y lee el snapshot guardado del tenant", () => {
    const storage = storageMemoria({ [k(T1)]: snapshotJson() });
    const snapshot = leerCatalogoLocal(storage, T1);
    expect(snapshot).not.toBeNull();
    expect(precioLocal(snapshot, "yerba-1")).toBe(1234);
    expect(precioLocal(snapshot, "otro")).toBeNull();
    expect(precioLocal(null, "yerba-1")).toBeNull();
    expect(leerCatalogoLocal(storage, T2)).toBeNull();
  });

  it("snapshot corrupto o de otra versión devuelve null", () => {
    expect(leerCatalogoLocal(storageMemoria({ [k(T1)]: "{no-json" }), T1)).toBeNull();
    expect(
      leerCatalogoLocal(
        storageMemoria({
          [k(T1)]: JSON.stringify({
            version: 1,
            descargadoEl: AHORA.toISOString(),
            productos: { "yerba-1": { stock: 3, precioCentavos: 1234 } },
          }),
        }),
        T1,
      ),
    ).toBeNull();
    expect(
      leerCatalogoLocal(
        storageMemoria({
          [k(T1)]: JSON.stringify({
            version: 2,
            descargadoEl: AHORA.toISOString(),
            productos: { x: { stock: -1, precioCentavos: 2 } },
            codigos: {},
          }),
        }),
        T1,
      ),
    ).toBeNull();
    expect(
      leerCatalogoLocal(
        storageMemoria({
          [k(T1)]: JSON.stringify({
            version: 2,
            descargadoEl: AHORA.toISOString(),
            productos: { YERBA: { stock: 1, precioCentavos: 10 } },
          }),
        }),
        T1,
      ),
    ).toBeNull();
  });

  it("al leer descarta códigos vacíos, sku no texto y sku que no está en productos", () => {
    const leido = leerCatalogoLocal(
      storageMemoria({
        [k(T1)]: JSON.stringify({
          version: 2,
          descargadoEl: AHORA.toISOString(),
          productos: { YERBA: { stock: 1, precioCentavos: 10 } },
          codigos: { "7790001": "YERBA", "7790002": "NO-ESTA", "7790003": 5, "": "YERBA" },
        }),
      }),
      T1,
    );
    expect(leido?.codigos).toEqual({ "7790001": "YERBA" });
    expect(precioLocal(leido, "YERBA")).toBe(10);
  });

  it("la clave legada global se descarta con tenant conocido y no se migra", () => {
    const storage = storageMemoria({ [CLAVE_CATALOGO]: snapshotJson() });
    descartarCatalogoLegado(storage, T1);
    expect(storage.getItem(CLAVE_CATALOGO)).toBeNull();
    expect(storage.getItem(k(T1))).toBeNull();
  });

  it("sin tenant conocido no se toca la clave legada", () => {
    const storage = storageMemoria({ [CLAVE_CATALOGO]: snapshotJson() });
    descartarCatalogoLegado(storage, null);
    expect(storage.getItem(CLAVE_CATALOGO)).toBe(snapshotJson());
  });

  it("el borrado remoto (wipe) borra la legada y todas las claves de tenant", async () => {
    const storage = storageMemoria({
      [CLAVE_CATALOGO]: snapshotJson(),
      [k(T1)]: snapshotJson(),
      [k(T2)]: snapshotJson(),
      "otra:clave": "sigue",
    });
    const r = await revocarDispositivo("revocado", storage);
    expect(r.borrado).toBe(true);
    expect(storage.getItem(CLAVE_CATALOGO)).toBeNull();
    expect(storage.getItem(k(T1))).toBeNull();
    expect(storage.getItem(k(T2))).toBeNull();
    expect(storage.getItem("otra:clave")).toBe("sigue");
  });

  it("borrarCatalogosLocales sin storage no lanza", () => {
    expect(() => borrarCatalogosLocales(null)).not.toThrow();
  });

  it("claveCatalogo arma la clave del tenant y devuelve null sin tenant", () => {
    expect(k(T1)).toBe(PREFIJO_CLAVE_CATALOGO + T1);
    expect(claveCatalogo(null)).toBeNull();
    expect(claveCatalogo("")).toBeNull();
    expect(claveCatalogo("   ")).toBeNull();
  });
});
