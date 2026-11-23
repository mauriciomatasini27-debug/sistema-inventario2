import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  cargarCatalogoPanel,
  esErrorDeAborto,
  type ObjetivoDeEventos,
} from "../src/lib/catalogo-carga.js";
import type { ProductoCatalogo } from "../src/lib/catalogo-panel.js";

const RAIZ = process.cwd();
const leer = (p: string): string => readFileSync(join(RAIZ, p), "utf8");

const PRODUCTOS: ProductoCatalogo[] = [
  { sku: "A-1", nombre: "Uno", precioCentavos: 100 },
  { sku: "B-2", nombre: "Dos", precioCentavos: 200 },
];

interface RespuestaFalsa {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}

function respuesta(cuerpo: unknown, ok = true): RespuestaFalsa {
  return { ok, status: ok ? 200 : 500, json: async () => cuerpo };
}

interface ObjetivoFalso extends ObjetivoDeEventos {
  disparar(tipo: string): void;
  escuchas(tipo: string): number;
}

function objetivoFalso(): ObjetivoFalso {
  const oyentes = new Map<string, () => void>();
  return {
    addEventListener(tipo, oyente) {
      if (typeof oyente === "function") oyentes.set(tipo, () => oyente(new Event(tipo)));
      else if (oyente) oyentes.set(tipo, () => oyente.handleEvent(new Event(tipo)));
    },
    removeEventListener(tipo) {
      oyentes.delete(tipo);
    },
    disparar(tipo) {
      const oyente = oyentes.get(tipo);
      oyentes.delete(tipo);
      oyente?.();
    },
    escuchas(tipo) {
      return oyentes.has(tipo) ? 1 : 0;
    },
  };
}

