// STOCK-E4 (ADR-0114): el lector es teclado y la cámara es respaldo.
// La resolución es pura para poder probar otro tenant sin abrir la cámara.

import { resolverCodigo, type Sku } from "../inventario/inventario.js";

export type DecodificadorCamara = "barcode-detector" | "zxing-wasm";

export type CodigoDeTenant = {
  readonly codigo: string;
  readonly sku: string;
  readonly tenantId: string;
};

export type ResolucionEscaneo =
  | { readonly estado: "encontrado"; readonly sku: string }
  | { readonly estado: "desconocido" }
  | { readonly estado: "vacio" };

export type EfectoTecla = { readonly buscar: boolean; readonly abrirCamara: false };

export type EfectoDesconocido = { readonly crearProducto: boolean; readonly mensaje: string };

export type LectoresDeCuadro = {
  readonly barcodeDetector: (cuadro: CanvasImageSource) => Promise<string | null>;
  readonly zxing: (cuadro: CanvasImageSource) => Promise<string | null>;
};

type DetectorGlobal = {
  new (opts?: { formats?: string[] }): {
    detect(source: CanvasImageSource): Promise<ReadonlyArray<{ rawValue?: string }>>;
  };
};

const FORMATOS_DETECTOR = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "qr_code", "itf"];

export function elegirDecodificador(tieneBarcodeDetector: boolean): DecodificadorCamara {
  return tieneBarcodeDetector ? "barcode-detector" : "zxing-wasm";
}

// Enter del lector busca. Ninguna tecla abre la cámara.
export function efectoDeTecla(tecla: string): EfectoTecla {
  return { buscar: tecla === "Enter", abrirCamara: false };
}

export function efectoCodigoDesconocido(): EfectoDesconocido {
  return { crearProducto: true, mensaje: "No hay un producto con ese código." };
}

export function resolverEscaneo(
  codigos: readonly CodigoDeTenant[],
  tenantId: string,
  raw: string,
): ResolucionEscaneo {
  const norm = raw.trim().toUpperCase();
  if (!norm) return { estado: "vacio" };
  if (!tenantId) return { estado: "desconocido" };
  const propios = codigos.filter((c) => c.tenantId === tenantId);
  const sku = resolverCodigo(
    propios.map((c) => ({ codigo: c.codigo, sku: c.sku as Sku, padre: null })),
    norm,
  );
  if (!sku) return { estado: "desconocido" };
  return { estado: "encontrado", sku };
}

export function codigosDesdeCatalogoLocal(
  skus: readonly string[],
  tenantId: string,
  codigos: Readonly<Record<string, string>> = {},
): CodigoDeTenant[] {
  if (!tenantId) return [];
  const out: CodigoDeTenant[] = [];
  for (const sku of skus) {
    const limpio = sku.trim();
    if (!limpio) continue;
    out.push({ codigo: limpio, sku: limpio, tenantId });
  }
  // P1-58: el SKU sigue siendo código de sí mismo y va primero. El EAN no pisa
  // un SKU que coincida con el texto leído.
  for (const [codigo, sku] of Object.entries(codigos)) {
    const c = codigo.trim();
    const s = sku.trim();
    if (!c || !s) continue;
    out.push({ codigo: c, sku: s, tenantId });
  }
  return out;
}

export function codigosDesdeRespuesta(
  productos: readonly { sku: string }[],
  tenantId: string,
  codigoLeido: string,
): CodigoDeTenant[] {
  if (!tenantId || !codigoLeido.trim()) return [];
  const out: CodigoDeTenant[] = [];
  for (const producto of productos) {
    const sku = producto.sku.trim();
    if (!sku) continue;
    out.push({ codigo: codigoLeido, sku, tenantId });
  }
  return out;
}

export function productosConSkuExacto(
  productos: readonly { sku: string }[],
  raw: string,
): { sku: string }[] {
  const norm = raw.trim().toUpperCase();
  if (!norm) return [];
  return productos.filter((p) => p.sku.trim().toUpperCase() === norm);
}

type RespuestaLectura = {
  ok: boolean;
  json: () => Promise<unknown>;
};

function productosDe(body: unknown): { sku: string }[] {
  if (!body || typeof body !== "object") return [];
  const lista = (body as { productos?: unknown }).productos;
  if (!Array.isArray(lista)) return [];
  const out: { sku: string }[] = [];
  for (const item of lista) {
    if (!item || typeof item !== "object") continue;
    const sku = (item as { sku?: unknown }).sku;
    if (typeof sku !== "string") continue;
    out.push({ sku });
  }
  return out;
}

// STOCK-E4: primero el catálogo de este tenant, después el código guardado,
// y al final el SKU exacto. Un parecido por nombre no alcanza.
export async function resolverLectura(args: {
  raw: string;
  tenantId: string;
  skusLocales: readonly string[];
  codigosLocales?: Readonly<Record<string, string>>;
  fetch: (url: string) => Promise<RespuestaLectura>;
}): Promise<ResolucionEscaneo> {
  // P1-58: el EAN del snapshot se resuelve antes del fetch. Sin esa entrada
  // el lector sigue pidiendo GET /api/products?codigo=.
  const local = resolverEscaneo(
    codigosDesdeCatalogoLocal(args.skusLocales, args.tenantId, args.codigosLocales),
    args.tenantId,
    args.raw,
  );
  if (local.estado !== "desconocido") return local;
  try {
    const porCodigo = await args.fetch("/api/products?codigo=" + encodeURIComponent(args.raw.trim()));
    if (porCodigo.ok) {
      const resuelto = resolverEscaneo(
        codigosDesdeRespuesta(productosDe(await porCodigo.json()), args.tenantId, args.raw),
        args.tenantId,
        args.raw,
      );
      if (resuelto.estado !== "desconocido") return resuelto;
    }
    const porNombre = await args.fetch("/api/products?q=" + encodeURIComponent(args.raw.trim()));
    if (!porNombre.ok) return { estado: "desconocido" };
    const exactos = productosConSkuExacto(productosDe(await porNombre.json()), args.raw);
    return resolverEscaneo(codigosDesdeRespuesta(exactos, args.tenantId, args.raw), args.tenantId, args.raw);
  } catch {
    return { estado: "desconocido" };
  }
}

