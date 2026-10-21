import { createHash } from "node:crypto";
import {
  parsearCsvStock,
  parsearFilasStock,
  type ImportError,
  type ParseoKo,
  type ParseoOk,
} from "../modules/inventario/importacion.js";
import { leerXlsx } from "./importacion-xlsx.js";
import { leerStockActualPorSkus } from "./repos/catalogo.js";

// El hash y los límites se calculan una vez aquí para que la confirmación
// valide contra la misma lectura que muestra la vista previa.

export type FormatoImportacion = "csv" | "xlsx";

export type ArchivoImportacion = {
  nombre: string;
  bytes: number;
  formato: FormatoImportacion;
  sha256: string;
  shaDeclarado: string | null;
  advertenciaCodificacion: boolean;
  textoCsv: string | null;
  filasXlsx: unknown[][] | null;
};

export type LecturaArchivo =
  | { ok: true; archivo: ArchivoImportacion }
  | { ok: false; respuesta: Response };

const MAX_BYTES = 2 * 1024 * 1024;
const FORMATOS: Readonly<Record<string, FormatoImportacion>> = { csv: "csv", xlsx: "xlsx" };

function archivoFalta(): Response {
  return Response.json({ error: "falta el archivo", codigo: "ARCHIVO_FALTA" }, { status: 422 });
}

function archivoGrande(): Response {
  return Response.json({ error: "archivo demasiado grande", codigo: "ARCHIVO_GRANDE" }, { status: 413 });
}

function formatoNoSoportado(): Response {
  return Response.json({ error: "formato no soportado", codigo: "FORMATO_NO_SOPORTADO" }, { status: 415 });
}

export async function leerArchivoImportacion(request: Request): Promise<LecturaArchivo> {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return {
      ok: false,
      respuesta: Response.json({ error: "formulario inválido", codigo: "FORMULARIO_INVALIDO" }, { status: 422 }),
    };
  }

  const archivo = form.get("archivo");
  if (!(archivo instanceof File)) return { ok: false, respuesta: archivoFalta() };
  if (archivo.size > MAX_BYTES) return { ok: false, respuesta: archivoGrande() };

  const nombre = archivo.name;
  const punto = nombre.lastIndexOf(".");
  const extension = punto >= 0 ? nombre.slice(punto + 1).toLowerCase() : "";
  const formato = FORMATOS[extension];
  if (!formato) return { ok: false, respuesta: formatoNoSoportado() };

  const arrayBuffer = await archivo.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const sha256 = createHash("sha256").update(buffer).digest("hex");
  const shaCrudo = form.get("archivo_sha256");
  const shaDeclarado = typeof shaCrudo === "string" ? shaCrudo.trim().toLowerCase() : null;

  if (formato === "csv") {
    const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(buffer);
    const reemplazo = utf8.includes("\uFFFD");
    const texto = reemplazo
      ? new TextDecoder("windows-1252").decode(buffer).replace(/^(\uFEFF|\u00EF\u00BB\u00BF)/, "")
      : utf8.replace(/^\uFEFF/, "");
    return {
      ok: true,
      archivo: {
        nombre,
        bytes: archivo.size,
        formato,
        sha256,
        shaDeclarado,
        advertenciaCodificacion: reemplazo,
        textoCsv: texto,
        filasXlsx: null,
      },
    };
  }

  try {
    const filas = await leerXlsx(arrayBuffer);
    return {
      ok: true,
      archivo: {
        nombre,
        bytes: archivo.size,
        formato,
        sha256,
        shaDeclarado,
        advertenciaCodificacion: false,
        textoCsv: null,
        filasXlsx: filas,
      },
    };
  } catch {
    return {
      ok: false,
      respuesta: Response.json({ error: "no se pudo leer el archivo xlsx", codigo: "ARCHIVO_INVALIDO" }, { status: 422 }),
    };
  }
}

export function parsearArchivo(
  archivo: ArchivoImportacion,
  catalogo: ReadonlyMap<string, number>,
): ParseoOk | ParseoKo {
  if (archivo.formato === "csv") return parsearCsvStock(archivo.textoCsv ?? "", catalogo);
  return parsearFilasStock(archivo.filasXlsx ?? [], catalogo);
}

export async function parsearConCatalogo(archivo: ArchivoImportacion): Promise<ParseoOk | ParseoKo> {
  const primerParseo = parsearArchivo(archivo, new Map());
  if (!primerParseo.ok) return primerParseo;
  const skus = primerParseo.filas.flatMap((f) => (f.estado === "error" ? [] : [f.sku]));
  const catalogo = await leerStockActualPorSkus(skus);
  const parseo = parsearArchivo(archivo, catalogo);
  if (!parseo.ok) return parseo;
  return {
    ...parseo,
    advertenciaCodificacion: parseo.advertenciaCodificacion || archivo.advertenciaCodificacion,
  };
}

export function respuestaErrorImportacion(error: ImportError): Response {
  if (error.codigo === "COLUMNAS_FALTANTES") {
    return Response.json(
      { error: error.mensaje, codigo: error.codigo, columnas: error.columnas, mensaje: error.mensaje },
      { status: 422 },
    );
  }
  return Response.json({ error: error.mensaje, codigo: error.codigo, mensaje: error.mensaje }, { status: 422 });
}