describe("NAV-S4: carga del catálogo cancelable", () => {
  it("pide la URL con la señal y entrega productos y kpis", async () => {
    const llamadas: { url: string; signal: AbortSignal }[] = [];
    let recibido: { productos: ProductoCatalogo[]; kpis?: unknown } | undefined;
    const carga = cargarCatalogoPanel({
      url: "/api/products?panel=1",
      objetivo: objetivoFalso(),
      fetchImpl: (url, init) => {
        llamadas.push({ url, signal: init.signal });
        return Promise.resolve(respuesta({ productos: PRODUCTOS, kpis: { total: 2 } }));
      },
      alCargar: (r) => {
        recibido = r;
      },
      alError: () => {
        throw new Error("no debería fallar");
      },
    });

    await carga.terminada;

    expect(llamadas).toHaveLength(1);
    expect(llamadas[0]?.url).toBe("/api/products?panel=1");
    expect(llamadas[0]?.signal).toBeInstanceOf(AbortSignal);
    expect(recibido?.productos).toEqual(PRODUCTOS);
    expect(recibido?.kpis).toEqual({ total: 2 });
  });

  it("al salir de la página aborta el fetch en curso y no pinta nada", async () => {
    const objetivo = objetivoFalso();
    let resolver: ((r: RespuestaFalsa) => void) | undefined;
    const senal: AbortSignal[] = [];
    let pintadas = 0;
    let errores = 0;
    const carga = cargarCatalogoPanel({
      url: "/api/products",
      objetivo,
      fetchImpl: (_url, init) => {
        senal.push(init.signal);
        return new Promise<RespuestaFalsa>((resolve) => {
          resolver = resolve;
        });
      },
      alCargar: () => {
        pintadas += 1;
      },
      alError: () => {
        errores += 1;
      },
    });

    expect(objetivo.escuchas("pagehide")).toBe(1);
    expect(objetivo.escuchas("beforeunload")).toBe(1);
    objetivo.disparar("pagehide");
    expect(senal[0]?.aborted).toBe(true);

    resolver?.(respuesta({ productos: PRODUCTOS }));
    await carga.terminada;

    expect(pintadas).toBe(0);
    expect(errores).toBe(0);
    expect(objetivo.escuchas("pagehide")).toBe(0);
    expect(objetivo.escuchas("beforeunload")).toBe(0);
  });

  it("beforeunload también aborta: Chromium no siempre emite pagehide", async () => {
    const objetivo = objetivoFalso();
    let senal: AbortSignal | undefined;
    let pintadas = 0;
    const carga = cargarCatalogoPanel({
      url: "/api/products",
      objetivo,
      fetchImpl: (_url, init) => {
        senal = init.signal;
        return new Promise<RespuestaFalsa>((_resolve, reject) => {
          init.signal.addEventListener("abort", () => {
            const error = new Error("abortado");
            error.name = "AbortError";
            reject(error);
          });
        });
      },
      alCargar: () => {
        pintadas += 1;
      },
      alError: () => {
        throw new Error("un aborto no reporta error");
      },
    });

    objetivo.disparar("beforeunload");
    await carga.terminada;

    expect(senal?.aborted).toBe(true);
    expect(pintadas).toBe(0);
  });

  it("cancelar() aborta la carga anterior y deja cargar la siguiente", async () => {
    const objetivo = objetivoFalso();
    let primeraSenal: AbortSignal | undefined;
    const abiertos: string[] = [];
    let pintadas = 0;

    const primera = cargarCatalogoPanel({
      url: "/api/products?panel=1",
      objetivo,
      fetchImpl: (_url, init) => {
        primeraSenal = init.signal;
        return new Promise<RespuestaFalsa>(() => {});
      },
      alCargar: () => {
        pintadas += 1;
      },
      alError: () => {
        throw new Error("una carga cancelada no reporta error");
      },
    });
    primera.cancelar();
    expect(primeraSenal?.aborted).toBe(true);

    const segunda = cargarCatalogoPanel({
      url: "/api/products?panel=1",
      objetivo,
      fetchImpl: (url) => {
        abiertos.push(url);
        return Promise.resolve(respuesta({ productos: PRODUCTOS }));
      },
      alCargar: () => {
        pintadas += 1;
      },
      alError: () => {
        throw new Error("no debería fallar");
      },
    });
    await segunda.terminada;

    expect(abiertos).toEqual(["/api/products?panel=1"]);
    expect(pintadas).toBe(1);
    // Al terminar la carga suelta la escucha: no quedan listeners por cada reload.
    expect(objetivo.escuchas("pagehide")).toBe(0);
  });

  it("un error HTTP va a alError; un AbortError se ignora", async () => {
    const errores: unknown[] = [];
    const carga = cargarCatalogoPanel({
      url: "/api/products",
      objetivo: objetivoFalso(),
      fetchImpl: () => Promise.resolve(respuesta({}, false)),
      alCargar: () => {
        throw new Error("no debería pintar");
      },
      alError: (error) => {
        errores.push(error);
      },
    });
    await carga.terminada;
    expect(errores).toHaveLength(1);
    expect(String(errores[0])).toContain("500");

    expect(esErrorDeAborto({ name: "AbortError" })).toBe(true);
    expect(esErrorDeAborto(new Error("http 500"))).toBe(false);
    expect(esErrorDeAborto(null)).toBe(false);
  });

  it("si el reporte de error lanza, terminada rechaza y no lo esconde", async () => {
    const carga = cargarCatalogoPanel({
      url: "/api/products",
      objetivo: objetivoFalso(),
      fetchImpl: () => Promise.reject(new Error("red")),
      alCargar: () => {
        throw new Error("no debería pintar");
      },
      alError: () => {
        throw new Error("reporte roto");
      },
    });

    await expect(carga.terminada).rejects.toThrow("reporte roto");
  });
});

describe("NAV-S4: una sola fuente para el store del catálogo", () => {
  it("stock y precios cargan con el helper cancelable y publican en el store", () => {
    for (const pagina of ["src/pages/panel/stock.astro", "src/pages/panel/precios.astro"]) {
      const fuente = leer(pagina);
      expect(fuente, pagina).toContain("cargarCatalogoPanel");
      expect(fuente, pagina).toContain("cargaCatalogo?.cancelar()");
    }
  });

  it("TablaCatalogo no hace fetch propio: solo lee el store", () => {
    const tabla = leer("src/components/panel/TablaCatalogo.tsx");
    expect(tabla).not.toMatch(/\bfetch\s*\(/);
    expect(tabla).not.toContain("/api/products");
    expect(tabla).toContain("suscribirCatalogo");
    expect(tabla).toContain("leerCatalogo");
  });
});