export async function decodificarCuadro(
  cuadro: CanvasImageSource,
  tieneBarcodeDetector: boolean,
  lectores: LectoresDeCuadro,
): Promise<{ readonly codigo: string | null; readonly decodificador: DecodificadorCamara }> {
  const decodificador = elegirDecodificador(tieneBarcodeDetector);
  const crudo = decodificador === "barcode-detector"
    ? await lectores.barcodeDetector(cuadro)
    : await lectores.zxing(cuadro);
  const codigo = crudo?.trim() ?? "";
  return { codigo: codigo === "" ? null : codigo, decodificador };
}

function barcodeDetectorGlobal(): DetectorGlobal | null {
  const candidato = (globalThis as { BarcodeDetector?: DetectorGlobal }).BarcodeDetector;
  return typeof candidato === "function" ? candidato : null;
}

function cuadroDeVideo(video: HTMLVideoElement): ImageData | null {
  if (video.videoWidth === 0 || video.videoHeight === 0) return null;
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0);
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

async function leerConBarcodeDetector(video: HTMLVideoElement): Promise<string | null> {
  const Ctor = barcodeDetectorGlobal();
  if (!Ctor) return null;
  const det = new Ctor({ formats: FORMATOS_DETECTOR });
  const codes = await det.detect(video);
  const raw = codes[0]?.rawValue?.trim() ?? "";
  return raw === "" ? null : raw;
}

async function leerConZxing(video: HTMLVideoElement): Promise<string | null> {
  const cuadro = cuadroDeVideo(video);
  if (!cuadro) return null;
  const { readBarcodes } = await import("zxing-wasm/reader");
  const results = await readBarcodes(cuadro, { tryHarder: true });
  const text = results[0]?.text.trim() ?? "";
  return text === "" ? null : text;
}

async function leerUnCuadro(video: HTMLVideoElement): Promise<string | null> {
  const leido = await decodificarCuadro(video, barcodeDetectorGlobal() !== null, {
    barcodeDetector: () => leerConBarcodeDetector(video),
    zxing: () => leerConZxing(video),
  });
  return leido.codigo;
}

function esperar(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });
  });
}

export type MotivoCamaraNoDisponible = "contexto_inseguro" | "sin_api";

export type DepsSesionCamara = {
  readonly getUserMedia?: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
};

// TB-161: la venta manual sigue si la cámara no puede abrirse.
export function motivoCamaraNoDisponible(): MotivoCamaraNoDisponible | null {
  if (typeof globalThis.isSecureContext === "boolean" && !globalThis.isSecureContext) return "contexto_inseguro";
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) return "sin_api";
  return null;
}

export function mensajeCamaraNoDisponible(motivo: MotivoCamaraNoDisponible): string {
  if (motivo === "contexto_inseguro") {
    return "La cámara necesita HTTPS o localhost. Seguí con el buscador o el lector.";
  }
  return "Este navegador no soporta la cámara. Usá el buscador o el lector.";
}

export function mensajeErrorCamara(error: unknown): string {
  const nombre = error && typeof error === "object" && "name" in error ? String((error as { name: unknown }).name) : "";
  if (nombre === "NotAllowedError" || nombre === "PermissionDeniedError") {
    return "Permiso de cámara denegado. Podés buscar el código a mano o usar el lector.";
  }
  if (nombre === "NotFoundError" || nombre === "DevicesNotFoundError") {
    return "No hay cámara en este dispositivo. Usá el buscador o el lector.";
  }
  if (nombre === "NotSupportedError" || nombre === "OverconstrainedError") {
    return "La cámara no está disponible. Usá el buscador o el lector.";
  }
  return "No se pudo abrir la cámara. Usá el buscador o el lector.";
}

export type SesionCamara = {
  leer(): Promise<string | null>;
  cerrar(): void;
};

export function sesionCamara(video: HTMLVideoElement, deps: DepsSesionCamara = {}): SesionCamara {
  const pedirStream = deps.getUserMedia
    ?? ((constraints: MediaStreamConstraints) => navigator.mediaDevices.getUserMedia(constraints));
  const ac = new AbortController();
  let stream: MediaStream | null = null;
  const cerrar = (): void => {
    ac.abort();
    for (const track of stream?.getTracks() ?? []) track.stop();
    stream = null;
    video.srcObject = null;
    video.hidden = true;
  };
  const leer = async (): Promise<string | null> => {
    stream = await pedirStream({ video: { facingMode: "environment" } });
    if (ac.signal.aborted) {
      cerrar();
      return null;
    }
    video.srcObject = stream;
    video.hidden = false;
    await video.play();
    while (!ac.signal.aborted) {
      const codigo = await leerUnCuadro(video);
      if (codigo) {
        cerrar();
        return codigo;
      }
      await esperar(200, ac.signal);
    }
    cerrar();
    return null;
  };
  return { leer, cerrar };
}
