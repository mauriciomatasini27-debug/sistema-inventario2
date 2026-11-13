import { describe, expect, it } from "vitest";
import {
  decodificarCuadro,
  efectoCodigoDesconocido,
  efectoDeTecla,
  mensajeCamaraNoDisponible,
  mensajeErrorCamara,
  motivoCamaraNoDisponible,
  productosConSkuExacto,
  resolverEscaneo,
  resolverLectura,
  sesionCamara,
  type CodigoDeTenant,
} from "../src/modules/stock/escaner.js";

const codigos: readonly CodigoDeTenant[] = [
  { codigo: "7790001", sku: "YERBA", tenantId: "t-a" },
  { codigo: "7790001", sku: "OTRO", tenantId: "t-b" },
  { codigo: "SOLO-B", sku: "GALLETITAS", tenantId: "t-b" },
];

describe("STOCK-E4 escáner", () => {
  it("un código conocido resuelve el sku del tenant", () => {
    expect(resolverEscaneo(codigos, "t-a", " 7790001 ")).toEqual({ estado: "encontrado", sku: "YERBA" });
  });

  it("un código de otro tenant no resuelve", () => {
    expect(resolverEscaneo(codigos, "t-a", "SOLO-B")).toEqual({ estado: "desconocido" });
    expect(resolverEscaneo(codigos, "t-b", "7790001")).toEqual({ estado: "encontrado", sku: "OTRO" });
  });

  it("un código desconocido no crea un producto", () => {
    expect(resolverEscaneo(codigos, "t-a", "999")).toEqual({ estado: "desconocido" });
    expect(efectoCodigoDesconocido()).toEqual({
      crearProducto: false,
      mensaje: "No hay un producto con ese código.",
    });
  });

  it("un parecido por nombre no resuelve y el sku exacto sí", async () => {
    expect(productosConSkuExacto([{ sku: "DEMO-YER-01" }, { sku: "OTRO" }], "yer")).toEqual([]);
    const fetchFalsa = async (url: string) => {
      if (url.includes("codigo=")) return { ok: true, json: async () => ({ productos: [] }) };
      return { ok: true, json: async () => ({ productos: [{ sku: "DEMO-YER-01" }, { sku: "YERBA-SUELTA" }] }) };
    };
    await expect(resolverLectura({
      raw: "demo-yer-01",
      tenantId: "t-a",
      skusLocales: [],
      fetch: fetchFalsa,
    })).resolves.toEqual({ estado: "encontrado", sku: "DEMO-YER-01" });
    await expect(resolverLectura({
      raw: "yerba",
      tenantId: "t-a",
      skusLocales: [],
      fetch: fetchFalsa,
    })).resolves.toEqual({ estado: "desconocido" });
  });

  it("un EAN del catálogo local resuelve el SKU sin llamar a la red", async () => {
    let llamadas = 0;
    await expect(resolverLectura({
      raw: "7790001",
      tenantId: "t-a",
      skusLocales: ["YERBA"],
      codigosLocales: { "7790001": "YERBA" },
      fetch: async () => {
        llamadas += 1;
        throw new Error("offline");
      },
    })).resolves.toEqual({ estado: "encontrado", sku: "YERBA" });
    expect(llamadas).toBe(0);
  });

  it("sin el mapa de códigos el EAN sigue yendo a la red", async () => {
    const urls: string[] = [];
    await expect(resolverLectura({
      raw: "7790001",
      tenantId: "t-a",
      skusLocales: ["YERBA"],
      fetch: async (url) => {
        urls.push(url);
        return { ok: true, json: async () => ({ productos: [{ sku: "YERBA" }] }) };
      },
    })).resolves.toEqual({ estado: "encontrado", sku: "YERBA" });
    expect(urls[0]).toContain("/api/products?codigo=");
  });

  it("un EAN desconocido con la red caída queda desconocido", async () => {
    await expect(resolverLectura({
      raw: "7799999",
      tenantId: "t-a",
      skusLocales: ["YERBA"],
      codigosLocales: {},
      fetch: async () => {
        throw new Error("offline");
      },
    })).resolves.toEqual({ estado: "desconocido" });
  });

  it("Enter busca y no abre la cámara", () => {
    expect(efectoDeTecla("Enter")).toEqual({ buscar: true, abrirCamara: false });
    expect(efectoDeTecla("a").abrirCamara).toBe(false);
  });

  it("sin BarcodeDetector decodifica con zxing-wasm y no llama al detector", async () => {
    const llamadas = { detector: 0, zxing: 0 };
    const cuadro = {} as CanvasImageSource;
    const leido = await decodificarCuadro(cuadro, false, {
      barcodeDetector: async () => {
        llamadas.detector += 1;
        return "NO";
      },
      zxing: async () => {
        llamadas.zxing += 1;
        return "7790001";
      },
    });
    expect(leido).toEqual({ codigo: "7790001", decodificador: "zxing-wasm" });
    expect(llamadas).toEqual({ detector: 0, zxing: 1 });
  });

  it("distingue permiso denegado y contexto inseguro", () => {
    expect(mensajeErrorCamara({ name: "NotAllowedError" })).toContain("Permiso de cámara denegado");
    expect(mensajeErrorCamara({ name: "NotFoundError" })).toContain("No hay cámara");
    expect(mensajeCamaraNoDisponible("contexto_inseguro")).toContain("HTTPS");
    expect(mensajeCamaraNoDisponible("sin_api")).toContain("no soporta");
    const motivo = motivoCamaraNoDisponible();
    expect(motivo === null || motivo === "sin_api").toBe(true);
  });

  it("cerrar detiene tracks y oculta el video", async () => {
    let detenidos = 0;
    const track = { stop: () => { detenidos += 1; } };
    const stream = { getTracks: () => [track] };
    const video = {
      hidden: false,
      srcObject: stream,
      videoWidth: 64,
      videoHeight: 64,
      play: async () => {},
    } as unknown as HTMLVideoElement;
    const original = (globalThis as { BarcodeDetector?: unknown }).BarcodeDetector;
  (globalThis as { BarcodeDetector?: unknown }).BarcodeDetector = class {
      async detect() {
        return [];
      }
    };
    const sesion = sesionCamara(video, {
      getUserMedia: async () => stream as MediaStream,
    });
    const lectura = sesion.leer();
    await new Promise((resolve) => setTimeout(resolve, 0));
    sesion.cerrar();
    await lectura;
    if (original === undefined) delete (globalThis as { BarcodeDetector?: unknown }).BarcodeDetector;
    else (globalThis as { BarcodeDetector?: unknown }).BarcodeDetector = original;
    expect(detenidos).toBe(1);
    expect(video.hidden).toBe(true);
    expect(video.srcObject).toBeNull();
  });

  it("con BarcodeDetector no llama a zxing-wasm", async () => {
    const llamadas = { detector: 0, zxing: 0 };
    const leido = await decodificarCuadro({} as CanvasImageSource, true, {
      barcodeDetector: async () => {
        llamadas.detector += 1;
        return "7790001";
      },
      zxing: async () => {
        llamadas.zxing += 1;
        return "NO";
      },
    });
    expect(leido.decodificador).toBe("barcode-detector");
    expect(llamadas).toEqual({ detector: 1, zxing: 0 });
  });
});
